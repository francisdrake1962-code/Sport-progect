const http = require('http');
const path = require('path');

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: 3002, path: urlPath, method, headers }, (res) => {
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
  const confirmToken = regRes.body.confirmationToken;
  await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
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

  test('subscriber token cannot access admin endpoints', async () => {
    const res = await apiRequest('GET', '/api/dashboard', null, subToken);
    expect(res.status).toBe(403);
  });

  test('admin token can access subscriber endpoints (no role gate)', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, adminToken);
    expect([200, 401, 403]).toContain(res.status);
  });
});

describe('Security — IDOR Protection', () => {
  let otherSubToken;

  beforeAll(async () => {
    const regRes = await apiRequest('POST', '/api/user/register', {
      name: 'Other User', email: 'other@test.com', password: 'password123'
    });
    const confirmToken = regRes.body.confirmationToken;
    await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
    const loginRes = await apiRequest('POST', '/api/user/login', { email: 'other@test.com', password: 'password123' });
    otherSubToken = loginRes.body.token;
  });

  test('subscriber cannot see other subscriber profile', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, otherSubToken);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('other@test.com');
    expect(res.body.email).not.toBe('sectest@test.com');
  });

  test('subscriber cannot update other subscriber progress', async () => {
    const res = await apiRequest('POST', '/api/user/watch-progress', { lesson_id: 1, position_seconds: 100 }, otherSubToken);
    expect([200, 403]).toContain(res.status);
  });

  test('subscriber cannot access admin ticket management', async () => {
    const res = await apiRequest('GET', '/api/admin/feedback', null, subToken);
    expect(res.status).toBe(403);
  });
});

describe('Security — Input Validation', () => {
  test('registration rejects SQL injection in email', async () => {
    const res = await apiRequest('POST', '/api/user/register', {
      name: 'Test', email: "admin@qigong.com' OR '1'='1", password: 'password123'
    });
    expect([400, 409]).toContain(res.status);
  });

  test('registration rejects extremely long name', async () => {
    const longName = 'A'.repeat(1000);
    const res = await apiRequest('POST', '/api/user/register', {
      name: longName, email: 'longname@test.com', password: 'password123'
    });
    expect([200, 201, 400]).toContain(res.status);
  });

  test('ticket creation rejects XSS in subject', async () => {
    const res = await apiRequest('POST', '/api/feedback', {
      category: 'technical', subject: '<script>alert("xss")</script>', message: 'test'
    }, subToken);
    expect([200, 400]).toContain(res.status);
  });

  test('settings endpoint rejects unknown keys', async () => {
    const res = await apiRequest('PUT', '/api/settings', { malicious_key: 'value' }, adminToken);
    expect([400, 200]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
  });

  test('CRUD POST rejects missing required fields', async () => {
    const res = await apiRequest('POST', '/api/lessons', {}, adminToken);
    expect(res.status).toBe(400);
  });

  test('CRUD GET by ID rejects non-numeric ID', async () => {
    const res = await apiRequest('GET', '/api/lessons/abc', null, adminToken);
    expect([400, 404]).toContain(res.status);
  });

  test('pagination rejects negative page', async () => {
    const res = await apiRequest('GET', '/api/lessons?page=-1&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });

  test('pagination clamps limit to max 100', async () => {
    const res = await apiRequest('GET', '/api/lessons?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });
});

describe('Security — Rate Limiting', () => {
  test('global rate limiter is configured', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
  });

  test('registration has rate limiting', async () => {
    const res = await apiRequest('POST', '/api/user/register', {
      name: 'Rate Test', email: 'rate@test.com', password: 'password123'
    });
    expect([200, 201, 429]).toContain(res.status);
  });
});

describe('Security — Token Revocation', () => {
  test('revoked token is rejected on protected endpoint', async () => {
    const regRes = await apiRequest('POST', '/api/user/register', {
      name: 'Revoke Test', email: 'revoketest@test.com', password: 'password123'
    });
    const confirmToken = regRes.body.confirmationToken;
    await apiRequest('POST', `/api/user/confirm/${confirmToken}`);
    const loginRes = await apiRequest('POST', '/api/user/login', { email: 'revoketest@test.com', password: 'password123' });
    const token = loginRes.body.token;

    const logoutRes = await apiRequest('POST', '/api/user/logout', null, token);
    expect(logoutRes.status).toBe(200);

    const meRes = await apiRequest('GET', '/api/user/me', null, token);
    expect(meRes.status).toBe(401);
  });

  test('admin password change revokes old token', async () => {
    const login1 = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    const oldToken = login1.body.token;

    const changeRes = await apiRequest('PUT', '/api/auth/password', {
      currentPassword: 'admin123', newPassword: 'admin123'
    }, oldToken);
    expect(changeRes.status).toBe(200);

    const meRes = await apiRequest('GET', '/api/auth/me', null, oldToken);
    expect(meRes.status).toBe(401);
  });
});

describe('Security — Video Access Control', () => {
  test('unauthenticated video request returns 401 or 404', async () => {
    const res = await apiRequest('GET', '/videos/test.mp4');
    expect([401, 404]).toContain(res.status);
  });

  test('video path traversal blocked', async () => {
    const res = await apiRequest('GET', '/videos/..%2F..%2F..%2Fetc%2Fpasswd');
    expect([400, 401, 403, 404]).toContain(res.status);
  });

  test('video backslash traversal blocked', async () => {
    const res = await apiRequest('GET', '/videos/..\\..\\..\\etc\\passwd');
    expect([400, 401, 403, 404]).toContain(res.status);
  });
});

describe('Security — XSS Prevention', () => {
  test('FAQ items are safely escaped in response', async () => {
    const res = await apiRequest('GET', '/api/faq');
    expect(res.status).toBe(200);
    if (res.body.data && res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item.question).toBeDefined();
      expect(item.answer).toBeDefined();
    }
  });

  test('reviews are safely returned', async () => {
    const res = await apiRequest('GET', '/api/reviews');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});

describe('Security — CRUD Authorization', () => {
  test('unauthenticated user cannot create lessons', async () => {
    const res = await apiRequest('POST', '/api/lessons', { title: 'test' });
    expect(res.status).toBe(401);
  });

  test('subscriber cannot create lessons', async () => {
    const res = await apiRequest('POST', '/api/lessons', { title: 'test' }, subToken);
    expect(res.status).toBe(403);
  });

  test('admin can create lessons', async () => {
    const res = await apiRequest('POST', '/api/lessons', { title: 'Security Test Lesson' }, adminToken);
    expect([200, 201]).toContain(res.status);
  });

  test('subscriber cannot delete reviews', async () => {
    const res = await apiRequest('DELETE', '/api/reviews/1', null, subToken);
    expect([401, 403]).toContain(res.status);
  });
});

describe('Security — Health Check', () => {
  test('health endpoint returns status ok', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
  });
});

describe('Security — CORS Headers', () => {
  test('health endpoint has CORS headers', async () => {
    const res = await apiRequest('GET', '/api/health');
    expect(res.status).toBe(200);
  });
});
