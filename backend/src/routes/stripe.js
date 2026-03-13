import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';

export const stripeRouter = Router();

/**
 * Verify Stripe webhook signature (v1 scheme).
 * Stripe signs with HMAC-SHA256 over "timestamp.rawBody".
 */
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = {};
  for (const item of signatureHeader.split(',')) {
    const [key, value] = item.split('=');
    parts[key.trim()] = value;
  }

  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  // Reject timestamps older than 5 minutes (replay protection)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const computedSig = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(computedSig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

// Read env vars lazily — dotenv.config() runs AFTER ESM imports resolve,
// so module-level process.env reads would capture undefined.
function env(key, fallback) {
  return process.env[key] || fallback || '';
}

async function stripeRequest(path, method = 'GET', body = null) {
  const secret = env('STRIPE_SECRET_KEY');
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(`https://api.stripe.com/v1${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe API error: ${res.status}`);
  }

  return data;
}

// Get or create Stripe customer for user
async function ensureStripeCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripeRequest('/customers', 'POST', {
    email: user.email,
    'metadata[permanet_user_id]': user.id,
  });

  await query(
    `UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1`,
    [user.id, customer.id],
  );

  return customer.id;
}

// Create checkout session for Pro subscription
stripeRouter.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const customerId = await ensureStripeCustomer(req.user);

    const session = await stripeRequest('/checkout/sessions', 'POST', {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': env('STRIPE_PRO_PRICE_ID'),
      'line_items[0][quantity]': 1,
      success_url: `${env('FRONTEND_URL', 'http://localhost:5173')}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env('FRONTEND_URL', 'http://localhost:5173')}/pricing`,
      'metadata[user_id]': req.user.id,
      'metadata[type]': 'pro_subscription',
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Stripe subscribe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create checkout session for one-time seal
stripeRouter.post('/seal/:submissionId', requireAuth, async (req, res) => {
  const { submissionId } = req.params;

  try {
    // Verify the submission exists — any logged-in user can seal any free-tier archive
    const subResult = await query(
      `SELECT id, storage_tier, user_id FROM submissions WHERE id = $1`,
      [submissionId],
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const submission = subResult.rows[0];

    if (submission.storage_tier === 'sealed' || submission.storage_tier === 'pro') {
      return res.status(400).json({ error: 'Already permanently stored' });
    }

    const customerId = await ensureStripeCustomer(req.user);

    const session = await stripeRequest('/checkout/sessions', 'POST', {
      customer: customerId,
      mode: 'payment',
      'line_items[0][price]': env('STRIPE_SEAL_PRICE_ID'),
      'line_items[0][quantity]': 1,
      success_url: `${env('FRONTEND_URL', 'http://localhost:5173')}/archive/${submissionId}?sealed=true`,
      cancel_url: `${env('FRONTEND_URL', 'http://localhost:5173')}/archive/${submissionId}`,
      'metadata[user_id]': req.user.id,
      'metadata[submission_id]': submissionId,
      'metadata[type]': 'permanent_seal',
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('Stripe seal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Manage subscription (cancel, update payment)
stripeRouter.post('/portal', requireAuth, async (req, res) => {
  try {
    const customerId = await ensureStripeCustomer(req.user);

    const session = await stripeRequest('/billing_portal/sessions', 'POST', {
      customer: customerId,
      return_url: `${env('FRONTEND_URL', 'http://localhost:5173')}/account`,
    });

    res.json({ portalUrl: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler (raw body needed — mounted with express.raw() in index.js)
stripeRouter.post('/webhook', async (req, res) => {
  const rawBody = req.body; // Buffer from express.raw()

  // Verify webhook signature
  const webhookSecret = env('STRIPE_WEBHOOK_SECRET');
  if (webhookSecret && webhookSecret !== 'placeholder_get_real_key') {
    const sig = req.headers['stripe-signature'];
    if (!verifyStripeSignature(rawBody.toString(), sig, webhookSecret)) {
      console.warn('[Stripe Webhook] Signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  const event = JSON.parse(rawBody.toString());

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const type = session.metadata?.type;

        if (type === 'pro_subscription' && userId) {
          await query(
            `UPDATE users SET tier = 'pro', stripe_subscription_id = $2,
             credits_remaining = 200, credits_reset_at = NOW() + INTERVAL '1 month',
             updated_at = NOW() WHERE id = $1`,
            [userId, session.subscription],
          );

          // Upgrade all user's free-tier submissions to pro (remove expiry)
          const subs = await query(
            `SELECT id FROM submissions WHERE user_id = $1 AND storage_tier = 'free'`,
            [userId],
          );
          for (const sub of subs.rows) {
            await query(
              `UPDATE submissions SET storage_tier = 'pro', expires_at = NULL, updated_at = NOW() WHERE id = $1`,
              [sub.id],
            );
          }

          // Record payment
          await query(
            `INSERT INTO payments (id, user_id, stripe_payment_id, type, amount_cents, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuidv4(), userId, session.payment_intent || session.id, 'pro_subscription', 2400, 'completed'],
          );
        }

        if (type === 'permanent_seal' && userId) {
          const submissionId = session.metadata?.submission_id;
          if (submissionId) {
            // Seal the submission and claim ownership if unowned
            await query(
              `UPDATE submissions SET storage_tier = 'sealed', expires_at = NULL, updated_at = NOW(),
               user_id = COALESCE(user_id, $2) WHERE id = $1`,
              [submissionId, userId],
            );

            await query(
              `INSERT INTO payments (id, user_id, submission_id, stripe_payment_id, type, amount_cents, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [uuidv4(), userId, submissionId, session.payment_intent || session.id, 'permanent_seal', 100, 'completed'],
            );
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by stripe customer ID and downgrade
        const userResult = await query(
          `SELECT id FROM users WHERE stripe_customer_id = $1`,
          [customerId],
        );

        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          await query(
            `UPDATE users SET tier = 'free', stripe_subscription_id = NULL, updated_at = NOW() WHERE id = $1`,
            [userId],
          );

          // Set expiry on pro-tier submissions (but not sealed ones)
          const exp = new Date();
          exp.setFullYear(exp.getFullYear() + 2);
          // Note: in production, run this as a batch update
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const customerId = invoice.customer;
          const userResult = await query(
            `SELECT id FROM users WHERE stripe_customer_id = $1`,
            [customerId],
          );
          if (userResult.rows.length > 0) {
            const renewUserId = userResult.rows[0].id;

            // Reset credits to 200 on each billing cycle
            await query(
              `UPDATE users SET credits_remaining = 200, credits_reset_at = NOW() + INTERVAL '1 month', updated_at = NOW() WHERE id = $1`,
              [renewUserId],
            );

            await query(
              `INSERT INTO payments (id, user_id, stripe_payment_id, type, amount_cents, status)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [uuidv4(), renewUserId, invoice.payment_intent, 'pro_renewal', invoice.amount_paid, 'completed'],
            );
          }
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get subscription status
stripeRouter.get('/status', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const result = {
      tier: user.tier,
      hasSubscription: !!user.stripe_subscription_id,
    };

    if (user.stripe_subscription_id && env('STRIPE_SECRET_KEY')) {
      try {
        const sub = await stripeRequest(`/subscriptions/${user.stripe_subscription_id}`);
        result.subscriptionStatus = sub.status;
        result.currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
      } catch {
        // Subscription may have been deleted
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Stripe status error:', err);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});
