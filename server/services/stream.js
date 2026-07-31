const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { getDb, saveDb, getSetting } = require('../db');

let cachedConfig = null;

async function getConfig() {
  if (cachedConfig) return cachedConfig;
  const signingKeyId = await getSetting('cf_stream_signing_key_id', process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID);
  const signingKey = await getSetting('cf_stream_signing_key', process.env.CLOUDFLARE_STREAM_SIGNING_KEY);
  const token = await getSetting('cf_stream_api_token', process.env.CLOUDFLARE_STREAM_API_TOKEN);
  const accountId = await getSetting('cf_stream_account_id', process.env.CLOUDFLARE_STREAM_ACCOUNT_ID);
  const customerCode = await getSetting('cf_stream_customer_code', process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE || '');
  cachedConfig = { signingKeyId, signingKey, token, accountId, customerCode };
  return cachedConfig;
}

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
  cachedConfig = null;
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

async function isStreamConfigured() {
  const config = await getConfig();
  return !!(config.signingKeyId && config.signingKey);
}

async function isUploadConfigured() {
  const config = await getConfig();
  return !!(config.token && config.accountId);
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
    throw new Error('Customer Code is required for Stream URL generation. Configure it in admin settings.');
  }
  return `https://${config.customerCode}.cloudflarestream.com/${signedToken}/manifest/video.m3u8`;
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

async function cfFetch(path, options = {}) {
  const config = await getConfig();
  if (!config.token || !config.accountId) {
    throw new Error('Cloudflare Stream API not configured: missing API token or account ID');
  }
  const url = `${CF_API_BASE}/accounts/${config.accountId}/stream${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!data.success) {
    const errMsg = data.errors?.[0]?.message || 'Cloudflare API error';
    throw new Error(errMsg);
  }
  return data.result;
}

async function createDirectCreatorUpload(maxDurationSeconds = 120) {
  const result = await cfFetch('/direct_upload', {
    method: 'POST',
    body: JSON.stringify({ maxDurationSeconds }),
  });
  return { uploadUrl: result.uploadURL, uid: result.uid };
}

async function getVideoDetails(uid) {
  return cfFetch(`/${uid}`);
}

async function listVideos(page = 1, perPage = 50) {
  return cfFetch(`?page=${page}&per_page=${perPage}`);
}

async function deleteVideo(uid) {
  return cfFetch(`/${uid}`, { method: 'DELETE' });
}

async function uploadFileToCloudflare(filePath, maxDurationSeconds = 600) {
  const config = await getConfig();
  if (!config.token || !config.accountId) {
    throw new Error('Cloudflare Stream API not configured: missing API token or account ID');
  }
  const { uploadUrl, uid } = await createDirectCreatorUpload(maxDurationSeconds);

  const fileStream = fs.createReadStream(filePath);
  const stats = fs.statSync(filePath);

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Length': String(stats.size) },
    body: fileStream,
    duplex: 'half',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Upload failed');
    throw new Error(`Cloudflare upload failed (${res.status}): ${errText}`);
  }

  return { uid };
}

const STATUS_POLL_INTERVAL = 5000;
const STATUS_POLL_MAX_ATTEMPTS = 120;
const activePolling = new Map();

async function processReadyVideo(videoUid, uploadId) {
  const db = await getDb();
  const uploads = db.exec(`SELECT id, lesson_id, language, replaces_uid FROM video_uploads WHERE id = ?`, [uploadId]);
  if (!uploads.length || !uploads[0].values.length) return;
  const row = uploads[0].values[0];
  const lessonId = row[1];
  const language = row[2];
  const replacesUid = row[3];

  db.run(`UPDATE video_uploads SET status = 'ready', ready_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [uploadId]);

  const existingMedia = db.exec(`SELECT id FROM lesson_media WHERE lesson_id = ? AND language = ?`, [lessonId, language]);
  if (existingMedia.length && existingMedia[0].values.length) {
    const mediaId = existingMedia[0].values[0][0];
    db.run(`UPDATE lesson_media SET cf_video_uid = ?, status = 'ready', video_url = NULL, video_provider = 'cloudflare' WHERE id = ?`, [videoUid, mediaId]);
  } else {
    db.run(`INSERT OR REPLACE INTO lesson_media (lesson_id, language, cf_video_uid, status, video_provider) VALUES (?, ?, ?, 'ready', 'cloudflare')`, [lessonId, language, videoUid]);
  }
  db.run(`UPDATE lessons SET cf_video_uid = ?, video_provider = 'cloudflare' WHERE id = ?`, [videoUid, lessonId]);
  saveDb();

  // Old video (replacesUid) is NOT deleted automatically — §29 requires keeping
  // it for version restoration. Admin can clean up orphaned UIDs manually
  // via DELETE /api/admin/lessons/:id/video/cloudflare
}

function startStatusPolling(videoUid, lessonId, language, uploadId) {
  if (activePolling.has(videoUid)) return;
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts++;
    try {
      const details = await getVideoDetails(videoUid);
      const cfStatus = details.status?.state;
      const db = await getDb();

      if (cfStatus === 'ready') {
        await processReadyVideo(videoUid, uploadId);
        clearInterval(timer);
        activePolling.delete(videoUid);
      } else if (cfStatus === 'error' || cfStatus === 'failed') {
        const errMsg = details.status?.errorDescription || 'Cloudflare processing failed';
        db.run(`UPDATE video_uploads SET status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?`, [errMsg, uploadId]);
        saveDb();
        clearInterval(timer);
        activePolling.delete(videoUid);
      } else {
        db.run(`UPDATE video_uploads SET status = 'processing', updated_at = datetime('now') WHERE id = ?`, [uploadId]);
        saveDb();
      }

      if (attempts >= STATUS_POLL_MAX_ATTEMPTS) {
        db.run(`UPDATE video_uploads SET status = 'error', error_message = 'Status check timeout', updated_at = datetime('now') WHERE id = ?`, [uploadId]);
        saveDb();
        clearInterval(timer);
        activePolling.delete(videoUid);
      }
    } catch (err) {
      console.error(`Status poll error for ${videoUid}:`, err.message);
    }
  }, STATUS_POLL_INTERVAL);
  activePolling.set(videoUid, timer);
}

function stopAllPolling() {
  for (const [uid, timer] of activePolling) {
    clearInterval(timer);
  }
  activePolling.clear();
}

module.exports = {
  isStreamConfigured, isUploadConfigured,
  generateSignedToken, getStreamUrl, resetStreamConfig,
  isMuxConfigured, isMuxUploadConfigured,
  signMuxPlaybackId, getMuxStreamUrl,
  createMuxDirectUpload, getMuxAssetDetails, getMuxUploadStatus, deleteMuxAsset,
  createDirectCreatorUpload, getVideoDetails, listVideos, deleteVideo,
  uploadFileToCloudflare, startStatusPolling, stopAllPolling,
  processReadyVideo,
};
