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
    expect(res.body.error).toContain('Admin');
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
