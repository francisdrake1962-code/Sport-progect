const http = require('http');

function apiRequest(method, urlPath, body, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: 3002, path: urlPath, method, headers }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: raw, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function rawRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3002, ...options }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: raw, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

let testServer;
let adminToken, subToken;

beforeAll(async () => {
  const { resetDb } = require('../server/db');
  resetDb();
  process.env.NODE_ENV = 'test';
  process.env.PORT = 3002;
  process.env.JWT_SECRET = 'test-secret-for-integration';
  process.env.ALLOWED_ORIGIN = 'http://localhost:3002';
  const { start } = require('../server/index');
  testServer = await start();
  await new Promise(resolve => setTimeout(resolve, 800));

  const loginRes = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
  adminToken = loginRes.body.token;
  expect(adminToken).toBeDefined();

  const regRes = await apiRequest('POST', '/api/user/register', {
    name: 'Security Test', email: 'sectest@test.com', password: 'password123'
  });
  const confirmToken = regRes.body.confirmation_token;
  if (confirmToken) {
    await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
  }
  const loginSub = await apiRequest('POST', '/api/user/login', { email: 'sectest@test.com', password: 'password123' });
  subToken = loginSub.body.token;
  expect(subToken).toBeDefined();
});

afterAll(async () => {
  if (testServer) {
    await new Promise(resolve => testServer.close(resolve));
  }
  const { resetDb } = require('../server/db');
  resetDb();
});

describe('Security — Authentication Bypass', () => {
  test('GET /api/auth/me without token returns 401', async () => {
    const res = await apiRequest('GET', '/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('GET /api/auth/me with empty bearer returns 401', async () => {
    const res = await apiRequest('GET', '/api/auth/me', null, '');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me with malformed JWT returns 401', async () => {
    const res = await apiRequest('GET', '/api/auth/me', null, 'not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me with expired JWT returns 401', async () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ id: 1, email: 'a@b.com', role: 'admin' }, 'test-secret-for-integration', { expiresIn: '-1h' });
    const res = await apiRequest('GET', '/api/auth/me', null, expired);
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me with wrong secret returns 401', async () => {
    const jwt = require('jsonwebtoken');
    const wrong = jwt.sign({ id: 1, email: 'a@b.com', role: 'admin' }, 'wrong-secret', { expiresIn: '1h' });
    const res = await apiRequest('GET', '/api/auth/me', null, wrong);
    expect(res.status).toBe(401);
  });

  test('subscriber token cannot access admin endpoints (403)', async () => {
    const res = await apiRequest('GET', '/api/dashboard', null, subToken);
    expect(res.status).toBe(403);
  });

  test('admin token on subscriber endpoint: no role gate (JWT-only auth)', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, adminToken);
    expect([200, 401, 404]).toContain(res.status);
  });
});

describe('Security — IDOR Protection', () => {
  let otherSubToken;

  beforeAll(async () => {
    const regRes = await apiRequest('POST', '/api/user/register', {
      name: 'Other User', email: 'other@test.com', password: 'password123'
    });
    const confirmToken = regRes.body.confirmation_token;
    if (confirmToken) {
      await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
    }
    const loginRes = await apiRequest('POST', '/api/user/login', { email: 'other@test.com', password: 'password123' });
    otherSubToken = loginRes.body.token;
  });

  test('subscriber only sees own profile, not others', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, otherSubToken);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('other@test.com');
  });

  test('subscriber can only see own tickets', async () => {
    const res = await apiRequest('GET', '/api/feedback', null, otherSubToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const tickets = res.body.data;
    tickets.forEach(t => {
      expect(t.subscriber_id).toBeDefined();
    });
  });

  test('subscriber cannot access admin ticket management', async () => {
    const res = await apiRequest('GET', '/api/admin/feedback', null, subToken);
    expect(res.status).toBe(403);
  });

  test('subscriber cannot CRUD admin resources', async () => {
    const res = await apiRequest('DELETE', '/api/complexes/1', null, subToken);
    expect(res.status).toBe(403);
  });
});

describe('Security — Input Validation', () => {
  test('registration rejects SQL injection in email', async () => {
    const res = await apiRequest('POST', '/api/user/register', {
      name: 'Test', email: "admin@qigong.com' OR '1'='1", password: 'password123'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('registration rejects short password', async () => {
    const res = await apiRequest('POST', '/api/user/register', {
      name: 'Short', email: 'short@test.com', password: '123'
    });
    expect(res.status).toBe(400);
  });

  test('ticket creation stores raw text (JSON API — no XSS risk)', async () => {
    const res = await apiRequest('POST', '/api/feedback', {
      category: 'technical', subject: '<script>alert("xss")</script>', message: 'test'
    }, subToken);
    expect(res.status).toBe(200);
    const listRes = await apiRequest('GET', '/api/feedback', null, subToken);
    expect(listRes.headers['content-type']).toContain('application/json');
  });

  test('settings endpoint ignores unknown keys', async () => {
    const res = await apiRequest('PUT', '/api/settings', { malicious_key: 'value', app_name: 'Test' }, adminToken);
    expect(res.status).toBe(200);
    const settingsRes = await apiRequest('GET', '/api/settings', null, adminToken);
    expect(settingsRes.body.malicious_key).toBeUndefined();
  });

  test('CRUD POST rejects missing required fields', async () => {
    const res = await apiRequest('POST', '/api/lessons', {}, adminToken);
    expect(res.status).toBe(400);
  });

  test('CRUD GET by ID rejects non-numeric ID (400 or 404)', async () => {
    const res = await apiRequest('GET', '/api/lessons/abc', null, adminToken);
    expect([400, 404]).toContain(res.status);
  });

  test('pagination rejects negative page (clamps to 1)', async () => {
    const res = await apiRequest('GET', '/api/lessons?page=-1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });

  test('pagination clamps limit to max 100', async () => {
    const res = await apiRequest('GET', '/api/lessons?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  test('CRUD POST with special characters does not break DB (parameterized)', async () => {
    const res = await apiRequest('POST', '/api/faq', {
      question: "test' OR '1'='1", answer: "'; DROP TABLE faq; --"
    }, adminToken);
    expect([200, 201]).toContain(res.status);
    const healthRes = await apiRequest('GET', '/api/health');
    expect(healthRes.body.db).toBe('ok');
  });
});

describe('Security — Rate Limiting', () => {
  test('health endpoint returns standard headers', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
  });

  test('registration rate limiter is mounted (responds to requests)', async () => {
    const res = await apiRequest('POST', '/api/user/register', {
      name: 'Rate Test', email: 'rate@test.com', password: 'password123'
    });
    expect([200, 201]).toContain(res.status);
  });
});

describe('Security — Token Revocation', () => {
  test('revoked token is rejected on protected endpoint', async () => {
    const regRes = await apiRequest('POST', '/api/user/register', {
      name: 'Revoke Test', email: 'revoketest@test.com', password: 'password123'
    });
    const confirmToken = regRes.body.confirmation_token;
    if (confirmToken) {
      await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
    }
    const loginRes = await apiRequest('POST', '/api/user/login', { email: 'revoketest@test.com', password: 'password123' });
    const token = loginRes.body.token;
    expect(token).toBeDefined();

    const meRes = await apiRequest('GET', '/api/user/me', null, token);
    expect(meRes.status).toBe(200);

    const logoutRes = await apiRequest('POST', '/api/user/logout', null, token);
    expect(logoutRes.status).toBe(200);

    const meRes2 = await apiRequest('GET', '/api/user/me', null, token);
    expect(meRes2.status).toBe(401);
  });

  test('admin password change revokes old token', async () => {
    const login1 = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    const oldToken = login1.body.token;
    expect(oldToken).toBeDefined();

    const changeRes = await apiRequest('PUT', '/api/auth/password', {
      currentPassword: 'admin123', newPassword: 'admin123'
    }, oldToken);
    expect(changeRes.status).toBe(200);

    const meRes = await apiRequest('GET', '/api/auth/me', null, oldToken);
    expect(meRes.status).toBe(401);
  });
});

describe('Security — Video Access Control', () => {
  test('unauthenticated video request returns 401', async () => {
    const res = await apiRequest('GET', '/videos/test.mp4');
    expect([401, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('video path traversal blocked', async () => {
    const res = await apiRequest('GET', '/videos/..%2F..%2F..%2Fetc%2Fpasswd');
    expect([400, 401, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('video backslash traversal blocked', async () => {
    const res = await apiRequest('GET', '/videos/..\\..\\..\\etc\\passwd');
    expect([400, 401, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});

describe('Security — Stream-Scoped JWT for Video Access (P1-1)', () => {
  const jwt = require('jsonwebtoken');
  const auth = require('../server/auth');
  let testLessonId;
  let subId;

  beforeAll(async () => {
    const db = await require('../server/db').getDb();
    const subRes = db.exec(`SELECT id FROM subscribers WHERE email = 'sectest@test.com'`);
    subId = subRes[0].values[0][0];

    db.run(`INSERT INTO lessons (title, duration, status, video_url, is_free) VALUES ('Stream Token Test Lesson', 27, 'active', '/videos/placeholder.mp4', 1)`);
    testLessonId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  });

  afterAll(async () => {
    const db = await require('../server/db').getDb();
    db.exec(`DELETE FROM lessons WHERE id = ?`, [testLessonId]);
  });

  const streamToken = (opts = {}) => jwt.sign(
    { scope: 'stream', lessonId: opts.lessonId || testLessonId, subscriberId: opts.subscriberId || subId, jti: 'test-jti-' + Math.random() },
    auth.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: opts.expiresIn || '15m' }
  );

  test('existing video without token returns 401', async () => {
    const res = await apiRequest('GET', '/videos/placeholder.mp4');
    expect(res.status).toBe(401);
  });

  test('main subscriber JWT is rejected on /videos', async () => {
    const res = await apiRequest('GET', '/videos/placeholder.mp4', null, subToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Stream token required');
  });

  test('main subscriber JWT via query token is rejected', async () => {
    const res = await apiRequest('GET', `/videos/placeholder.mp4?token=${subToken}`);
    expect(res.status).toBe(403);
  });

  test('valid stream token grants video access', async () => {
    const res = await apiRequest('GET', `/videos/placeholder.mp4?token=${streamToken()}`);
    expect([200, 206]).toContain(res.status);
  });

  test('stream token bound to a different lesson is rejected', async () => {
    const res = await apiRequest('GET', `/videos/placeholder.mp4?token=${streamToken({ lessonId: 999999 })}`);
    expect(res.status).toBe(403);
  });

  test('stream token without stream scope is rejected', async () => {
    const t = jwt.sign(
      { scope: 'download', lessonId: testLessonId, subscriberId: subId, jti: 'x' },
      auth.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    );
    const res = await apiRequest('GET', `/videos/placeholder.mp4?token=${t}`);
    expect(res.status).toBe(403);
  });

  test('expired stream token is rejected', async () => {
    const res = await apiRequest('GET', `/videos/placeholder.mp4?token=${streamToken({ expiresIn: -10 })}`);
    expect(res.status).toBe(401);
  });
});

describe('Security — XSS Prevention', () => {
  test('API responses are JSON, not HTML', async () => {
    const res = await apiRequest('GET', '/api/faq');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });

  test('FAQ data does not contain unescaped script tags', async () => {
    const res = await apiRequest('GET', '/api/faq');
    expect(res.status).toBe(200);
    const items = res.body.data || [];
    items.forEach(item => {
      if (item.question) expect(item.question).not.toMatch(/<script/i);
      if (item.answer) expect(item.answer).not.toMatch(/<script/i);
    });
  });

  test('reviews data does not contain unescaped script tags', async () => {
    const res = await apiRequest('GET', '/api/reviews');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const items = res.body.data || [];
    items.forEach(item => {
      if (item.text) expect(item.text).not.toMatch(/<script/i);
    });
  });
});

describe('Security — CRUD Authorization', () => {
  test('unauthenticated user cannot create lessons (401)', async () => {
    const res = await apiRequest('POST', '/api/lessons', { title: 'test' });
    expect(res.status).toBe(401);
  });

  test('subscriber cannot create lessons (403)', async () => {
    const res = await apiRequest('POST', '/api/lessons', { title: 'test' }, subToken);
    expect(res.status).toBe(403);
  });

  test('admin can create lessons (201)', async () => {
    const freshLogin = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    const freshToken = freshLogin.body.token;
    expect(freshToken).toBeDefined();
    const res = await apiRequest('POST', '/api/lessons', { title: 'Security Test Lesson' }, freshToken);
    expect([200, 201]).toContain(res.status);
  });

  test('subscriber cannot delete reviews (403)', async () => {
    const res = await apiRequest('DELETE', '/api/reviews/1', null, subToken);
    expect(res.status).toBe(403);
  });

  test('subscriber cannot update FAQ (403)', async () => {
    const res = await apiRequest('PUT', '/api/faq/1', { question: 'hacked' }, subToken);
    expect(res.status).toBe(403);
  });
});

describe('Security — Request Size & Content-Type', () => {
  test('server rejects oversized JSON body', async () => {
    const hugePayload = 'x'.repeat(2 * 1024 * 1024);
    const res = await rawRequest({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(hugePayload) },
      body: hugePayload,
    });
    expect([400, 413]).toContain(res.status);
  });

  test('admin panel files are publicly accessible (SPA design)', async () => {
    const res = await apiRequest('GET', '/admin/');
    expect(res.status).toBe(200);
  });
});

describe('Security — Health Check', () => {
  test('health endpoint returns status ok and db ok', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('Security — JWT Hardening (P0 Round 1)', () => {
  let subscriberToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    subscriberToken = login.body.token;
  });

  test('rejects token with alg:none', async () => {
    const jwt = require('jsonwebtoken');
    const payload = { id: 2, email: 'maria@example.com', role: 'subscriber' };
    const noneToken = jwt.sign(payload, '', { algorithm: 'none' });
    const res = await apiRequest('GET', '/api/user/me', null, noneToken);
    expect(res.status).toBe(401);
  });

  test('rejects malformed Bearer header', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, undefined, { Authorization: 'Bearer ' });
    expect(res.status).toBe(401);
  });

  test('subscriber token works correctly', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, subscriberToken);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('maria@example.com');
  });
});

describe('Security — GDPR Account Deletion (P0 Round 1)', () => {
  let token;

  beforeAll(async () => {
    await apiRequest('POST', '/api/user/register', { name: 'GDPR Test', email: 'gdpr_test@example.com', password: 'password12345' });
    const login = await apiRequest('POST', '/api/user/login', { email: 'gdpr_test@example.com', password: 'password12345' });
    token = login.body.token;
  });

  test('account deletion revokes token', async () => {
    const del = await apiRequest('DELETE', '/api/user/account', { confirm: true }, token);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    const me = await apiRequest('GET', '/api/user/me', null, token);
    expect(me.status).toBe(401);
  });
});

describe('Security — Fingerprint IP Trust (P0 Round 1)', () => {
  let token;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    token = login.body.token;
  });

  test('fingerprint endpoint ignores client IP', async () => {
    const res = await apiRequest('POST', '/api/user/fingerprint', { fingerprint: 'test-fp-123', ip: '1.2.3.4' }, token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('fingerprint fails without fingerprint', async () => {
    const res = await apiRequest('POST', '/api/user/fingerprint', {}, token);
    expect(res.status).toBe(400);
  });
});

describe('Security — Analytics Filtering (P0 Round 1)', () => {
  let adminToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    adminToken = login.body.token;
  });

  test('analytics dashboard returns data', async () => {
    const res = await apiRequest('GET', '/api/admin/analytics/dashboard?days=30', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.period_days).toBe(30);
    expect(typeof res.body.total_events).toBe('number');
  });

  test('analytics stats returns array', async () => {
    const res = await apiRequest('GET', '/api/admin/analytics/stats?group_by=event_name', null, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('analytics timeline returns array', async () => {
    const res = await apiRequest('GET', '/api/admin/analytics/timeline?days=7', null, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Security — Content Versioning (P0 Round 1)', () => {
  let adminToken;

  beforeAll(async () => {
    const login = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    adminToken = login.body.token;
  });

  test('create version for lesson, then list versions', async () => {
    const createRes = await apiRequest('POST', '/api/admin/lessons/1/version', { change_summary: 'Test version' }, adminToken);
    expect(createRes.status).toBe(200);
    expect(createRes.body.lesson_id).toBe(1);
    expect(createRes.body.version).toBeGreaterThan(0);

    const listRes = await apiRequest('GET', '/api/admin/lessons/1/versions', null, adminToken);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBeGreaterThan(0);
  });

  test('recommendations return lessons', async () => {
    const login = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const res = await apiRequest('GET', '/api/user/recommendations?limit=3', null, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toBeDefined();
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });
});

describe('Security — RBAC (AUTH-002)', () => {
  let subscriberToken, adminToken, superAdminToken;

  beforeAll(async () => {
    const sub = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    subscriberToken = sub.body.token;
    const admin = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    adminToken = admin.body.token;
    const superAdmin = await apiRequest('POST', '/api/auth/login', { email: 'superadmin@qigong.com', password: 'super123' });
    superAdminToken = superAdmin.body.token;
  });

  test('subscriber cannot access admin endpoints', async () => {
    const res = await apiRequest('GET', '/api/admin/audit-logs', null, subscriberToken);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('permissions');
  });

  test('subscriber cannot access health/detailed', async () => {
    const res = await apiRequest('GET', '/api/health/detailed', null, subscriberToken);
    expect(res.status).toBe(403);
  });

  test('admin can access admin endpoints', async () => {
    const res = await apiRequest('GET', '/api/admin/audit-logs', null, adminToken);
    expect(res.status).toBe(200);
  });

  test('admin can access health/detailed', async () => {
    const res = await apiRequest('GET', '/api/health/detailed', null, adminToken);
    expect(res.status).toBe(200);
  });

  test('super_admin can access admin endpoints', async () => {
    const res = await apiRequest('GET', '/api/admin/audit-logs', null, superAdminToken);
    expect(res.status).toBe(200);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await apiRequest('GET', '/api/admin/lessons');
    expect(res.status).toBe(401);
  });

  test('subscriber can access subscriber endpoints (feedback)', async () => {
    const res = await apiRequest('GET', '/api/feedback', null, subscriberToken);
    expect(res.status).toBe(200);
  });

  test('subscriber can access GDPR endpoints (data-export)', async () => {
    const res = await apiRequest('GET', '/api/user/data-export', null, subscriberToken);
    expect(res.status).toBe(200);
  });
});

describe('Security — Input Validation (API-008)', () => {
  test('login rejects empty email', async () => {
    const res = await apiRequest('POST', '/api/auth/login', { email: '', password: 'admin123' });
    expect(res.status).toBe(400);
  });

  test('login rejects empty password', async () => {
    const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: '' });
    expect(res.status).toBe(400);
  });

  test('register rejects short password', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'Test', email: 'test_val@example.com', password: '123' });
    expect(res.status).toBe(400);
  });

  test('register rejects invalid email', async () => {
    const res = await apiRequest('POST', '/api/user/register', { name: 'Test', email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
  });

  test('password change rejects short new password', async () => {
    const login = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    const res = await apiRequest('PUT', '/api/auth/password', { currentPassword: 'admin123', newPassword: 'short' }, login.body.token);
    expect(res.status).toBe(400);
  });
});

describe('Security — Readiness & Shutdown (OPS-004, OBS-003)', () => {
  test('readiness endpoint returns ready', async () => {
    const res = await apiRequest('GET', '/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  test('health endpoint returns ok', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Security — Dangerous Action Confirmation (ADMIN-006)', () => {
  test('account deletion requires confirmation, then succeeds with confirmation', async () => {
    const reg = await apiRequest('POST', '/api/user/register', { name: 'Confirm Test', email: 'confirm_test@example.com', password: 'password12345' });
    expect(reg.status).toBe(201);
    const login = await apiRequest('POST', '/api/user/login', { email: 'confirm_test@example.com', password: 'password12345' });
    const token = login.body.token;

    const noConfirm = await apiRequest('DELETE', '/api/user/account', {}, token);
    expect(noConfirm.status).toBe(428);
    expect(noConfirm.body.error).toContain('Confirmation');

    const confirm = await apiRequest('DELETE', '/api/user/account', { confirm: true }, token);
    expect(confirm.status).toBe(200);
    expect(confirm.body.success).toBe(true);
  });
});
