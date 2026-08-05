const http = require('http');

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
const TEST_PORT = 3010;
const originalFetch = global.fetch;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);
  process.env.JWT_SECRET = 'test-admin-video-secret';
  process.env.ALLOWED_ORIGIN = 'http://localhost:' + TEST_PORT;

  delete process.env.MUX_ACCESS_TOKEN_ID;
  delete process.env.MUX_ACCESS_TOKEN_SECRET;

  const { resetDb } = require('../server/db');
  resetDb();
  const { start } = require('../server/index');
  testServer = await start();
  await new Promise(resolve => setTimeout(resolve, 500));
}, 20000);

afterAll(async () => {
  global.fetch = originalFetch;
  const { resetStreamConfig } = require('../server/services/stream');
  resetStreamConfig();
  delete process.env.MUX_ACCESS_TOKEN_ID;
  delete process.env.MUX_ACCESS_TOKEN_SECRET;
  if (testServer) {
    await new Promise(resolve => testServer.close(resolve));
  }
  const { resetDb } = require('../server/db');
  resetDb();
});

async function loginAdmin() {
  const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
  return res.body.token;
}

async function loginSubscriber() {
  const res = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
  return res.body.token;
}

function stubMuxApi(routes) {
  global.fetch = jest.fn((url, _options) => {
    const u = String(url);
    for (const route of routes) {
      if (route.match(u)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: route.data }) });
      }
    }
    return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  });
}

describe('Settings — test-mux endpoint', () => {
  test('reports unconfigured when Mux env vars are absent', async () => {
    const adminToken = await loginAdmin();
    const res = await apiRequest('POST', '/api/settings/test-mux', {}, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.signing).toBe(false);
    expect(res.body.upload).toBe(false);
  });

  test('reports configured when Mux env vars are present', async () => {
    process.env.MUX_ACCESS_TOKEN_ID = 'fake-token';
    process.env.MUX_ACCESS_TOKEN_SECRET = 'fake-secret';
    process.env.MUX_SIGNING_KEY_ID = 'fake-signing-id';
    process.env.MUX_SIGNING_KEY = 'fake-signing-key';
    const { resetStreamConfig } = require('../server/services/stream');
    resetStreamConfig();
    try {
      const adminToken = await loginAdmin();
      const res = await apiRequest('POST', '/api/settings/test-mux', {}, adminToken);
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.signing).toBe(true);
      expect(res.body.upload).toBe(true);
    } finally {
      delete process.env.MUX_ACCESS_TOKEN_ID;
      delete process.env.MUX_ACCESS_TOKEN_SECRET;
      delete process.env.MUX_SIGNING_KEY_ID;
      delete process.env.MUX_SIGNING_KEY;
      resetStreamConfig();
    }
  });
});

describe('Admin video endpoints — access control', () => {
  test('status endpoint requires admin', async () => {
    const subscriberToken = await loginSubscriber();
    const res = await apiRequest('GET', '/api/admin/video-uploads/1/status', null, subscriberToken);
    expect(res.status).toBe(403);
  });

  test('status endpoint requires authentication', async () => {
    const res = await apiRequest('GET', '/api/admin/video-uploads/1/status');
    expect(res.status).toBe(401);
  });
});

describe('Admin video endpoints — mux upload', () => {
  test('returns 400 when Mux upload not configured', async () => {
    const adminToken = await loginAdmin();
    const res = await apiRequest('POST', '/api/admin/lessons/1/video/mux-upload', { language: 'ru' }, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not configured');
  });

  test('returns 404 for missing lesson', async () => {
    process.env.MUX_ACCESS_TOKEN_ID = 'fake-token';
    process.env.MUX_ACCESS_TOKEN_SECRET = 'fake-secret';
    const { resetStreamConfig } = require('../server/services/stream');
    resetStreamConfig();
    try {
      const adminToken = await loginAdmin();
      const res = await apiRequest('POST', '/api/admin/lessons/99999/video/mux-upload', { language: 'ru' }, adminToken);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Lesson not found');
    } finally {
      delete process.env.MUX_ACCESS_TOKEN_ID;
      delete process.env.MUX_ACCESS_TOKEN_SECRET;
      resetStreamConfig();
    }
  });

  test('rejects invalid lesson id', async () => {
    const adminToken = await loginAdmin();
    const res = await apiRequest('POST', '/api/admin/lessons/abc/video/mux-upload', { language: 'ru' }, adminToken);
    expect(res.status).toBe(400);
  });

  test('creates a mux direct upload and stores provider=mux', async () => {
    process.env.MUX_ACCESS_TOKEN_ID = 'fake-token';
    process.env.MUX_ACCESS_TOKEN_SECRET = 'fake-secret';
    const { resetStreamConfig } = require('../server/services/stream');
    resetStreamConfig();
    stubMuxApi([
      { match: u => u.endsWith('/video/v1/uploads'), data: { id: 'mux-upload-1', url: 'https://storage.mux.com/upload-1' } },
    ]);
    try {
      const adminToken = await loginAdmin();
      const res = await apiRequest('POST', '/api/admin/lessons/1/video/mux-upload', { language: 'ru', filename: 'lesson.mp4' }, adminToken);
      expect(res.status).toBe(201);
      expect(res.body.url).toBe('https://storage.mux.com/upload-1');
      expect(res.body.id).toBeGreaterThan(0);

      const { getDb } = require('../server/db');
      const db = await getDb();
      const row = db.exec(`SELECT provider, mux_upload_id, status FROM video_uploads WHERE id = ?`, [res.body.id]);
      expect(row[0].values[0][0]).toBe('mux');
      expect(row[0].values[0][1]).toBe('mux-upload-1');
      expect(row[0].values[0][2]).toBe('uploading');
    } finally {
      global.fetch = originalFetch;
      delete process.env.MUX_ACCESS_TOKEN_ID;
      delete process.env.MUX_ACCESS_TOKEN_SECRET;
      resetStreamConfig();
    }
  });
});

describe('Admin video endpoints — status', () => {
  test('returns 404 for missing upload', async () => {
    const adminToken = await loginAdmin();
    const res = await apiRequest('GET', '/api/admin/video-uploads/99999/status', null, adminToken);
    expect(res.status).toBe(404);
  });

  test('returns mux upload record shape', async () => {
    const { getDb, saveDb } = require('../server/db');
    const db = await getDb();
    db.run(`INSERT INTO video_uploads (lesson_id, language, video_id, original_filename, file_size, status) VALUES (1, 'ru', 'mux-test-uid', 'lesson.mp4', 100, 'ready')`);
    saveDb();
    const idResult = db.exec(`SELECT id FROM video_uploads WHERE video_id = 'mux-test-uid'`);
    const uploadId = idResult[0].values[0][0];

    const adminToken = await loginAdmin();
    const res = await apiRequest('GET', `/api/admin/video-uploads/${uploadId}/status`, null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(uploadId);
    expect(res.body.status).toBe('ready');
    expect(res.body.provider).toBe('mux');
    expect(res.body.video_id).toBe('mux-test-uid');
    expect(res.body.mux_asset_id).toBeNull();
    expect(res.body.mux_playback_id).toBeNull();
    expect(res.body.error_message).toBeNull();
  });

  test('marks mux upload ready and stores asset/playback ids', async () => {
    process.env.MUX_ACCESS_TOKEN_ID = 'fake-token';
    process.env.MUX_ACCESS_TOKEN_SECRET = 'fake-secret';
    const { resetStreamConfig } = require('../server/services/stream');
    resetStreamConfig();
    stubMuxApi([
      { match: u => u.includes('/video/v1/uploads/mux-upload-status-1'), data: { status: 'asset_created', asset_id: 'mux-asset-1' } },
      { match: u => u.includes('/video/v1/assets/mux-asset-1'), data: { status: 'ready', playback_ids: [{ id: 'mux-playback-1' }] } },
    ]);
    try {
      const { getDb, saveDb } = require('../server/db');
      const db = await getDb();
      db.run(`INSERT INTO video_uploads (lesson_id, language, status, provider, mux_upload_id) VALUES (1, 'ru', 'uploading', 'mux', 'mux-upload-status-1')`);
      saveDb();
      const idResult = db.exec(`SELECT id FROM video_uploads WHERE mux_upload_id = 'mux-upload-status-1'`);
      const uploadId = idResult[0].values[0][0];

      const adminToken = await loginAdmin();
      const res = await apiRequest('GET', `/api/admin/video-uploads/${uploadId}/status`, null, adminToken);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.provider).toBe('mux');
      expect(res.body.mux_asset_id).toBe('mux-asset-1');
      expect(res.body.mux_playback_id).toBe('mux-playback-1');
    } finally {
      global.fetch = originalFetch;
      delete process.env.MUX_ACCESS_TOKEN_ID;
      delete process.env.MUX_ACCESS_TOKEN_SECRET;
      resetStreamConfig();
    }
  });
});

describe('Admin video endpoints — delete/unlink', () => {
  test('clears video fields on lesson and lesson_media, preserves provider', async () => {
    const { getDb, saveDb } = require('../server/db');
    const db = await getDb();
    db.run(`UPDATE lessons SET video_id = 'uid-to-clear', video_url = '/videos/test.mp4' WHERE id = 1`);
    db.run(`INSERT OR REPLACE INTO lesson_media (lesson_id, language, video_id, video_url, status) VALUES (1, 'ru', 'uid-to-clear', '/videos/test.mp4', 'ready')`);
    saveDb();

    const adminToken = await loginAdmin();
    const res = await apiRequest('DELETE', '/api/admin/lessons/1/video', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const lesson = db.exec(`SELECT video_id, video_url, video_provider FROM lessons WHERE id = 1`);
    expect(lesson[0].values[0][0]).toBeNull();
    expect(lesson[0].values[0][1]).toBeNull();
    expect(lesson[0].values[0][2]).toBe('local');

    const media = db.exec(`SELECT video_id, video_url, status FROM lesson_media WHERE lesson_id = 1 AND language = 'ru'`);
    expect(media[0].values[0][0]).toBeNull();
    expect(media[0].values[0][1]).toBeNull();
    expect(media[0].values[0][2]).toBe('pending');
  });

  test('returns 404 for missing lesson', async () => {
    const adminToken = await loginAdmin();
    const res = await apiRequest('DELETE', '/api/admin/lessons/99999/video', null, adminToken);
    expect(res.status).toBe(404);
  });
});
