const { getSetting } = require('../db');

const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';

function htmlEncode(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CONFIRM_HTML = (confirmUrl) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
    <h2 style="color:#1a5e2a;">Подтвердите регистрацию</h2>
    <p>Добро пожаловать! Перейдите по ссылке, чтобы подтвердить email и начать заниматься:</p>
    <a href="${confirmUrl}"
       style="display:inline-block;padding:0.8rem 2rem;background:#1a5e2a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:1rem 0;">
      Подтвердить email
    </a>
    <p style="color:#666;font-size:0.85rem;">Если кнопка не работает, скопируйте ссылку:<br>${confirmUrl}</p>
    <p style="color:#999;font-size:0.8rem;margin-top:2rem;">Если вы не регистрировались — просто игнорируйте это письмо.</p>
  </div>`;

const TRIAL_EXPIRING_HTML = (name, daysLeft) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
    <h2 style="color:#c0392b;">Пробный период заканчивается</h2>
    <p>Здравствуйте, ${htmlEncode(name) || 'пользователь'}!</p>
    <p>Ваш пробный период заканчивается через <strong>${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}</strong>.</p>
    <p>Чтобы продолжить заниматься без ограничений, оформите подписку:</p>
    <a href="${baseUrl}/plans"
       style="display:inline-block;padding:0.8rem 2rem;background:#1a5e2a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:1rem 0;">
      Оформить подписку
    </a>
    <p style="color:#666;font-size:0.85rem;">После окончания пробного периода доступ к занятиям будет ограничен.</p>
    <p style="color:#999;font-size:0.8rem;margin-top:2rem;">Если вы уже оформили подписку — просто игнорируйте это письмо.</p>
  </div>`;

const SUBSCRIPTION_EXPIRING_HTML = (name, daysLeft, plan) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
    <h2 style="color:#e67e22;">Подписка заканчивается</h2>
    <p>Здравствуйте, ${htmlEncode(name) || 'пользователь'}!</p>
    <p>Ваша подписка "${plan === 'annual' ? 'Годовая' : 'Ежемесячная'}" заканчивается через <strong>${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}</strong>.</p>
    <p>Продлите подписку, чтобы не потерять доступ к занятиям:</p>
    <a href="${baseUrl}/plans"
       style="display:inline-block;padding:0.8rem 2rem;background:#1a5e2a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:1rem 0;">
      Продлить подписку
    </a>
    <p style="color:#666;font-size:0.85rem;">После окончания подписки доступ к занятиям будет приостановлен.</p>
    <p style="color:#999;font-size:0.8rem;margin-top:2rem;">Если вы уже продлили подписку — просто игнорируйте это письмо.</p>
  </div>`;

const SUBSCRIPTION_EXPIRED_HTML = (name, plan) => `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
    <h2 style="color:#c0392b;">Подписка истекла</h2>
    <p>Здравствуйте, ${htmlEncode(name) || 'пользователь'}!</p>
    <p>Ваша подписка "${plan === 'annual' ? 'Годовая' : 'Ежемесячная'}" истекла. Доступ к занятиям приостановлен.</p>
    <p>Оформите новую подписку, чтобы продолжить заниматься:</p>
    <a href="${baseUrl}/plans"
       style="display:inline-block;padding:0.8rem 2rem;background:#1a5e2a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;margin:1rem 0;">
      Оформить подписку
    </a>
    <p style="color:#999;font-size:0.8rem;margin-top:2rem;">Ваш прогресс сохранён. После продления вы сможете продолжить с того же места.</p>
  </div>`;

let gmailTransporter = null;
let resendClient = null;
let resolvedProvider = null;

async function resolveProvider() {
  if (resolvedProvider) return resolvedProvider;
  resolvedProvider = await getSetting('mail_provider', process.env.MAIL_PROVIDER || 'console');

  if (resolvedProvider === 'gmail') {
    const nodemailer = require('nodemailer');
    const user = await getSetting('gmail_user', process.env.GMAIL_USER);
    const pass = await getSetting('gmail_app_password', process.env.GMAIL_APP_PASSWORD);
    if (user && pass) {
      gmailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
      console.log(`[mailer] Gmail SMTP configured for ${user}`);
    } else {
      console.warn('[mailer] MAIL_PROVIDER=gmail but credentials not set — falling back to console');
      resolvedProvider = 'console';
    }
  }

  if (resolvedProvider === 'resend') {
    try {
      const { Resend } = require('resend');
      const apiKey = await getSetting('resend_api_key', process.env.RESEND_API_KEY);
      if (apiKey) {
        resendClient = new Resend(apiKey);
        console.log('[mailer] Resend configured');
      } else {
        console.warn('[mailer] MAIL_PROVIDER=resend but API key not set — falling back to console');
        resolvedProvider = 'console';
      }
    } catch {
      console.warn('[mailer] resend package not installed — falling back to console');
      resolvedProvider = 'console';
    }
  }

  if (resolvedProvider === 'console') {
    console.log('[mailer] Console mode — emails will be logged to server output');
  }

  return resolvedProvider;
}

function resetMailConfig() {
  resolvedProvider = null;
  gmailTransporter = null;
  resendClient = null;
}

async function sendGenericEmail(toEmail, subject, html) {
  try {
    const provider = await resolveProvider();
    if (provider === 'gmail') {
      if (!gmailTransporter) return sendViaConsole(toEmail, subject, html);
      const fromUser = await getSetting('gmail_user', process.env.GMAIL_USER);
      const result = await gmailTransporter.sendMail({
        from: `Цигун <${fromUser}>`,
        to: toEmail,
        subject,
        html,
      });
      console.log(`[mailer] Gmail sent to ${toEmail}, id: ${result.messageId}`);
      return result;
    }
    if (provider === 'resend') {
      if (!resendClient) return sendViaConsole(toEmail, subject, html);
      const fromEmail = await getSetting('email_from', process.env.EMAIL_FROM || 'noreply@qigong.app');
      const result = await resendClient.emails.send({
        from: `Цигун <${fromEmail}>`,
        to: toEmail,
        subject,
        html,
      });
      console.log(`[mailer] Resend sent to ${toEmail}, id: ${result.data?.id || result.id}`);
      return result;
    }
    return await sendViaConsole(toEmail, subject, html);
  } catch (err) {
    console.error(`[mailer] Failed to send email to ${toEmail}:`, err.message);
    return null;
  }
}

async function sendViaConsole(toEmail, subject, html) {
  console.log(`[mailer] DEV email for ${toEmail}:`);
  console.log(`[mailer] Subject: ${subject}`);
  console.log(`[mailer] (HTML logged, ${html.length} chars)`);
  return { id: 'dev-mode', status: 'logged' };
}

async function sendConfirmationEmail(toEmail, token) {
  const confirmUrl = `${baseUrl}/api/user/confirm/${token}`;
  return await sendGenericEmail(toEmail, 'Подтвердите email — Цигун', CONFIRM_HTML(confirmUrl));
}

async function sendTrialExpiringEmail(toEmail, name, daysLeft) {
  return await sendGenericEmail(toEmail, 'Пробный период заканчивается — Цигун', TRIAL_EXPIRING_HTML(name, daysLeft));
}

async function sendSubscriptionExpiringEmail(toEmail, name, daysLeft, plan) {
  return await sendGenericEmail(toEmail, 'Подписка заканчивается — Цигун', SUBSCRIPTION_EXPIRING_HTML(name, daysLeft, plan));
}

async function sendSubscriptionExpiredEmail(toEmail, name, plan) {
  return await sendGenericEmail(toEmail, 'Подписка истекла — Цигун', SUBSCRIPTION_EXPIRED_HTML(name, plan));
}

module.exports = {
  sendConfirmationEmail,
  sendTrialExpiringEmail,
  sendSubscriptionExpiringEmail,
  sendSubscriptionExpiredEmail,
  sendGenericEmail,
  resetMailConfig,
  resolveProvider,
  _getProvider: () => resolvedProvider || 'console',
};
