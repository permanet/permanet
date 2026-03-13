import { chromium } from 'playwright';
import { mkdir, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';

const CAPTURES_DIR = 'captures';

/**
 * Calculate the total size of all files in a directory (in bytes).
 */
function getDirectorySize(dirPath) {
  let total = 0;
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    const s = statSync(fullPath);
    if (s.isFile()) total += s.size;
  }
  return total;
}

// Ad/tracker domains to block during compressed captures
const BLOCKED_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googletagmanager.com',
  'facebook.net', 'analytics.google.com', 'hotjar.com', 'intercom.io',
  'adnxs.com', 'moatads.com', 'scorecardresearch.com', 'taboola.com',
  'outbrain.com', 'pubmatic.com', 'rubiconproject.com', 'amazon-adsystem.com',
  'criteo.com', 'quantserve.com', 'adsrvr.org', 'casalemedia.com',
];

export async function captureUrl(submissionId, url, videoTimestampOffset = 0, options = {}) {
  const { useCompression = false } = options;
  const captureDir = join(CAPTURES_DIR, submissionId);
  await mkdir(captureDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Permanet/1.0 (Web Archive Bot)',
    });

    const page = await context.newPage();

    // Block ad/tracker domains if compression is enabled
    if (useCompression) {
      await page.route('**/*', (route) => {
        const reqUrl = route.request().url();
        if (BLOCKED_DOMAINS.some(domain => reqUrl.includes(domain))) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    // Collect all loaded resources
    const assets = [];
    page.on('response', async (response) => {
      try {
        const resourceUrl = response.url();
        const contentType = response.headers()['content-type'] || '';
        if (
          response.ok() &&
          (contentType.startsWith('image/') ||
            contentType.startsWith('text/css') ||
            contentType.startsWith('application/javascript') ||
            contentType.startsWith('font/'))
        ) {
          const body = await response.body().catch(() => null);
          if (body) {
            assets.push({
              url: resourceUrl,
              contentType,
              data: body,
            });
          }
        }
      } catch {
        // Some resources may fail to capture — that's ok
      }
    });

    // Navigate and wait for full load (60s timeout for heavy news sites)
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // Wait a bit for lazy-loaded content
    await page.waitForTimeout(2000);

    // Extract metadata + platform-specific data
    const metadata = await page.evaluate(() => {
      const getMeta = (name) => {
        const el =
          document.querySelector(`meta[property="${name}"]`) ||
          document.querySelector(`meta[name="${name}"]`);
        return el ? el.getAttribute('content') : null;
      };

      // Platform-specific extraction
      const platform = {};
      const host = window.location.hostname.replace('www.', '');

      // Helper: find first <time datetime="..."> from multiple selectors
      const findTime = (...selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            const dt = el.getAttribute('datetime');
            if (dt) return dt;
          }
        }
        return null;
      };

      // X.com / Twitter
      if (host === 'x.com' || host === 'twitter.com') {
        // Try multiple selectors for the post timestamp
        platform.postTimestamp = findTime(
          'article time[datetime]',
          'time[datetime]',
          '[data-testid="tweetText"] ~ a time[datetime]',
        );
        // Also try og:article:published_time or description parsing
        if (!platform.postTimestamp) {
          const pubTime = getMeta('og:article:published_time')
            || getMeta('article:published_time');
          if (pubTime) platform.postTimestamp = pubTime;
        }

        // Get handle from DOM
        const articleUserEl = document.querySelector('article [data-testid="User-Name"]');
        if (articleUserEl) {
          const spans = articleUserEl.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent.trim();
            if (text.startsWith('@')) { platform.handle = text; break; }
          }
          for (const span of spans) {
            const text = span.textContent.trim();
            if (text && !text.startsWith('@') && text.length > 1 && !text.includes('·')) {
              platform.displayName = text;
              break;
            }
          }
        }
        // Fallback: try to get handle from page title ("Username on X: ...")
        if (!platform.handle) {
          const titleMatch = document.title.match(/\(@(\w+)\)/);
          if (titleMatch) platform.handle = `@${titleMatch[1]}`;
        }
      }

      // YouTube
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const channelEl = document.querySelector('#channel-name a, ytd-channel-name a, [itemprop="author"] [itemprop="name"]');
        if (channelEl) platform.channelName = channelEl.textContent.trim();
        const publishEl = document.querySelector('[itemprop="datePublished"]');
        if (publishEl) platform.publishDate = publishEl.getAttribute('content');
        if (!platform.publishDate) {
          platform.publishDate = getMeta('og:article:published_time')
            || getMeta('article:published_time');
        }
      }

      // Reddit
      if (host === 'reddit.com' || host === 'old.reddit.com') {
        const subredditEl = document.querySelector('[data-testid="subreddit-name"], .subreddit');
        if (subredditEl) platform.subreddit = subredditEl.textContent.trim();
        const authorEl = document.querySelector('[data-testid="post_author_link"], .author');
        if (authorEl) platform.author = authorEl.textContent.trim();
        platform.postTimestamp = findTime(
          'time[datetime]',
          '[data-testid="post-timestamp"] time[datetime]',
        );
      }

      // Instagram
      if (host === 'instagram.com') {
        platform.postTimestamp = findTime('time[datetime]');
        // Try to get handle from URL via canonical
        if (!platform.handle) {
          const canon = document.querySelector('link[rel="canonical"]')?.href;
          if (canon) {
            const m = canon.match(/instagram\.com\/([^/]+)\//);
            if (m && m[1] !== 'p' && m[1] !== 'reel') platform.handle = `@${m[1]}`;
          }
        }
      }

      // TikTok
      if (host === 'tiktok.com') {
        platform.postTimestamp = findTime('time[datetime]');
        if (!platform.postTimestamp) {
          platform.postTimestamp = getMeta('og:article:published_time')
            || getMeta('article:published_time');
        }
      }

      // LinkedIn
      if (host === 'linkedin.com') {
        platform.postTimestamp = findTime('time[datetime]');
      }

      // Facebook
      if (host === 'facebook.com' || host === 'fb.com') {
        platform.postTimestamp = findTime('abbr[data-utime]', 'time[datetime]');
      }

      // Threads
      if (host === 'threads.net') {
        platform.postTimestamp = findTime('time[datetime]');
        if (!platform.handle) {
          const titleMatch = document.title.match(/@(\w+)/);
          if (titleMatch) platform.handle = `@${titleMatch[1]}`;
        }
      }

      // Detect login walls / blocked content
      const captureWarning = (() => {
        const title = document.title.toLowerCase();
        const bodyText = (document.body?.innerText || '').toLowerCase().slice(0, 2000);
        const host = window.location.hostname.replace('www.', '');

        // Instagram login wall
        if (host === 'instagram.com') {
          if (title.includes('login') || bodyText.includes('log in to see') || bodyText.includes('sign up to see')) {
            return 'This Instagram page requires authentication. The Permanet Chrome Extension (coming soon) will let you capture it directly from your browser.';
          }
        }

        // X.com / Twitter login wall
        if (host === 'x.com' || host === 'twitter.com') {
          if (title === 'x' || title.includes('log in') || bodyText.includes('sign in to x') || bodyText.includes('log in to x')) {
            return 'This X.com page requires authentication. The Permanet Chrome Extension (coming soon) will let you capture it directly from your browser.';
          }
        }

        // Facebook
        if (host === 'facebook.com' || host === 'fb.com') {
          if (title.includes('log in') || title.includes('facebook - log') || bodyText.includes('you must log in')) {
            return 'This Facebook page requires authentication. The Permanet Chrome Extension (coming soon) will let you capture it directly from your browser.';
          }
        }

        // LinkedIn
        if (host === 'linkedin.com') {
          if (title.includes('sign in') || title.includes('log in') || bodyText.includes('sign in to view')) {
            return 'This LinkedIn page requires authentication. The Permanet Chrome Extension (coming soon) will let you capture it directly from your browser.';
          }
        }

        // TikTok
        if (host === 'tiktok.com') {
          if (title.includes('log in') || bodyText.includes('log in to tiktok')) {
            return 'This TikTok page requires authentication. The Permanet Chrome Extension (coming soon) will let you capture it directly from your browser.';
          }
        }

        // Generic bot-block / CAPTCHA detection
        if (
          bodyText.includes('you have been blocked') ||
          bodyText.includes('we suspect that you\'re a robot') ||
          bodyText.includes('suspect you are a robot') ||
          bodyText.includes('access denied') ||
          bodyText.includes('please verify you are a human') ||
          bodyText.includes('checking your browser') ||
          bodyText.includes('enable javascript and cookies') ||
          bodyText.includes('are you a robot') ||
          (title.includes('blocked') && bodyText.includes('robot')) ||
          (title.includes('access denied') || title.includes('403 forbidden'))
        ) {
          return 'This page blocked automated access. The Permanet Chrome Extension (coming soon) will let you capture it directly from your browser.';
        }

        return null;
      })();

      return {
        title: document.title,
        description: getMeta('description') || getMeta('og:description'),
        ogImage: getMeta('og:image'),
        ogTitle: getMeta('og:title'),
        ogUrl: getMeta('og:url'),
        canonical:
          document.querySelector('link[rel="canonical"]')?.href || null,
        platform,
        captureWarning,
      };
    });

    // Full-page screenshot (JPEG 85% for compressed, PNG for full fidelity)
    const screenshotExt = useCompression ? 'jpeg' : 'png';
    const screenshotPath = join(captureDir, `screenshot.${screenshotExt}`);
    const screenshotOpts = { path: screenshotPath, fullPage: true };
    if (useCompression) {
      screenshotOpts.type = 'jpeg';
      screenshotOpts.quality = 85;
    }
    await page.screenshot(screenshotOpts);

    // Capture DOM
    const domContent = await page.content();
    const domPath = join(captureDir, 'dom.html');
    await writeFile(domPath, domContent, 'utf-8');

    // Check for video elements and capture stills
    const videoStills = [];
    const videos = await page.$$('video');
    for (let i = 0; i < videos.length; i++) {
      try {
        const still = await captureVideoStill(
          page,
          videos[i],
          videoTimestampOffset,
          captureDir,
          i,
        );
        if (still) videoStills.push(still);
      } catch (err) {
        console.warn(`Failed to capture video still ${i}:`, err.message);
      }
    }

    // Save assets
    const savedAssets = [];
    for (let i = 0; i < assets.length; i++) {
      const ext = getExtension(assets[i].contentType);
      const filename = `asset_${i}${ext}`;
      const assetPath = join(captureDir, filename);
      await writeFile(assetPath, assets[i].data);
      savedAssets.push({
        url: assets[i].url,
        contentType: assets[i].contentType,
        filename,
      });
    }

    // Save metadata
    const metadataPath = join(captureDir, 'metadata.json');
    const fullMetadata = {
      url,
      capturedAt: new Date().toISOString(),
      ...metadata,
      assetCount: savedAssets.length,
      videoStills: videoStills.length,
    };
    await writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

    await browser.close();

    // Calculate total capture size
    const totalSizeBytes = getDirectorySize(captureDir);

    return {
      captureDir,
      screenshotPath,
      domPath,
      metadata: fullMetadata,
      assets: savedAssets,
      videoStills,
      totalSizeBytes,
    };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw new Error(`Capture failed: ${err.message}`);
  }
}

async function captureVideoStill(
  page,
  videoElement,
  offsetSeconds,
  captureDir,
  index,
) {
  // Try to set currentTime and capture a frame via canvas
  const result = await page.evaluate(
    async ({ offset, idx }) => {
      const videos = document.querySelectorAll('video');
      const video = videos[idx];
      if (!video || !video.src) return null;

      return new Promise((resolve) => {
        video.currentTime = offset;
        video.addEventListener(
          'seeked',
          () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 360;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0);
              resolve(canvas.toDataURL('image/png'));
            } catch {
              resolve(null);
            }
          },
          { once: true },
        );

        // Timeout fallback
        setTimeout(() => resolve(null), 5000);
      });
    },
    { offset: offsetSeconds, idx: index },
  );

  if (!result) return null;

  const base64Data = result.replace(/^data:image\/png;base64,/, '');
  const filename = `video_still_${index}.png`;
  const path = join(captureDir, filename);
  await writeFile(path, Buffer.from(base64Data, 'base64'));
  return { filename, offsetSeconds };
}

function getExtension(contentType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'text/css': '.css',
    'application/javascript': '.js',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
  };
  for (const [key, ext] of Object.entries(map)) {
    if (contentType.startsWith(key)) return ext;
  }
  return '.bin';
}
