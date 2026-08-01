const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');
const { requireRole, requireAdmin } = require('../middleware/rbac');
const { parsePagination } = require('../helpers/pagination');
const paymentService = require('../services/payment.service');
const { createLogger } = require('../helpers/logger');
const { sendError } = require('../helpers/errors');

const logger = createLogger('payment-routes');

const router = express.Router();

router.get('/plans', async (req, res) => {
  try {
    const db = await getDb();
    const monthlyPrice = db.exec(`SELECT value FROM settings WHERE key = 'monthly_price'`);
    const annualPrice = db.exec(`SELECT value FROM settings WHERE key = 'annual_price'`);
    const mPrice = monthlyPrice.length && monthlyPrice[0].values.length ? monthlyPrice[0].values[0][0] : '12';
    const aPrice = annualPrice.length && annualPrice[0].values.length ? annualPrice[0].values[0][0] : '89';
    res.json({
      plans: [
        { id: 'monthly', name: 'Ежемесячная', price: parseFloat(mPrice) || 12, currency: 'usd', interval: 'month', features: ['Полный доступ ко всем занятиям', 'Персональный календарь', 'Прогресс и рекомендации'] },
        { id: 'annual', name: 'Годовая', price: parseFloat(aPrice) || 89, currency: 'usd', interval: 'year', features: ['Полный доступ ко всем занятиям', 'Персональный календарь', 'Прогресс и рекомендации', 'Экономия 38%'], popular: true },
      ],
    });
  } catch (err) {
    logger.error('Failed to load plans', { error: err.message });
    sendError(res, 500, 'PLANS_LOAD_FAILED', 'Failed to load plans', req.requestId);
  }
});

router.post('/create', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !['monthly', 'annual'].includes(plan)) {
      return sendError(res, 400, 'INVALID_PLAN', 'Invalid plan. Must be "monthly" or "annual".', req.requestId);
    }
    const result = await paymentService.createCheckoutSession(req.user.id, plan);
    res.json(result);
  } catch (err) {
    logger.error('Failed to create checkout session', { error: err.message, userId: req.user.id });
    sendError(res, 500, 'CHECKOUT_FAILED', err.message || 'Failed to create checkout session', req.requestId);
  }
});

router.get('/status', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const status = await paymentService.getPaymentStatus(req.user.id);
    res.json(status || { status: 'none', message: 'No payments found' });
  } catch (err) {
    logger.error('Failed to get payment status', { error: err.message });
    sendError(res, 500, 'PAYMENT_STATUS_FAILED', 'Failed to get payment status', req.requestId);
  }
});

router.get('/subscription', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const status = await paymentService.getSubscriptionStatus(req.user.id);
    res.json(status || { plan: 'trial', status: 'trial', active: false, expires_at: null });
  } catch (err) {
    logger.error('Failed to get subscription status', { error: err.message });
    sendError(res, 500, 'SUBSCRIPTION_STATUS_FAILED', 'Failed to get subscription status', req.requestId);
  }
});

router.post('/cancel', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const result = await paymentService.cancelSubscription(req.user.id);
    res.json(result);
  } catch (err) {
    logger.error('Failed to cancel subscription', { error: err.message, userId: req.user.id });
    sendError(res, 500, 'CANCEL_FAILED', err.message || 'Failed to cancel subscription', req.requestId);
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = paymentService.getWebhookSecret();
    if (!webhookSecret) {
      logger.warn('Stripe webhook secret not configured');
      return sendError(res, 500, 'WEBHOOK_NOT_CONFIGURED', 'Webhook not configured', req.requestId);
    }
    const stripe = paymentService.getStripe();
    if (!stripe) {
      return sendError(res, 500, 'STRIPE_NOT_CONFIGURED', 'Stripe not configured', req.requestId);
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.warn('Webhook signature verification failed', { error: err.message });
      return sendError(res, 400, 'INVALID_SIGNATURE', 'Invalid signature', req.requestId);
    }
    const result = await paymentService.handleWebhookEvent(event);
    res.json({ received: true, ...result });
  } catch (err) {
    logger.error('Webhook processing failed', { error: err.message });
    sendError(res, 500, 'WEBHOOK_PROCESSING_FAILED', 'Webhook processing failed', req.requestId);
  }
});

router.get('/admin/grants', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await paymentService.getAdminGrants(page, limit);
    res.json(result);
  } catch (err) {
    logger.error('Failed to get grants', { error: err.message });
    sendError(res, 500, 'GRANTS_LOAD_FAILED', 'Failed to get grants', req.requestId);
  }
});

router.post('/admin/grant', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { subscriber_id, reason, expires_at } = req.body;
    if (!subscriber_id || !expires_at) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'subscriber_id and expires_at required', req.requestId);
    }
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE id = ?`, [subscriber_id]);
    if (!check.length || !check[0].values.length) {
      return sendError(res, 404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found', req.requestId);
    }
    const result = await paymentService.adminGrantAccess(req.user.id, subscriber_id, reason, expires_at);
    res.json(result);
  } catch (err) {
    logger.error('Failed to grant access', { error: err.message });
    sendError(res, 500, 'GRANT_FAILED', err.message || 'Failed to grant access', req.requestId);
  }
});

router.post('/admin/revoke', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { subscriber_id, reason } = req.body;
    if (!subscriber_id) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'subscriber_id required', req.requestId);
    }
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE id = ?`, [subscriber_id]);
    if (!check.length || !check[0].values.length) {
      return sendError(res, 404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found', req.requestId);
    }
    const result = await paymentService.adminRevokeAccess(req.user.id, subscriber_id, reason);
    res.json(result);
  } catch (err) {
    logger.error('Failed to revoke access', { error: err.message });
    sendError(res, 500, 'REVOKE_FAILED', err.message || 'Failed to revoke access', req.requestId);
  }
});

router.get('/admin/history', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await paymentService.getPaymentHistory(page, limit);
    res.json(result);
  } catch (err) {
    logger.error('Failed to get payment history', { error: err.message });
    sendError(res, 500, 'HISTORY_LOAD_FAILED', 'Failed to get payment history', req.requestId);
  }
});

module.exports = router;
