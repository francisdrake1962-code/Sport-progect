const path = require('path');
const http = require('http');

const PORT = 3004;
let server, start, resetDb, getDb, saveDb, transaction;
let subscriberToken, adminToken;

function api(method, urlPath, body, token, raw) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (raw) {
      headers['Content-Type'] = 'application/json';
    } else {
      headers['Content-Type'] = 'application/json';
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: urlPath, method, headers }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: buf, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = PORT;
  process.env.JWT_SECRET = 'payment-test-secret';
  ({ resetDb, getDb, saveDb, transaction } = require('../server/db'));
  ({ start } = require('../server/index'));
  resetDb();
  server = await start();
  await new Promise(r => setTimeout(r, 800));

  const adminLogin = await api('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
  adminToken = adminLogin.body.token;

  const subLogin = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
  subscriberToken = subLogin.body.token;
}, 15000);

afterAll(() => {
  return new Promise(resolve => {
    if (server) server.close(() => resolve());
    else resolve();
  }).finally(() => {
    const { resetDb } = require('../server/db');
    resetDb();
  });
});

describe('Payment Module — DB Schema', () => {
  test('payments table exists', async () => {
    const db = await getDb();
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='payments'`);
    expect(result.length).toBe(1);
  });

  test('payment_events table exists', async () => {
    const db = await getDb();
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='payment_events'`);
    expect(result.length).toBe(1);
  });

  test('manual_access_grants table exists', async () => {
    const db = await getDb();
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='manual_access_grants'`);
    expect(result.length).toBe(1);
  });

  test('subscribers has subscription_expires_at column', async () => {
    const db = await getDb();
    const result = db.exec(`PRAGMA table_info(subscribers)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('subscription_expires_at');
  });

  test('subscribers has stripe_customer_id column', async () => {
    const db = await getDb();
    const result = db.exec(`PRAGMA table_info(subscribers)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('stripe_customer_id');
  });

  test('subscribers has stripe_subscription_id column', async () => {
    const db = await getDb();
    const result = db.exec(`PRAGMA table_info(subscribers)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('stripe_subscription_id');
  });
});

describe('Payment Module — /api/plans', () => {
  test('GET /api/plans returns plans array', async () => {
    const res = await api('GET', '/api/payment/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans).toBeDefined();
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(res.body.plans.length).toBe(2);
  });
  test('plans include monthly and annual', async () => {
    const res = await api('GET', '/api/payment/plans');
    const ids = res.body.plans.map(p => p.id);
    expect(ids).toContain('monthly');
    expect(ids).toContain('annual');
  });

  test('plans have correct structure', async () => {
    const res = await api('GET', '/api/payment/plans');
    res.body.plans.forEach(plan => {
      expect(plan.name).toBeDefined();
      expect(plan.price).toBeGreaterThan(0);
      expect(plan.currency).toBe('usd');
      expect(plan.interval).toBeDefined();
      expect(Array.isArray(plan.features)).toBe(true);
    });
  });

  test('plans reflect manually set price in settings', async () => {
    const db = await getDb();
    db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_price', '14.99')`);
    db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('annual_price', '99')`);
    saveDb();

    const res = await api('GET', '/api/payment/plans');
    const monthly = res.body.plans.find(p => p.id === 'monthly');
    const annual = res.body.plans.find(p => p.id === 'annual');
    expect(monthly.price).toBe(14.99);
    expect(annual.price).toBe(99);
  });

  test('getPlanAmount falls back to defaults without settings', async () => {
    const db = await getDb();
    db.run(`DELETE FROM settings WHERE key IN ('monthly_price', 'annual_price')`);
    saveDb();

    const { getPlanAmount } = require('../server/services/payment.service');
    expect(await getPlanAmount('monthly')).toBe(12);
    expect(await getPlanAmount('annual')).toBe(89);
  });
});

describe('Payment Module — /api/payment/subscription', () => {
  test('subscriber can get own subscription status', async () => {
    const res = await api('GET', '/api/payment/subscription', null, subscriberToken);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeDefined();
    expect(res.body.status).toBeDefined();
    expect(typeof res.body.active).toBe('boolean');
  });

  test('IDOR: cannot get another subscriber payment status without auth', async () => {
    const res = await api('GET', '/api/payment/subscription');
    expect(res.status).toBe(401);
  });

  test('admin can access subscriber subscription endpoint (higher role in hierarchy)', async () => {
    const res = await api('GET', '/api/payment/subscription', null, adminToken);
    expect(res.status).toBe(200);
  });
});

describe('Payment Module — /api/payment/status', () => {
  test('subscriber can get own payment status', async () => {
    const res = await api('GET', '/api/payment/status', null, subscriberToken);
    expect(res.status).toBe(200);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await api('GET', '/api/payment/status');
    expect(res.status).toBe(401);
  });
});

describe('Payment Module — Webhook (idempotency)', () => {
  test('duplicate webhook event_id returns idempotent response', async () => {
    const db = await getDb();
    db.run(`INSERT OR IGNORE INTO payment_events (event_id, event_type, payload) VALUES (?, ?, ?)`,
      ['evt_test_dup_001', 'checkout.session.completed', '{}']);
    saveDb();

    const result = require('../server/services/payment.service');
    const event1 = await result.handleWebhookEvent({
      id: 'evt_test_dup_001',
      type: 'checkout.session.completed',
      data: { object: {} }
    });
    expect(event1.idempotent).toBe(true);
  });

  test('new event is processed', async () => {
    const result = require('../server/services/payment.service');
    const event = await result.handleWebhookEvent({
      id: 'evt_test_new_' + Date.now(),
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_nonexistent', status: 'active' } }
    });
    expect(event.processed).toBe(true);
    expect(event.eventType).toBe('customer.subscription.updated');
  });
});

describe('Payment Module — Webhook signature', () => {
  test('webhook without stripe-signature header fails', async () => {
    const res = await api('POST', '/api/payment/webhook', '{}', null, true);
    expect(res.status).toBe(500);
  });
});

describe('Payment Module — Can-Watch with subscription_expires_at', () => {
  test('subscriber with active subscription can watch paid lesson', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '+30 days'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();

    const login = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const res = await api('GET', '/api/user/can-watch/8', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.reason).toBe('paid');
  });

  test('subscriber with expired subscription cannot watch paid lesson', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'expired', subscription_expires_at = datetime('now', '-1 day'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();

    const login = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const res = await api('GET', '/api/user/can-watch/8', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
  });

  test('cancelled subscriber with future expiry can still watch', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'annual', status = 'cancelled', subscription_expires_at = datetime('now', '+15 days'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();

    const login = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const res = await api('GET', '/api/user/can-watch/8', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.reason).toBe('paid');
  });

  test('cancelled subscriber with past expiry cannot watch', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'annual', status = 'cancelled', subscription_expires_at = datetime('now', '-1 day'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();

    const login = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const res = await api('GET', '/api/user/can-watch/8', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
  });
});

describe('Payment Module — Checkout session creation', () => {
  test('invalid plan is rejected', async () => {
    const res = await api('POST', '/api/payment/create', { plan: 'weekly' }, subscriberToken);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_PLAN');
    expect(res.body.error.message).toContain('Invalid plan');
  });

  test('unauthenticated request is rejected', async () => {
    const res = await api('POST', '/api/payment/create', { plan: 'monthly' });
    expect(res.status).toBe(401);
  });

  test('admin can access checkout endpoint (higher role), but Stripe not configured', async () => {
    const res = await api('POST', '/api/payment/create', { plan: 'monthly' }, adminToken);
    expect(res.status).toBe(500);
  });
});

describe('Payment Module — Manual access grants', () => {
  let testSubscriberId;

  beforeAll(async () => {
    const db = await getDb();
    const result = db.exec(`SELECT id FROM subscribers WHERE email = 'anna@example.com'`);
    testSubscriberId = result[0].values[0][0];
  });

  test('admin can grant access and subscriber becomes active', async () => {
    const res = await api('POST', '/api/payment/admin/grant', {
      subscriber_id: testSubscriberId,
      reason: 'Test grant',
      expires_at: '2027-12-31T23:59:59Z'
    }, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const db = await getDb();
    const result = db.exec(`SELECT status, plan, subscription_expires_at FROM subscribers WHERE id = ?`, [testSubscriberId]);
    const row = result[0].values[0];
    expect(row[0]).toBe('active');
    expect(row[2]).toBeTruthy();
  });

  test('admin can revoke access and subscriber becomes expired', async () => {
    await api('POST', '/api/payment/admin/grant', {
      subscriber_id: testSubscriberId,
      reason: 'Test grant before revoke',
      expires_at: '2027-12-31T23:59:59Z'
    }, adminToken);
    const res = await api('POST', '/api/payment/admin/revoke', {
      subscriber_id: testSubscriberId,
      reason: 'Test revoke'
    }, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const db = await getDb();
    const result = db.exec(`SELECT status FROM subscribers WHERE id = ?`, [testSubscriberId]);
    expect(result[0].values[0][0]).toBe('expired');
  });

  test('admin can list grant history', async () => {
    const res = await api('GET', '/api/payment/admin/grants', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('subscriber cannot access admin grant endpoints', async () => {
    const res = await api('GET', '/api/payment/admin/grants', null, subscriberToken);
    expect(res.status).toBe(403);
  });

  test('manual grant is not overwritten by webhook', async () => {
    const db = await getDb();
    const expires = new Date(Date.now() + 365 * 86400000).toISOString();
    await transaction(async (tdb) => {
      tdb.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = ? WHERE id = ?`, [expires, testSubscriberId]);
      tdb.run(`INSERT INTO manual_access_grants (admin_id, subscriber_id, action, reason, expires_at) VALUES (?, ?, 'grant', 'recent revoke test', datetime('now', '-30 minutes'))`, [1, testSubscriberId]);
    });
    saveDb();

    const paymentService = require('../server/services/payment.service');
    const event = await paymentService.handleWebhookEvent({
      id: 'evt_test_manual_' + Date.now(),
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_test',
        subscription: 'sub_test',
        customer: 'cus_test',
        payment_intent: 'pi_test',
        metadata: { subscriber_id: String(testSubscriberId), plan: 'monthly' }
      }}
    });
    expect(event.processed).toBe(true);

    const subResult = db.exec(`SELECT status FROM subscribers WHERE id = ?`, [testSubscriberId]);
    expect(subResult[0].values[0][0]).toBe('active');
  });
});

describe('Payment Module — Subscription extension logic', () => {
  test('new_expiration = max(current, now) + duration', async () => {
    const db = await getDb();
    const futureDate = new Date(Date.now() + 15 * 86400000).toISOString();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = ? WHERE email = 'elena@example.com'`, [futureDate]);
    saveDb();

    const paymentService = require('../server/services/payment.service');
    const subResult = db.exec(`SELECT id FROM subscribers WHERE email = 'elena@example.com'`);
    const subId = subResult[0].values[0][0];

    const event = await paymentService.handleWebhookEvent({
      id: 'evt_test_ext_' + Date.now(),
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_ext_test',
        subscription: 'sub_ext_test',
        customer: 'cus_ext_test',
        payment_intent: 'pi_ext_test',
        metadata: { subscriber_id: String(subId), plan: 'monthly' }
      }}
    });
    expect(event.processed).toBe(true);

    const updated = db.exec(`SELECT subscription_expires_at FROM subscribers WHERE id = ?`, [subId]);
    const newExpiry = new Date(updated[0].values[0][0]);
    const now = new Date();
    const thirtyDays = 30 * 86400000;
    const minExpected = new Date(now.getTime() + thirtyDays);
    expect(newExpiry.getTime()).toBeGreaterThanOrEqual(minExpected.getTime() - 60000);
    expect(newExpiry.getTime()).toBeGreaterThan(futureDate ? new Date(futureDate).getTime() : 0);
  });
});

describe('Payment Module — Payment history', () => {
  test('admin can get payment history', async () => {
    const res = await api('GET', '/api/payment/admin/history', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  test('subscriber cannot access payment history', async () => {
    const res = await api('GET', '/api/payment/admin/history', null, subscriberToken);
    expect(res.status).toBe(403);
  });
});

describe('Payment Module — settings keys', () => {
  test('ALLOWED_SETTINGS_KEYS includes stripe keys', () => {
    const indexSource = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    expect(indexSource).toContain('stripe_monthly_price_id');
    expect(indexSource).toContain('stripe_annual_price_id');
  });
});

describe('Payment Module — Webhook middleware ordering', () => {
  test('webhook route is registered before express.json', () => {
    const indexSource = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
    const webhookIdx = indexSource.indexOf('/api/payment/webhook');
    const jsonIdx = indexSource.indexOf('express.json({');
    expect(webhookIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(-1);
    expect(webhookIdx).toBeLessThan(jsonIdx);
  });
});

describe('Payment Module — File structure', () => {
  test('server/services/payment.service.js exists', () => {
    expect(require('fs').existsSync(path.join(__dirname, '..', 'server', 'services', 'payment.service.js'))).toBe(true);
  });

  test('server/routes/payment.js exists', () => {
    expect(require('fs').existsSync(path.join(__dirname, '..', 'server', 'routes', 'payment.js'))).toBe(true);
  });

  test('server/migrations/002_payment_module.sql exists', () => {
    expect(require('fs').existsSync(path.join(__dirname, '..', 'server', 'migrations', '002_payment_module.sql'))).toBe(true);
  });

  test('src/pages/payment-status.html exists', () => {
    expect(require('fs').existsSync(path.join(__dirname, '..', 'src', 'pages', 'payment-status.html'))).toBe(true);
  });
});

describe('Payment Module — PAY-002 atomic webhook processing', () => {
  test('failed processing leaves the event retryable (no persisted event row)', async () => {
    const paymentService = require('../server/services/payment.service');
    const eventId = 'evt_pay002_fail_' + Date.now();
    await expect(paymentService.handleWebhookEvent({
      id: eventId,
      type: 'invoice.payment_failed',
      data: { object: null }
    })).rejects.toThrow();

    const db = await getDb();
    const result = db.exec(`SELECT 1 FROM payment_events WHERE event_id = ?`, [eventId]);
    expect(result.length).toBe(0);
  });

  test('retry after a failed attempt completes the operation', async () => {
    const db = await getDb();
    const subResult = db.exec(`SELECT id FROM subscribers WHERE email = 'maria@example.com'`);
    const subId = subResult[0].values[0][0];
    db.run(`UPDATE subscribers SET plan = 'annual', status = 'active', stripe_customer_id = 'cus_pay002_retry' WHERE id = ?`, [subId]);
    saveDb();

    const paymentService = require('../server/services/payment.service');
    const eventId = 'evt_pay002_retry_' + Date.now();
    const result = await paymentService.handleWebhookEvent({
      id: eventId,
      type: 'invoice.payment_failed',
      data: { object: {
        customer: 'cus_pay002_retry',
        amount_paid: 0,
        payment_intent: 'pi_pay002_retry',
        last_finalization_error: { message: 'card_declined' }
      } }
    });
    expect(result.processed).toBe(true);

    const payResult = db.exec(`SELECT status, provider_payment_intent_id, failure_reason FROM payments WHERE provider_payment_intent_id = 'pi_pay002_retry'`);
    expect(payResult.length).toBe(1);
    expect(payResult[0].values[0][0]).toBe('failed');
    expect(payResult[0].values[0][2]).toBe('card_declined');
  });

  test('two identical concurrent events produce exactly one business effect', async () => {
    const db = await getDb();
    const subResult = db.exec(`SELECT id FROM subscribers WHERE email = 'elena@example.com'`);
    const subId = subResult[0].values[0][0];
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '+5 days'), stripe_customer_id = 'cus_pay002_conc' WHERE id = ?`, [subId]);
    saveDb();

    const paymentService = require('../server/services/payment.service');
    const eventId = 'evt_pay002_conc_' + Date.now();
    const event = {
      id: eventId,
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_pay002_conc',
        subscription: 'sub_pay002_conc',
        customer: 'cus_pay002_conc',
        payment_intent: 'pi_pay002_conc',
        metadata: { subscriber_id: String(subId), plan: 'monthly' }
      } }
    };
    const results = await Promise.all([
      paymentService.handleWebhookEvent(JSON.parse(JSON.stringify(event))),
      paymentService.handleWebhookEvent(JSON.parse(JSON.stringify(event))),
    ]);
    const processed = results.filter(r => r.processed).length;
    const idempotent = results.filter(r => r.idempotent).length;
    expect(processed).toBe(1);
    expect(idempotent).toBe(1);

    const subAfter = db.exec(`SELECT status FROM subscribers WHERE id = ?`, [subId]);
    expect(subAfter[0].values[0][0]).toBe('active');
    const eventsCount = db.exec(`SELECT COUNT(*) FROM payment_events WHERE event_id = ?`, [eventId]);
    expect(eventsCount[0].values[0][0]).toBe(1);
  });
});

describe('Payment Module — PAY-001 subscription state machine', () => {
  const getSubscriberState = async (email) => {
    const db = await getDb();
    const result = db.exec(`SELECT plan, status, subscription_expires_at FROM subscribers WHERE email = ?`, [email]);
    const r = result[0].values[0];
    return { plan: r[0], status: r[1], expires_at: r[2] };
  };

  const sendSubscriptionUpdated = (customer, status, periodEnd) => {
    const paymentService = require('../server/services/payment.service');
    return paymentService.handleWebhookEvent({
      id: 'evt_state_' + customer + '_' + status + '_' + Date.now(),
      type: 'customer.subscription.updated',
      data: { object: {
        customer,
        status,
        items: periodEnd ? { data: [{ current_period_end: periodEnd }] } : undefined
      } }
    });
  };

  test('past_due webhook transitions active subscriber to past_due', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '+30 days'), stripe_customer_id = 'cus_state_pastdue', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const result = await sendSubscriptionUpdated('cus_state_pastdue', 'past_due');
    expect(result.processed).toBe(true);
    expect((await getSubscriberState('maria@example.com')).status).toBe('past_due');
  });

  test('unpaid webhook maps to past_due, NOT expired', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '+30 days'), stripe_customer_id = 'cus_state_unpaid', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const result = await sendSubscriptionUpdated('cus_state_unpaid', 'unpaid');
    expect(result.processed).toBe(true);
    expect((await getSubscriberState('maria@example.com')).status).toBe('past_due');
  });

  test('canceled webhook maps to cancelled (access kept until expiry), NOT expired', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'annual', status = 'active', subscription_expires_at = datetime('now', '+15 days'), stripe_customer_id = 'cus_state_canceled', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const result = await sendSubscriptionUpdated('cus_state_canceled', 'canceled');
    expect(result.processed).toBe(true);
    const state = await getSubscriberState('maria@example.com');
    expect(state.status).toBe('cancelled');
    expect(state.expires_at).toBeTruthy();
  });

  test('trialing webhook maps to local trial status', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'trial', status = 'active', subscription_expires_at = datetime('now', '+7 days'), stripe_customer_id = 'cus_state_trialing', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const result = await sendSubscriptionUpdated('cus_state_trialing', 'trialing');
    expect(result.processed).toBe(true);
    expect((await getSubscriberState('maria@example.com')).status).toBe('trial');
  });

  test('active webhook restores status and sets expiry from current_period_end', async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'past_due', subscription_expires_at = datetime('now', '-1 day'), stripe_customer_id = 'cus_state_active', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const result = await sendSubscriptionUpdated('cus_state_active', 'active', periodEnd);
    expect(result.processed).toBe(true);
    const state = await getSubscriberState('maria@example.com');
    expect(state.status).toBe('active');
    const expectedIso = new Date(periodEnd * 1000).toISOString();
    expect(new Date(state.expires_at).getTime()).toBeCloseTo(new Date(expectedIso).getTime(), -3);
  });

  test('unrecognized subscription status does not change access', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '+30 days'), stripe_customer_id = 'cus_state_unknown', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const result = await sendSubscriptionUpdated('cus_state_unknown', 'incomplete_expired');
    expect(result.processed).toBe(true);
    expect((await getSubscriberState('maria@example.com')).status).toBe('active');
  });

  test('past_due subscriber cannot watch paid lesson and gets a distinct code', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'past_due', subscription_expires_at = datetime('now', '+30 days'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const login = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const res = await api('GET', '/api/user/can-watch/8', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toBe('payment_past_due');
    expect(res.body.code).toBe('PAYMENT_PAST_DUE');
  });

  test('invoice.payment_failed transitions an active subscriber to past_due', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '+30 days'), stripe_customer_id = 'cus_state_failed', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();
    const paymentService = require('../server/services/payment.service');
    const result = await paymentService.handleWebhookEvent({
      id: 'evt_state_failed_' + Date.now(),
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_state_failed', amount_paid: 0, payment_intent: 'pi_state_failed', last_finalization_error: { message: 'card_declined' } } }
    });
    expect(result.processed).toBe(true);
    expect((await getSubscriberState('maria@example.com')).status).toBe('past_due');
  });
});

describe('Payment Module — PAY-003 period source of truth', () => {
  test('subscription.updated never shrinks an already-paid expiry', async () => {
    const db = await getDb();
    const farFuture = new Date(Date.now() + 40 * 86400000).toISOString();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = ?, stripe_customer_id = 'cus_pay003_shrink', email_confirmed = 1 WHERE email = 'maria@example.com'`, [farFuture]);
    saveDb();

    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    const paymentService = require('../server/services/payment.service');
    const result = await paymentService.handleWebhookEvent({
      id: 'evt_pay003_shrink_' + Date.now(),
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_pay003_shrink', status: 'active', items: { data: [{ current_period_end: periodEnd }] } } }
    });
    expect(result.processed).toBe(true);

    const row = db.exec(`SELECT subscription_expires_at FROM subscribers WHERE email = 'maria@example.com'`);
    const stored = row[0].values[0][0];
    expect(new Date(stored).getTime()).toBeGreaterThanOrEqual(new Date(farFuture).getTime() - 1000);
  });

  test('subscription.updated extends expiry to current_period_end when it is later', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'active', subscription_expires_at = datetime('now', '-1 day'), stripe_customer_id = 'cus_pay003_extend', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();

    const periodEnd = Math.floor(Date.now() / 1000) + 45 * 86400;
    const paymentService = require('../server/services/payment.service');
    const result = await paymentService.handleWebhookEvent({
      id: 'evt_pay003_extend_' + Date.now(),
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_pay003_extend', status: 'active', items: { data: [{ current_period_end: periodEnd }] } } }
    });
    expect(result.processed).toBe(true);

    const row = db.exec(`SELECT subscription_expires_at FROM subscribers WHERE email = 'maria@example.com'`);
    const stored = new Date(row[0].values[0][0]).getTime();
    expect(stored).toBeCloseTo(new Date(periodEnd * 1000).getTime(), -3);
  });

  test('invoice.payment_failed records the subscriber plan, not a hard-coded monthly', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'annual', status = 'active', subscription_expires_at = datetime('now', '+300 days'), stripe_customer_id = 'cus_pay003_plan', email_confirmed = 1 WHERE email = 'maria@example.com'`);
    saveDb();

    const paymentService = require('../server/services/payment.service');
    const result = await paymentService.handleWebhookEvent({
      id: 'evt_pay003_plan_' + Date.now(),
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_pay003_plan', amount_paid: 0, payment_intent: 'pi_pay003_plan', last_finalization_error: { message: 'card_declined' } } }
    });
    expect(result.processed).toBe(true);

    const row = db.exec(`SELECT plan FROM payments WHERE provider_payment_intent_id = 'pi_pay003_plan'`);
    expect(row[0].values[0][0]).toBe('annual');
  });
});

describe('Payment Module — Subscription cancel', () => {
  test('subscriber can request cancel (Stripe not configured returns 500)', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'annual', status = 'active', stripe_subscription_id = 'sub_test_cancel' WHERE email = 'sergey@example.com'`);
    saveDb();

    const login = await api('POST', '/api/user/login', { email: 'sergey@example.com', password: 'password123' });
    const res = await api('POST', '/api/payment/cancel', {}, login.body.token);
    expect(res.status).toBe(500);
  });

  test('subscriber without stripe subscription gets error', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET stripe_subscription_id = NULL WHERE email = 'sergey@example.com'`);
    saveDb();

    const login = await api('POST', '/api/user/login', { email: 'sergey@example.com', password: 'password123' });
    const res = await api('POST', '/api/payment/cancel', {}, login.body.token);
    expect(res.status).toBe(500);
  });
});

describe('Payment Module — API-003 machine-readable denial codes', () => {
  async function setSubscriber(email, sql) {
    const db = await getDb();
    db.run(`UPDATE subscribers SET ${sql} WHERE email = ?`, [email]);
    saveDb();
  }
  async function login(email) {
    return (await api('POST', '/api/user/login', { email, password: 'password123' })).body.token;
  }

  test('can-watch: expired paid plan -> SUBSCRIPTION_EXPIRED', async () => {
    await setSubscriber('maria@example.com', `plan = 'monthly', status = 'expired', subscription_expires_at = datetime('now', '-1 day'), email_confirmed = 1`);
    const res = await api('GET', '/api/user/can-watch/8', null, await login('maria@example.com'));
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('can-watch: past_due paid plan -> PAYMENT_PAST_DUE', async () => {
    await setSubscriber('maria@example.com', `plan = 'monthly', status = 'past_due', subscription_expires_at = datetime('now', '+30 days'), email_confirmed = 1`);
    const res = await api('GET', '/api/user/can-watch/8', null, await login('maria@example.com'));
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.code).toBe('PAYMENT_PAST_DUE');
  });

  test('login: unconfirmed email -> 403 EMAIL_CONFIRMATION_REQUIRED', async () => {
    await setSubscriber('maria@example.com', `plan = 'trial', status = 'trial', email_confirmed = 0`);
    const res = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_CONFIRMATION_REQUIRED');
  });

  test('can-watch: free trial limit reached -> FREE_LIMIT_REACHED', async () => {
    await setSubscriber('maria@example.com', `plan = 'trial', status = 'trial', free_sessions_used = 7, email_confirmed = 1`);
    const res = await api('GET', '/api/user/can-watch/8', null, await login('maria@example.com'));
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.code).toBe('FREE_LIMIT_REACHED');
  });

  test('can-watch: no paid plan and non-trial status -> SUBSCRIPTION_REQUIRED', async () => {
    await setSubscriber('maria@example.com', `plan = 'trial', status = 'expired', free_sessions_used = 0, email_confirmed = 1`);
    const res = await api('GET', '/api/user/can-watch/8', null, await login('maria@example.com'));
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  test('can-watch: trial user with free sessions left is granted with GRANTED', async () => {
    await setSubscriber('maria@example.com', `plan = 'trial', status = 'trial', free_sessions_used = 3, email_confirmed = 1`);
    const res = await api('GET', '/api/user/can-watch/8', null, await login('maria@example.com'));
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.code).toBe('GRANTED');
  });

  test('stream-token: past_due paid plan -> 403 PAYMENT_PAST_DUE (before provider check)', async () => {
    await setSubscriber('maria@example.com', `plan = 'monthly', status = 'past_due', subscription_expires_at = datetime('now', '+30 days'), email_confirmed = 1`);
    const res = await api('GET', '/api/user/stream-token/8', null, await login('maria@example.com'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYMENT_PAST_DUE');
  });

  test('stream-token: expired paid plan -> 403 SUBSCRIPTION_EXPIRED', async () => {
    await setSubscriber('maria@example.com', `plan = 'monthly', status = 'expired', subscription_expires_at = datetime('now', '-1 day'), email_confirmed = 1`);
    const res = await api('GET', '/api/user/stream-token/8', null, await login('maria@example.com'));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });
});
