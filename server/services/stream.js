const jwt = require('jsonwebtoken');
const { getSetting } = require('../db');

let cachedConfig = null;

async function getConfig() {
  if (cachedConfig) return cachedConfig;
  const signingKeyId = await getSetting('cf_stream_signing_key_id', process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID);
  const signingKey = await getSetting('cf_stream_signing_key', process.env.CLOUDFLARE_STREAM_SIGNING_KEY);
  const customerCode = await getSetting('cf_stream_customer_code', process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '');
  cachedConfig = { signingKeyId, signingKey, customerCode };
  return cachedConfig;
}

function resetStreamConfig() {
  cachedConfig = null;
}

async function isStreamConfigured() {
  const config = await getConfig();
  return !!(config.signingKeyId && config.signingKey);
}

async function generateSignedToken(uid, expSeconds) {
  const config = await getConfig();
  if (!config.signingKeyId || !config.signingKey) return null;
  const expiry = Math.floor(Date.now() / 1000) + (expSeconds || 21600);
  const token = jwt.sign(
    {
      sub: uid,
      exp: expiry,
      accessRules: [{ id: uid, type: 'video', permission: 'playback' }],
    },
    config.signingKey,
    { algorithm: 'ES256', keyid: config.signingKeyId }
  );
  return token;
}

async function getStreamUrl(uid, signedToken) {
  const config = await getConfig();
  if (!config.customerCode) {
    return `https://customer-${signedToken}.cloudflarestream.com/${signedToken}/manifest/video.m3u8`;
  }
  return `https://${config.customerCode}.cloudflarestream.com/${signedToken}/manifest/video.m3u8`;
}

module.exports = { isStreamConfigured, generateSignedToken, getStreamUrl, resetStreamConfig };
