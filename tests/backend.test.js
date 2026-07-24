const path = require('path');
const fs = require('fs');
const http = require('http');

const serverDir = path.join(__dirname, '..', 'server');

describe('Backend — File Structure', () => {
  test('server/index.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'index.js'))).toBe(true);
  });

  test('server/db.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'db.js'))).toBe(true);
  });

  test('server/auth.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'auth.js'))).toBe(true);
  });

  test('server/routes/auth.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'routes', 'auth.js'))).toBe(true);
  });

  test('server/routes/crud.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'routes', 'crud.js'))).toBe(true);
  });

  test('server/services/mailer.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'services', 'mailer.js'))).toBe(true);
  });

  test('server/services/stream.js should exist', () => {
    expect(fs.existsSync(path.join(serverDir, 'services', 'stream.js'))).toBe(true);
  });
});

describe('Backend — db.js module', () => {
  const db = require('../server/db');

  test('should export getDb function', () => {
    expect(typeof db.getDb).toBe('function');
  });

  test('should export saveDb function', () => {
    expect(typeof db.saveDb).toBe('function');
  });

  test('getDb should return a database instance', async () => {
    const database = await db.getDb();
    expect(database).toBeDefined();
    expect(typeof database.exec).toBe('function');
    expect(typeof database.run).toBe('function');
  });
});

describe('Backend — auth.js module', () => {
  const auth = require('../server/auth');

  test('should export authMiddleware function', () => {
    expect(typeof auth.authMiddleware).toBe('function');
  });

  test('should export generateToken function', () => {
    expect(typeof auth.generateToken).toBe('function');
  });

  test('generateToken should return a string', () => {
    const token = auth.generateToken({ id: 1, email: 'test@test.com', role: 'admin' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('Backend — crud.js module', () => {
  const { createCrudRoutes, queryToObjects } = require('../server/routes/crud');

  test('should export createCrudRoutes function', () => {
    expect(typeof createCrudRoutes).toBe('function');
  });

  test('should export queryToObjects function', () => {
    expect(typeof queryToObjects).toBe('function');
  });

  test('queryToObjects should convert exec result to array', () => {
    const mockResult = [{
      columns: ['id', 'name'],
      values: [[1, 'Test'], [2, 'Test2']]
    }];
    const objects = queryToObjects(mockResult);
    expect(objects).toEqual([{ id: 1, name: 'Test' }, { id: 2, name: 'Test2' }]);
  });

  test('queryToObjects should handle empty result', () => {
    expect(queryToObjects([])).toEqual([]);
  });

  test('createCrudRoutes should return an Express Router', () => {
    const router = createCrudRoutes('lessons', ['title']);
    expect(router).toBeDefined();
    expect(typeof router.get).toBe('function');
    expect(typeof router.post).toBe('function');
    expect(typeof router.put).toBe('function');
    expect(typeof router.delete).toBe('function');
  });
});

describe('Backend — mailer module', () => {
  const mailer = require('../server/services/mailer');

  test('should export sendConfirmationEmail function', () => {
    expect(typeof mailer.sendConfirmationEmail).toBe('function');
  });

  test('sendConfirmationEmail should return result in dev mode', async () => {
    const result = await mailer.sendConfirmationEmail('test@test.com', 'fake-token-123');
    expect(result).toBeDefined();
  });
});

describe('Backend — stream module', () => {
  const stream = require('../server/services/stream');

  test('should export isStreamConfigured function', () => {
    expect(typeof stream.isStreamConfigured).toBe('function');
  });

  test('should export generateSignedToken function', () => {
    expect(typeof stream.generateSignedToken).toBe('function');
  });

  test('should export getStreamUrl function', () => {
    expect(typeof stream.getStreamUrl).toBe('function');
  });

  test('isStreamConfigured should return false without env vars', async () => {
    expect(await stream.isStreamConfigured()).toBe(false);
  });

  test('generateSignedToken should return null when not configured', async () => {
    expect(await stream.generateSignedToken('test-uid')).toBeNull();
  });
});

describe('Backend — Database tables', () => {
  let db;

  beforeAll(async () => {
    db = await require('../server/db').getDb();
  });

  const tables = [
    'users', 'lessons', 'complexes', 'exercises', 'schedule',
    'subscribers', 'reviews', 'faq', 'promo_codes', 'transactions',
    'notifications', 'settings'
  ];

  tables.forEach(table => {
    test(`should have ${table} table`, () => {
      const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
      expect(result.length).toBe(1);
      expect(result[0].values[0][0]).toBe(table);
    });
  });

  test('should have admin user', () => {
    const result = db.exec(`SELECT COUNT(*) FROM users WHERE email = 'admin@qigong.com'`);
    expect(result[0].values[0][0]).toBeGreaterThanOrEqual(1);
  });

  test('lessons table should have cf_video_uid column', () => {
    const result = db.exec(`PRAGMA table_info(lessons)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('cf_video_uid');
  });
});

describe('Backend — saveDb async', () => {
  const dbModule = require('../server/db');

  test('saveDb should be a function', () => {
    expect(typeof dbModule.saveDb).toBe('function');
  });

  test('saveDb should not throw on call', () => {
    expect(() => dbModule.saveDb()).not.toThrow();
  });

  test('resetDb should be a function', () => {
    expect(typeof dbModule.resetDb).toBe('function');
  });
});

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: 3001, path: urlPath, method, headers }, (res) => {
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
const TEST_PORT = 3001;

beforeAll(async () => {
  const { resetDb } = require('../server/db');
  resetDb();
  process.env.NODE_ENV = 'test';
  process.env.PORT = TEST_PORT;
  process.env.JWT_SECRET = 'test-secret-for-integration';
  process.env.ALLOWED_ORIGIN = 'http://localhost:' + TEST_PORT;
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

describe('API Integration — Health', () => {
  test('GET /api/health should return ok', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('API Integration — Auth', () => {
  test('POST /api/auth/login should return JWT token', async () => {
    const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.token.split('.')).toHaveLength(3);
  });

  test('POST /api/auth/login should reject wrong password', async () => {
    const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login should reject missing fields', async () => {
    const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com' });
    expect(res.status).toBe(400);
  });

  test('GET /api/auth/me should return user with valid token', async () => {
    const login = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    const res = await apiRequest('GET', '/api/auth/me', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('admin@qigong.com');
  });

  test('GET /api/auth/me should reject unauthenticated', async () => {
    const res = await apiRequest('GET', '/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('API Integration — CRUD Endpoints', () => {
  let token;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    token = login.body.token;
  });

  const endpoints = [
    { name: 'lessons', path: '/api/lessons', fields: { title: 'Тест урок', complex_id: 1, duration: 20, status: 'draft', date: '2026-01-01' }, updateField: { title: 'Обновленный урок' } },
    { name: 'complexes', path: '/api/complexes', fields: { name: 'Тест комплекс', description: 'Описание', status: 'draft' }, updateField: { name: 'Обновленный комплекс' } },
    { name: 'faq', path: '/api/faq', fields: { question: 'Тест вопрос?', answer: 'Тест ответ', sort_order: 99 }, updateField: { question: 'Обновлённый вопрос' } },
    { name: 'promo-codes', path: '/api/promo-codes', fields: { code: 'TEST123', discount: '15%', max_uses: 100, current_uses: 0, active: 1 }, updateField: { code: 'TEST456' } },
  ];

  endpoints.forEach(({ name, path: epPath, fields, updateField }) => {
    test(`GET ${epPath} should return array`, async () => {
      const res = await apiRequest('GET', epPath, null, token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test(`POST ${epPath} should create record`, async () => {
      const res = await apiRequest('POST', epPath, fields, token);
      expect([200, 201]).toContain(res.status);
    });

    test(`PUT ${epPath}/1 should update record`, async () => {
      const res = await apiRequest('PUT', `${epPath}/1`, updateField, token);
      expect([200, 404]).toContain(res.status);
    });

    test(`DELETE ${epPath}/999 should handle missing record`, async () => {
      const res = await apiRequest('DELETE', `${epPath}/999`, null, token);
      expect([200, 404]).toContain(res.status);
    });
  });

  test('GET /api/dashboard should return stats', async () => {
    const res = await apiRequest('GET', '/api/dashboard', null, token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('monthlyRevenue');
  });

  test('GET /api/settings should return object', async () => {
    const res = await apiRequest('GET', '/api/settings', null, token);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });

  test('PUT /api/settings should create/update setting', async () => {
    const res = await apiRequest('PUT', '/api/settings', { app_name: 'Test App' }, token);
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/schedule should return array', async () => {
    const res = await apiRequest('GET', '/api/schedule', null, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('API Integration — Access Control', () => {
  test('unauthenticated GET /api/lessons should return 200 (public)', async () => {
    const res = await apiRequest('GET', '/api/lessons');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('unauthenticated POST /api/lessons should return 401', async () => {
    const res = await apiRequest('POST', '/api/lessons', { title: 'test' });
    expect(res.status).toBe(401);
  });

  test('invalid token on public GET /api/lessons should still return 200', async () => {
    const res = await apiRequest('GET', '/api/lessons', null, 'invalid.token.here');
    expect(res.status).toBe(200);
  });
});

describe('API Integration — User Auth', () => {
  let confirmToken;

  test('POST /api/user/register should create subscriber and return confirmation token', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'Тест Юзер', email: 'testuser@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.message).toBeDefined();
    expect(res.body.confirmation_token).toBeDefined();
    expect(res.body.token).toBeUndefined();
    confirmToken = res.body.confirmation_token;
  });

  test('POST /api/user/register should normalize email', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'Дубль', email: 'TestUser@TEST.COM', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('POST /api/user/register should reject duplicate email', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'Дубль', email: 'testuser@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('POST /api/user/register should reject short password', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'Short', email: 'short@test.com', password: '123' });
    expect(res.status).toBe(400);
  });

  test('POST /api/user/register should reject missing fields', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'NoEmail' });
    expect(res.status).toBe(400);
  });

  test('POST /api/user/login should work in dev mode (auto-confirmed email)', async () => {
    const res = await apiRequest('POST', '/api/user/login', { email: 'testuser@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/user/confirm/:token should confirm email', async () => {
    const res = await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/user/login should return token after confirmation', async () => {
    const res = await apiRequest('POST', '/api/user/login', { email: 'testuser@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.free_sessions_used).toBeDefined();
  });

  test('POST /api/user/login should reject wrong password', async () => {
    const res = await apiRequest('POST', '/api/user/login', { email: 'testuser@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('POST /api/user/login should reject missing fields', async () => {
    const res = await apiRequest('POST', '/api/user/login', { email: 'testuser@test.com' });
    expect(res.status).toBe(400);
  });

  test('POST /api/user/confirm/:token should reject invalid token', async () => {
    const res = await apiRequest('POST', '/api/user/confirm/invalid-token-12345');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('API Integration — User Me', () => {
  let userToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'testuser@test.com', password: 'password123' });
    userToken = login.body.token;
  });

  test('GET /api/user/me should return profile', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, userToken);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('testuser@test.com');
    expect(res.body.free_sessions_used).toBeDefined();
  });

  test('GET /api/user/me should reject unauthenticated', async () => {
    const res = await apiRequest('GET', '/api/user/me');
    expect(res.status).toBe(401);
  });
});

describe('API Integration — Confirm Resend', () => {
  test('POST /api/user/confirm/resend should handle valid email', async () => {
    const res = await apiRequest('POST', '/api/user/confirm/resend', { email: 'testuser@test.com' });
    expect(res.status).toBe(200);
  });

  test('POST /api/user/confirm/resend should handle unknown email gracefully', async () => {
    const res = await apiRequest('POST', '/api/user/confirm/resend', { email: 'unknown@test.com' });
    expect(res.status).toBe(200);
  });

  test('POST /api/user/confirm/resend should reject missing email', async () => {
    const res = await apiRequest('POST', '/api/user/confirm/resend', {});
    expect(res.status).toBe(400);
  });
});

describe('API Integration — User Progress', () => {
  let userToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    userToken = login.body.token;
  });

  test('POST /api/user/watch-progress should save progress', async () => {
    const res = await apiRequest('POST', '/api/user/watch-progress', { lesson_id: 1, position_seconds: 120, completed: true }, userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /api/user/watch-progress should reject missing lesson_id', async () => {
    const res = await apiRequest('POST', '/api/user/watch-progress', { position_seconds: 60 }, userToken);
    expect(res.status).toBe(400);
  });

  test('GET /api/user/progress should return array', async () => {
    const res = await apiRequest('GET', '/api/user/progress', null, userToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('API Integration — Free Period Enforcement', () => {
  let trialToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'anna@example.com', password: 'password123' });
    trialToken = login.body.token;
  });

  test('GET /api/user/can-watch for free lesson should be allowed', async () => {
    const res = await apiRequest('GET', '/api/user/can-watch/1', null, trialToken);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.reason).toBe('free_lesson');
  });

  test('GET /api/user/can-watch for paid lesson should be allowed (trial)', async () => {
    const res = await apiRequest('GET', '/api/user/can-watch/8', null, trialToken);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.reason).toBe('trial');
  });

  test('GET /api/user/can-watch should reject invalid lesson ID', async () => {
    const res = await apiRequest('GET', '/api/user/can-watch/abc', null, trialToken);
    expect(res.status).toBe(400);
  });

  test('GET /api/user/can-watch should return 404 for nonexistent lesson', async () => {
    const res = await apiRequest('GET', '/api/user/can-watch/99999', null, trialToken);
    expect(res.status).toBe(404);
  });

  test('GET /api/user/can-watch for paid subscriber should be allowed', async () => {
    const paidToken = (await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' })).body.token;
    const res = await apiRequest('GET', '/api/user/can-watch/8', null, paidToken);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.reason).toBe('paid');
  });
});

describe('API Integration — Calendar', () => {
  let userToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    userToken = login.body.token;
  });

  test('GET /api/user/calendar should return schedule with stats', async () => {
    const res = await apiRequest('GET', '/api/user/calendar', null, userToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.schedule)).toBe(true);
    expect(res.body.totalDays).toBeGreaterThan(0);
    expect(typeof res.body.completedDays).toBe('number');
    expect(res.body.user).toHaveProperty('plan');
  });

  test('GET /api/user/calendar should reject unauthenticated', async () => {
    const res = await apiRequest('GET', '/api/user/calendar');
    expect(res.status).toBe(401);
  });
});

describe('API Integration — Free Lesson Counter', () => {
  let trialToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'anna@example.com', password: 'password123' });
    trialToken = login.body.token;
  });

  test('completing a free lesson should NOT increment free_sessions_used', async () => {
    const before = await apiRequest('GET', '/api/user/me', null, trialToken);
    const usedBefore = before.body.free_sessions_used || 0;

    await apiRequest('POST', '/api/user/watch-progress', { lesson_id: 1, position_seconds: 300, completed: true }, trialToken);

    const after = await apiRequest('GET', '/api/user/me', null, trialToken);
    expect(after.body.free_sessions_used).toBe(usedBefore);
  });

  test('completing a paid lesson should increment free_sessions_used', async () => {
    const before = await apiRequest('GET', '/api/user/me', null, trialToken);
    const usedBefore = before.body.free_sessions_used || 0;

    await apiRequest('POST', '/api/user/watch-progress', { lesson_id: 8, position_seconds: 300, completed: true }, trialToken);

    const after = await apiRequest('GET', '/api/user/me', null, trialToken);
    expect(after.body.free_sessions_used).toBe(usedBefore + 1);
  });

  test('re-completing same paid lesson should NOT double-increment free_sessions_used', async () => {
    const before = await apiRequest('GET', '/api/user/me', null, trialToken);
    const usedBefore = before.body.free_sessions_used || 0;

    await apiRequest('POST', '/api/user/watch-progress', { lesson_id: 8, position_seconds: 600, completed: true }, trialToken);

    const after = await apiRequest('GET', '/api/user/me', null, trialToken);
    expect(after.body.free_sessions_used).toBe(usedBefore);
  });
});

describe('API Integration — Stream Token', () => {
  let paidToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    paidToken = login.body.token;
  });

  test('GET /api/user/stream-token should return 503 when not configured', async () => {
    const res = await apiRequest('GET', '/api/user/stream-token/1', null, paidToken);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Streaming not configured');
  });

  test('GET /api/user/stream-token should reject invalid lesson ID', async () => {
    const res = await apiRequest('GET', '/api/user/stream-token/abc', null, paidToken);
    expect(res.status).toBe(400);
  });

  test('GET /api/user/stream-token should reject unauthenticated', async () => {
    const res = await apiRequest('GET', '/api/user/stream-token/1');
    expect(res.status).toBe(401);
  });
});

describe('API Integration — Auth exports', () => {
  test('auth.js should export JWT_SECRET', () => {
    const auth = require('../server/auth');
    expect(auth.JWT_SECRET).toBeDefined();
    expect(typeof auth.JWT_SECRET).toBe('string');
  });

  test('user.js should export FREE_LIMIT constant', () => {
    const userRoutes = require('../server/routes/user');
    expect(userRoutes.FREE_LIMIT).toBe(7);
  });
});

describe('API Integration — Video Security', () => {
  test('GET /videos with path traversal should return 403', async () => {
    const res = await apiRequest('GET', '/videos/..%2Fpackage.json');
    expect(res.status).toBe(403);
  });

  test('GET /videos with backslash traversal should return 403', async () => {
    const res = await apiRequest('GET', '/videos/..%5C..%5Cpackage.json');
    expect(res.status).toBe(403);
  });

  test('GET /videos with encoded dots traversal should be blocked (403 or 404)', async () => {
    const res = await apiRequest('GET', '/videos/%2e%2e/package.json');
    expect([403, 404]).toContain(res.status);
  });

  test('GET /videos for nonexistent file should return 404', async () => {
    const res = await apiRequest('GET', '/videos/nonexistent-video.mp4');
    expect(res.status).toBe(404);
  });
});
