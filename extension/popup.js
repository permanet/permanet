const API_BASE = 'https://thepermanet.com';

const $ = (sel) => document.querySelector(sel);

// ── UI helpers ──────────────────────────────────────────────
function showProgress() {
  $('#initial-state').style.display = 'none';
  $('#progress-state').classList.add('active');
  $('#error-msg').classList.remove('active');
}

function setStep(stepId) {
  const steps = ['step-capture', 'step-upload', 'step-hash', 'step-done'];
  const idx = steps.indexOf(stepId);
  steps.forEach((s, i) => {
    const el = $(`#${s}`);
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
}

function showSuccess(title, archiveUrl) {
  $('#progress-state').classList.remove('active');
  $('#success-state').classList.add('active');
  $('#archive-title').textContent = title || '';
  const link = $('#view-link');
  link.href = archiveUrl;
  link.addEventListener('click', () => chrome.tabs.create({ url: archiveUrl }));
}

function showError(msg) {
  const el = $('#error-msg');
  el.textContent = msg;
  el.classList.add('active');
  $('#archive-btn').disabled = false;
  $('#progress-state').classList.remove('active');
  $('#initial-state').style.display = 'block';
}

// ── Page metadata extraction (runs in page context) ─────────
function extractPageData() {
  const getMeta = (name) => {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
  };

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

  const platform = {};
  const host = window.location.hostname.replace('www.', '');

  // X.com / Twitter
  if (host === 'x.com' || host === 'twitter.com') {
    platform.postTimestamp = findTime(
      'article time[datetime]',
      'time[datetime]',
      '[data-testid="tweetText"] ~ a time[datetime]',
    );
    if (!platform.postTimestamp) {
      const pubTime = getMeta('og:article:published_time') || getMeta('article:published_time');
      if (pubTime) platform.postTimestamp = pubTime;
    }
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
      platform.publishDate = getMeta('og:article:published_time') || getMeta('article:published_time');
    }
  }

  // Reddit
  if (host === 'reddit.com' || host === 'old.reddit.com') {
    const subredditEl = document.querySelector('[data-testid="subreddit-name"], .subreddit');
    if (subredditEl) platform.subreddit = subredditEl.textContent.trim();
    const authorEl = document.querySelector('[data-testid="post_author_link"], .author');
    if (authorEl) platform.author = authorEl.textContent.trim();
    platform.postTimestamp = findTime('time[datetime]', '[data-testid="post-timestamp"] time[datetime]');
  }

  // Instagram
  if (host === 'instagram.com') {
    platform.postTimestamp = findTime('time[datetime]');
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
      platform.postTimestamp = getMeta('og:article:published_time') || getMeta('article:published_time');
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

  return {
    dom: document.documentElement.outerHTML,
    metadata: {
      title: document.title,
      description: getMeta('description') || getMeta('og:description'),
      ogImage: getMeta('og:image'),
      ogTitle: getMeta('og:title'),
      ogUrl: getMeta('og:url'),
      canonical: document.querySelector('link[rel="canonical"]')?.href || null,
      platform,
    },
  };
}

// ── Main archive flow ───────────────────────────────────────
async function archivePage() {
  const btn = $('#archive-btn');
  btn.disabled = true;

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('Cannot archive browser internal pages.');
    }

    showProgress();

    // Step 1: Capture screenshot + DOM + metadata
    setStep('step-capture');

    // Screenshot (visible viewport)
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100,
    });

    // Inject content script to get DOM + metadata
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData,
    });

    if (!result?.result) {
      throw new Error('Failed to capture page content. The page may block extensions.');
    }

    const { dom, metadata } = result.result;

    // Step 2: Upload to backend
    setStep('step-upload');

    const response = await fetch(`${API_BASE}/api/extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: tab.url,
        screenshot: screenshotDataUrl,
        dom,
        metadata,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Server error (${response.status})`);
    }

    const data = await response.json();

    // Step 3: Processing on server
    setStep('step-hash');

    // Poll for completion (server processes async after initial save)
    let archiveData = data;
    if (data.status === 'processing') {
      // Wait for completion — poll every 2 seconds, max 60 seconds
      const archiveUrl = `${API_BASE}/api/archive/${data.submissionId}`;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const pollRes = await fetch(archiveUrl);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.status === 'complete' || pollData.status === 'failed') {
              archiveData = pollData;
              break;
            }
          }
        } catch {
          // Continue polling
        }
      }
    }

    // Step 4: Done
    setStep('step-done');
    await new Promise((r) => setTimeout(r, 500));

    const archivePageUrl = `${API_BASE}/archive/${data.submissionId}`;
    showSuccess(archiveData.title || metadata.title, archivePageUrl);
  } catch (err) {
    showError(err.message || 'Archive failed. Please try again.');
  }
}

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try {
      const u = new URL(tab.url);
      $('#current-url').textContent = u.hostname + u.pathname.slice(0, 60) + (u.pathname.length > 60 ? '...' : '');
    } catch {
      $('#current-url').textContent = tab.url.slice(0, 80);
    }
  }

  $('#archive-btn').addEventListener('click', archivePage);
});
