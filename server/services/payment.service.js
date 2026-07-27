const { getDb, saveDb, getSetting, transaction } = require('../db');
const { createLogger } = require('../helpers/logger');

const logger = createLogger('payment-service');

const PLAN_DURATIONS = {
  monthly: 30 * 24 * 60 * 60,
  annual: 365 * 24 * 60 * 60,
};

const PLAN_AMOUNTS = {
  monthly: 12,
  annual: 89,
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    return require('stripe')(key);
  } catch {
    return null;
  }
}

async function getStripePrices() {
  const monthlyPriceId = await getSetting('stripe_monthly_price_id', process.env.STRIPE_MONTHLY_PRICE_ID || '');
  const annualPriceId = await getSetting('stripe_annual_price_id', process.env.STRIPE_ANNUAL_PRICE_ID || '');
  return { monthlyPriceId, annualPriceId };
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

async function createCheckoutSession(subscriberId, plan) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const db = await getDb();
  const subResult = db.exec(`SELECT id, email, name, stripe_customer_id FROM subscribers WHERE id = ?`, [subscriberId]);
  if (!subResult.length || !subResult[0].values.length) throw new Error('Subscriber not found');
  const sub = subResult[0].values[0];
  const subscriberIdDb = sub[0], email = sub[1], name = sub[2], existingCustomerId = sub[3];

  const { monthlyPriceId, annualPriceId } = await getStripePrices();
  const priceId = plan === 'annual' ? annualPriceId : monthlyPriceId;
  if (!priceId) throw new Error('Stripe Price ID not configured for plan: ' + plan);

  let customerId = existingCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email, name, metadata: { subscriber_id: String(subscriberIdDb) } });
    customerId = customer.id;
    db.run(`UPDATE subscribers SET stripe_customer_id = ? WHERE id = ?`, [customerId, subscriberIdDb]);
    saveDb();
  }

  const successUrl = (await getSetting('domain', 'http://localhost:3001')) + '/payment-status?session_id={CHECKOUT_SESSION_ID}';
  const cancelUrl = (await getSetting('domain', 'http://localhost:3001')) + '/plans';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { subscriber_id: String(subscriberIdDb), plan },
  });

  db.run(
    `INSERT INTO payments (subscriber_id, amount, currency, status, provider_checkout_session_id, provider_customer_id, plan)
     VALUES (?, ?, 'usd', 'pending', ?, ?, ?)`,
    [subscriberIdDb, PLAN_AMOUNTS[plan], session.id, customerId, plan]
  );
  saveDb();

  logger.info('Checkout session created', { subscriberId: subscriberIdDb, sessionId: session.id, plan });
  return { url: session.url, sessionId: session.id };
}

async function getPaymentStatus(subscriberId) {
  const db = await getDb();
  const result = db.exec(
    `SELECT p.id, p.amount, p.currency, p.status, p.plan, p.paid_at, p.created_at
     FROM payments p WHERE p.subscriber_id = ?
     ORDER BY p.created_at DESC LIMIT 1`, [subscriberId]
  );
  if (!result.length || !result[0].values.length) return null;
  const r = result[0].values[0];
  return {
    id: r[0], amount: r[1], currency: r[2], status: r[3], plan: r[4], paid_at: r[5], created_at: r[6],
  };
}

async function getSubscriptionStatus(subscriberId) {
  const db = await getDb();
  const result = db.exec(
    `SELECT plan, status, subscription_expires_at, next_billing_date, stripe_subscription_id
     FROM subscribers WHERE id = ?`, [subscriberId]
  );
  if (!result.length || !result[0].values.length) return null;
  const r = result[0].values[0];
  const plan = r[0], status = r[1], expiresAt = r[2], nextBilling = r[3], stripeSubId = r[4];
  const now = new Date();
  const isActive = status === 'active' || (status === 'cancelled' && expiresAt && new Date(expiresAt) > now);
  return {
    plan,
    status,
    active: isActive,
    expires_at: expiresAt,
    next_billing_date: nextBilling,
    stripe_subscription_id: stripeSubId,
  };
}

async function handleWebhookEvent(event) {
  const db = await getDb();
  const eventType = event.type;
  const eventId = event.id;

  const existing = db.exec(`SELECT 1 FROM payment_events WHERE event_id = ?`, [eventId]);
  if (existing.length && existing[0].values.length) {
    logger.info('Duplicate webhook event, skipping', { eventId, eventType });
    return { idempotent: true };
  }

  db.run(`INSERT INTO payment_events (event_id, event_type, payload) VALUES (?, ?, ?)`, [eventId, eventType, JSON.stringify(event.data)]);

  switch (eventType) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(db, event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(db, event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(db, event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(db, event.data.object);
      break;
    default:
      logger.info('Unhandled webhook event', { eventType });
  }

  saveDb();
  return { processed: true, eventType };
}

async function handleCheckoutCompleted(db, session) {
  const subscriberId = session.metadata?.subscriber_id ? parseInt(session.metadata.subscriber_id) : null;
  const plan = session.metadata?.plan;
  if (!subscriberId || !plan) {
    logger.error('Missing metadata in checkout.session.completed', { sessionId: session.id });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (PLAN_DURATIONS[plan] || PLAN_DURATIONS.monthly) * 1000);

  const manualGrant = db.exec(
    `SELECT id FROM manual_access_grants
     WHERE subscriber_id = ? AND action = 'revoke' AND created_at > datetime('now', '-1 hour')
     ORDER BY created_at DESC LIMIT 1`, [subscriberId]
  );
  if (manualGrant.length && manualGrant[0].values.length) {
    logger.warn('Recent manual revoke exists, skipping webhook update', { subscriberId });
    return;
  }

  const subResult = db.exec(`SELECT subscription_expires_at FROM subscribers WHERE id = ?`, [subscriberId]);
  const currentExpires = subResult.length && subResult[0].values.length ? subResult[0].values[0][0] : null;
  let finalExpires = expiresAt.toISOString();
  if (currentExpires && new Date(currentExpires) > now) {
    finalExpires = new Date(Math.max(new Date(currentExpires).getTime(), expiresAt.getTime())).toISOString();
  }

  db.run(
    `UPDATE subscribers SET plan = ?, status = 'active', subscription_started_at = ?,
     subscription_expires_at = ?, next_billing_date = ?,
     stripe_subscription_id = ?, email_confirmed = 1 WHERE id = ?`,
    [plan, now.toISOString(), finalExpires, finalExpires, session.subscription, subscriberId]
  );

  db.run(
    `UPDATE payments SET status = 'succeeded', paid_at = ?,
     provider_payment_intent_id = ?, provider_customer_id = ?
     WHERE provider_checkout_session_id = ? AND status = 'pending'`,
    [now.toISOString(), session.payment_intent, session.customer, session.id]
  );

  logger.info('Checkout completed', { subscriberId, plan, expiresAt: finalExpires });
}

async function handleSubscriptionUpdated(db, subscription) {
  const customerId = subscription.customer;
  const subResult = db.exec(`SELECT id FROM subscribers WHERE stripe_customer_id = ?`, [customerId]);
  if (!subResult.length || !subResult[0].values.length) return;
  const subscriberId = subResult[0].values[0][0];

  if (subscription.status === 'active') {
    const periodEnd = subscription.items?.data?.[0]?.current_period_end;
    if (periodEnd) {
      const expiresAt = new Date(periodEnd * 1000).toISOString();
      db.run(`UPDATE subscribers SET subscription_expires_at = ?, next_billing_date = ? WHERE id = ?`,
        [expiresAt, expiresAt, subscriberId]);
    }
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    db.run(`UPDATE subscribers SET status = 'expired' WHERE id = ?`, [subscriberId]);
  }

  logger.info('Subscription updated', { subscriberId, status: subscription.status });
}

async function handleSubscriptionDeleted(db, subscription) {
  const customerId = subscription.customer;
  const subResult = db.exec(`SELECT id FROM subscribers WHERE stripe_customer_id = ?`, [customerId]);
  if (!subResult.length || !subResult[0].values.length) return;
  const subscriberId = subResult[0].values[0][0];

  db.run(`UPDATE subscribers SET status = 'cancelled' WHERE id = ?`, [subscriberId]);
  logger.info('Subscription cancelled via webhook', { subscriberId });
}

async function handlePaymentFailed(db, invoice) {
  const customerId = invoice.customer;
  const subResult = db.exec(`SELECT id FROM subscribers WHERE stripe_customer_id = ?`, [customerId]);
  if (!subResult.length || !subResult[0].values.length) return;
  const subscriberId = subResult[0].values[0][0];

  db.run(
    `INSERT INTO payments (subscriber_id, amount, currency, status, provider_payment_intent_id, provider_customer_id, plan, failure_reason)
     VALUES (?, ?, 'usd', 'failed', ?, ?, 'monthly', ?)`,
    [subscriberId, (invoice.amount_paid || 0) / 100, invoice.payment_intent, customerId, invoice.last_finalization_error?.message || 'Unknown']
  );

  logger.warn('Payment failed', { subscriberId, invoiceId: invoice.id });
}

async function cancelSubscription(subscriberId) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe not configured');

  const db = await getDb();
  const result = db.exec(`SELECT stripe_subscription_id FROM subscribers WHERE id = ?`, [subscriberId]);
  if (!result.length || !result[0].values.length || !result[0].values[0][0]) {
    throw new Error('No active Stripe subscription');
  }
  const stripeSubId = result[0].values[0][0];

  await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
  db.run(`UPDATE subscribers SET status = 'cancelled' WHERE id = ?`, [subscriberId]);
  saveDb();

  logger.info('Subscription cancellation requested', { subscriberId, stripeSubId });
  return { success: true, message: 'Subscription will cancel at period end' };
}

async function adminGrantAccess(adminId, subscriberId, reason, expiresAt) {
  const db = await getDb();
  const planResult = db.exec(`SELECT plan FROM subscribers WHERE id = ?`, [subscriberId]);
  const plan = planResult.length && planResult[0].values.length ? planResult[0].values[0][0] : 'monthly';

  await transaction(async (tdb) => {
    tdb.run(
      `INSERT INTO manual_access_grants (admin_id, subscriber_id, action, reason, expires_at) VALUES (?, ?, 'grant', ?, ?)`,
      [adminId, subscriberId, reason, expiresAt]
    );
    tdb.run(
      `UPDATE subscribers SET plan = ?, status = 'active', subscription_expires_at = ? WHERE id = ?`,
      [plan === 'trial' ? 'monthly' : plan, expiresAt, subscriberId]
    );
  });
  saveDb();

  logger.info('Admin granted access', { adminId, subscriberId, expiresAt });
  return { success: true };
}

async function adminRevokeAccess(adminId, subscriberId, reason) {
  await transaction(async (tdb) => {
    tdb.run(
      `INSERT INTO manual_access_grants (admin_id, subscriber_id, action, reason) VALUES (?, ?, 'revoke', ?)`,
      [adminId, subscriberId, reason]
    );
    tdb.run(`UPDATE subscribers SET status = 'expired' WHERE id = ?`, [subscriberId]);
  });
  saveDb();

  logger.info('Admin revoked access', { adminId, subscriberId });
  return { success: true };
}

async function getAdminGrants(page = 1, limit = 20) {
  const db = await getDb();
  const offset = (page - 1) * limit;
  const countResult = db.exec(`SELECT COUNT(*) FROM manual_access_grants`);
  const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
  const result = db.exec(
    `SELECT mag.id, mag.admin_id, mag.subscriber_id, u.name as admin_name, s.name as subscriber_name, s.email as subscriber_email,
     mag.action, mag.reason, mag.expires_at, mag.created_at
     FROM manual_access_grants mag
     LEFT JOIN users u ON mag.admin_id = u.id
     LEFT JOIN subscribers s ON mag.subscriber_id = s.id
     ORDER BY mag.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]
  );
  const items = result.length ? result[0].values.map(r => ({
    id: r[0], admin_id: r[1], subscriber_id: r[2], admin_name: r[3], subscriber_name: r[4], subscriber_email: r[5],
    action: r[6], reason: r[7], expires_at: r[8], created_at: r[9],
  })) : [];
  return { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getPaymentHistory(page = 1, limit = 20) {
  const db = await getDb();
  const offset = (page - 1) * limit;
  const countResult = db.exec(`SELECT COUNT(*) FROM payments`);
  const total = (countResult.length > 0 && countResult[0].values.length > 0) ? countResult[0].values[0][0] : 0;
  const result = db.exec(
    `SELECT p.id, p.subscriber_id, s.name, s.email, p.amount, p.currency, p.status, p.plan,
     p.provider_checkout_session_id, p.paid_at, p.failure_reason, p.created_at
     FROM payments p
     LEFT JOIN subscribers s ON p.subscriber_id = s.id
     ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [limit, offset]
  );
  const items = result.length ? result[0].values.map(r => ({
    id: r[0], subscriber_id: r[1], subscriber_name: r[2], subscriber_email: r[3],
    amount: r[4], currency: r[5], status: r[6], plan: r[7],
    checkout_session_id: r[8], paid_at: r[9], failure_reason: r[10], created_at: r[11],
  })) : [];
  return { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

module.exports = {
  getStripe,
  getStripePrices,
  getWebhookSecret,
  createCheckoutSession,
  getPaymentStatus,
  getSubscriptionStatus,
  handleWebhookEvent,
  cancelSubscription,
  adminGrantAccess,
  adminRevokeAccess,
  getAdminGrants,
  getPaymentHistory,
  PLAN_DURATIONS,
  PLAN_AMOUNTS,
};
