const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../auth');
const { requireRole, requireAdmin } = require('../middleware/rbac');
const { parsePagination } = require('../helpers/pagination');
const paymentService = require('../services/payment.service');
const { createLogger } = require('../helpers/logger');

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
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

router.post('/create', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !['monthly', 'annual'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be "monthly" or "annual".' });
    }
    const result = await paymentService.createCheckoutSession(req.user.id, plan);
    res.json(result);
  } catch (err) {
    logger.error('Failed to create checkout session', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

router.get('/status', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const status = await paymentService.getPaymentStatus(req.user.id);
    res.json(status || { status: 'none', message: 'No payments found' });
  } catch (err) {
    logger.error('Failed to get payment status', { error: err.message });
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

router.get('/subscription', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const status = await paymentService.getSubscriptionStatus(req.user.id);
    res.json(status || { plan: 'trial', status: 'trial', active: false, expires_at: null });
  } catch (err) {
    logger.error('Failed to get subscription status', { error: err.message });
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

router.post('/cancel', authMiddleware, requireRole('subscriber'), async (req, res) => {
  try {
    const result = await paymentService.cancelSubscription(req.user.id);
    res.json(result);
  } catch (err) {
    logger.error('Failed to cancel subscription', { error: err.message, userId: req.user.id });
    res.status(500).json({ error: err.message || 'Failed to cancel subscription' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = paymentService.getWebhookSecret();
    if (!webhookSecret) {
      logger.warn('Stripe webhook secret not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const stripe = paymentService.getStripe();
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.warn('Webhook signature verification failed', { error: err.message });
      return res.status(400).json({ error: 'Invalid signature' });
    }
    const result = await paymentService.handleWebhookEvent(event);
    res.json({ received: true, ...result });
  } catch (err) {
    logger.error('Webhook processing failed', { error: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.get('/admin/grants', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await paymentService.getAdminGrants(page, limit);
    res.json(result);
  } catch (err) {
    logger.error('Failed to get grants', { error: err.message });
    res.status(500).json({ error: 'Failed to get grants' });
  }
});

router.post('/admin/grant', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { subscriber_id, reason, expires_at } = req.body;
    if (!subscriber_id || !expires_at) {
      return res.status(400).json({ error: 'subscriber_id and expires_at required' });
    }
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE id = ?`, [subscriber_id]);
    if (!check.length || !check[0].values.length) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    const result = await paymentService.adminGrantAccess(req.user.id, subscriber_id, reason, expires_at);
    res.json(result);
  } catch (err) {
    logger.error('Failed to grant access', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to grant access' });
  }
});

router.post('/admin/revoke', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { subscriber_id, reason } = req.body;
    if (!subscriber_id) {
      return res.status(400).json({ error: 'subscriber_id required' });
    }
    const db = await getDb();
    const check = db.exec(`SELECT id FROM subscribers WHERE id = ?`, [subscriber_id]);
    if (!check.length || !check[0].values.length) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    const result = await paymentService.adminRevokeAccess(req.user.id, subscriber_id, reason);
    res.json(result);
  } catch (err) {
    logger.error('Failed to revoke access', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to revoke access' });
  }
});

router.get('/admin/history', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await paymentService.getPaymentHistory(page, limit);
    res.json(result);
  } catch (err) {
    logger.error('Failed to get payment history', { error: err.message });
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

module.exports = router;
