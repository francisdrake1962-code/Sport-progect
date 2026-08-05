const jwt = require('jsonwebtoken');
const { getSetting } = require('../db');

let cachedMuxConfig = null;

async function getMuxConfig() {
  if (cachedMuxConfig) return cachedMuxConfig;
  const signingKeyId = await getSetting('mux_signing_key_id', process.env.MUX_SIGNING_KEY_ID);
  const signingKey = await getSetting('mux_signing_key', process.env.MUX_SIGNING_KEY);
  const accessTokenId = await getSetting('mux_access_token_id', process.env.MUX_ACCESS_TOKEN_ID);
  const accessTokenSecret = await getSetting('mux_access_token_secret', process.env.MUX_ACCESS_TOKEN_SECRET);
  cachedMuxConfig = { signingKeyId, signingKey, accessTokenId, accessTokenSecret };
  return cachedMuxConfig;
}

function resetStreamConfig() {
  cachedMuxConfig = null;
}

async function isMuxConfigured() {
  const config = await getMuxConfig();
  return !!(config.signingKeyId && config.signingKey);
}

async function isMuxUploadConfigured() {
  const config = await getMuxConfig();
  return !!(config.accessTokenId && config.accessTokenSecret);
}

async function signMuxPlaybackId(playbackId, expSeconds) {
  const config = await getMuxConfig();
  if (!config.signingKeyId || !config.signingKey) return null;
  return jwt.sign(
    { sub: playbackId, exp: Math.floor(Date.now() / 1000) + (expSeconds || 21600) },
    config.signingKey,
    { algorithm: 'HS256', keyid: config.signingKeyId }
  );
}

async function getMuxStreamUrl(playbackId, signedToken) {
  return `https://stream.mux.com/${playbackId}.m3u8?token=${signedToken}`;
}

const MUX_API_BASE = 'https://api.mux.com/video/v1';

async function muxFetch(path, options = {}) {
  const config = await getMuxConfig();
  if (!config.accessTokenId || !config.accessTokenSecret) {
    throw new Error('Mux API not configured: missing access token ID or secret');
  }
  const auth = Buffer.from(`${config.accessTokenId}:${config.accessTokenSecret}`).toString('base64');
  const res = await fetch(`${MUX_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const errMsg = data.error?.messages?.[0] || data.error?.message || `Mux API error (${res.status})`;
    throw new Error(errMsg);
  }
  return data.data;
}

async function createMuxDirectUpload(maxDurationSeconds = 3600) {
  const data = await muxFetch('/uploads', {
    method: 'POST',
    body: JSON.stringify({
      cors_origin: '*',
      new_asset_settings: {
        playback_policy: ['signed'],
        max_resolution_tier: '1080p',
      },
      ...(maxDurationSeconds ? { timeout: maxDurationSeconds } : {}),
    }),
  });
  return { uploadUrl: data.url, uploadId: data.id };
}

async function getMuxAssetDetails(assetId) {
  const data = await muxFetch(`/assets/${assetId}`);
  const playbackIds = Array.isArray(data.playback_ids) ? data.playback_ids : [];
  return {
    status: data.status,
    playbackId: playbackIds.length ? playbackIds[0].id : null,
  };
}

async function getMuxUploadStatus(uploadId) {
  const data = await muxFetch(`/uploads/${uploadId}`);
  const err = data.error || null;
  return {
    status: data.status,
    assetId: data.asset_id || null,
    errorMessage: err ? (err.messages && err.messages[0]) || err.message || null : null,
  };
}

async function deleteMuxAsset(assetId) {
  await muxFetch(`/assets/${assetId}`, { method: 'DELETE' });
}

module.exports = {
  resetStreamConfig,
  isMuxConfigured, isMuxUploadConfigured,
  signMuxPlaybackId, getMuxStreamUrl,
  createMuxDirectUpload, getMuxAssetDetails, getMuxUploadStatus, deleteMuxAsset,
};
