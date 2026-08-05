const http = require('http');
const jwt = require('jsonwebtoken');

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: TEST_PORT, path: urlPath, method, headers }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let testServer;
const TEST_PORT = 3008;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = TEST_PORT;
  process.env.JWT_SECRET = 'test-mux-secret';
  process.env.ALLOWED_ORIGIN = 'http://localhost:' + TEST_PORT;

  delete process.env.MUX_SIGNING_KEY_ID;
  delete process.env.MUX_SIGNING_KEY;
  delete process.env.MUX_ACCESS_TOKEN_ID;
  delete process.env.MUX_ACCESS_TOKEN_SECRET;

  const { resetDb } = require('../server/db');
  resetDb();
  const { start } = require('../server/index');
  testServer = await start();
  await new Promise(resolve => setTimeout(resolve, 500));
});

afterAll(async () => {
  if (testServer) {
    await new Promise(resolve => testServer.close(resolve));
  }
  const { resetDb } = require('../server/db');
  resetDb();
});

async function loginSubscriber() {
  const res = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
  return res.body.token;
}

describe('Video providers — DB schema', () => {
  test('lessons table has video_provider column', async () => {
    const { getDb } = require('../server/db');
    const db = await getDb();
    const result = db.exec(`PRAGMA table_info(lessons)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('video_provider');
  });

  test('lesson_media table has video_provider column', async () => {
    const { getDb } = require('../server/db');
    const db = await getDb();
    const result = db.exec(`PRAGMA table_info(lesson_media)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('video_provider');
  });

  test('seeded lessons use local provider', async () => {
    const { getDb } = require('../server/db');
    const db = await getDb();
    const result = db.exec(`SELECT video_provider FROM lessons WHERE id = 1`);
    expect(result[0].values[0][0]).toBe('local');
  });
});

describe('Video providers — Mux module', () => {
  test('stream.js exports mux functions', () => {
    const stream = require('../server/services/stream');
    expect(typeof stream.isMuxConfigured).toBe('function');
    expect(typeof stream.isMuxUploadConfigured).toBe('function');
    expect(typeof stream.signMuxPlaybackId).toBe('function');
    expect(typeof stream.getMuxStreamUrl).toBe('function');
    expect(typeof stream.createMuxDirectUpload).toBe('function');
    expect(typeof stream.getMuxAssetDetails).toBe('function');
    expect(typeof stream.deleteMuxAsset).toBe('function');
  });

  test('isMuxConfigured returns false without env vars', async () => {
    const stream = require('../server/services/stream');
    stream.resetStreamConfig();
    expect(await stream.isMuxConfigured()).toBe(false);
  });

  test('signMuxPlaybackId returns null when not configured', async () => {
    const stream = require('../server/services/stream');
    stream.resetStreamConfig();
    expect(await stream.signMuxPlaybackId('pb-test-1')).toBeNull();
  });

  test('signMuxPlaybackId produces verifiable HS256 JWT when configured', async () => {
    process.env.MUX_SIGNING_KEY_ID = 'signing-kid-test';
    process.env.MUX_SIGNING_KEY = 'signing-secret-test-0123456789';
    const stream = require('../server/services/stream');
    stream.resetStreamConfig();

    expect(await stream.isMuxConfigured()).toBe(true);
    const token = await stream.signMuxPlaybackId('pb-test-1');
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, process.env.MUX_SIGNING_KEY, { algorithms: ['HS256'] });
    expect(decoded.sub).toBe('pb-test-1');

    const header = jwt.decode(token, { complete: true });
    expect(header.header.alg).toBe('HS256');
    expect(header.header.kid).toBe('signing-kid-test');

    delete process.env.MUX_SIGNING_KEY_ID;
    delete process.env.MUX_SIGNING_KEY;
    stream.resetStreamConfig();
  });

  test('getMuxStreamUrl builds signed m3u8 URL', async () => {
    const stream = require('../server/services/stream');
    const url = await stream.getMuxStreamUrl('pb-test-1', 'token-abc');
    expect(url).toBe('https://stream.mux.com/pb-test-1.m3u8?token=token-abc');
  });
});

describe('Video providers — stream-token dispatch', () => {
  test('stream-token returns 503 for mux lesson when Mux not configured', async () => {
    const { getDb, saveDb } = require('../server/db');
    const db = await getDb();
    db.run(`UPDATE lessons SET video_provider = 'mux', video_id = 'pb-test-1' WHERE id = 1`);
    saveDb();

    const token = await loginSubscriber();
    const res = await apiRequest('GET', '/api/user/stream-token/1', null, token);
    expect(res.status).toBe(503);

    db.run(`UPDATE lessons SET video_provider = 'local', video_id = NULL WHERE id = 1`);
    saveDb();
  });

  test('mux lesson returns signed Mux stream URL when Mux configured', async () => {
    process.env.MUX_SIGNING_KEY_ID = 'signing-kid-test';
    process.env.MUX_SIGNING_KEY = 'signing-secret-test-0123456789';
    const { resetStreamConfig } = require('../server/services/stream');
    resetStreamConfig();

    const { getDb, saveDb } = require('../server/db');
    const db = await getDb();
    db.run(`UPDATE lessons SET video_provider = 'mux', video_id = 'pb-test-1' WHERE id = 1`);
    saveDb();

    const token = await loginSubscriber();
    const res = await apiRequest('GET', '/api/user/stream-token/1', null, token);
    expect(res.status).toBe(200);
    expect(res.body.streamUrl).toMatch(/^https:\/\/stream\.mux\.com\/pb-test-1\.m3u8\?token=/);
    expect(res.body.videoAccessToken).toBeDefined();

    db.run(`UPDATE lessons SET video_provider = 'local', video_id = NULL WHERE id = 1`);
    saveDb();
    delete process.env.MUX_SIGNING_KEY_ID;
    delete process.env.MUX_SIGNING_KEY;
    resetStreamConfig();
  });

  test('local lesson returns null streamUrl (player uses video_url fallback)', async () => {
    process.env.MUX_SIGNING_KEY_ID = 'signing-kid-test';
    process.env.MUX_SIGNING_KEY = 'signing-secret-test-0123456789';
    const { getDb, saveDb } = require('../server/db');
    const db = await getDb();
    db.run(`UPDATE lessons SET video_provider = 'local', video_id = NULL, video_url = '/videos/test.mp4' WHERE id = 1`);
    saveDb();

    const { resetStreamConfig } = require('../server/services/stream');
    resetStreamConfig();

    const token = await loginSubscriber();
    const res = await apiRequest('GET', '/api/user/stream-token/1', null, token);
    expect(res.status).toBe(200);
    expect(res.body.streamUrl).toBeNull();
    expect(res.body.videoAccessToken).toBeDefined();

    db.run(`UPDATE lessons SET video_provider = 'local', video_id = NULL, video_url = '/videos/11 ИЮНЯ. 2025 СУСТАВНАЯ РАЗМИНКА-1784275001698.mp4' WHERE id = 1`);
    saveDb();
    delete process.env.MUX_SIGNING_KEY_ID;
    delete process.env.MUX_SIGNING_KEY;
    resetStreamConfig();
  });
});
