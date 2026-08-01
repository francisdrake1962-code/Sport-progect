const http = require('http');

function apiRequest(method, urlPath, body, token, extraHeaders) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: 3008, path: urlPath, method, headers }, (res) => {
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
const capturedLogs = [];
let originalConsoleLog;

function lastResetToken() {
  for (let i = capturedLogs.length - 1; i >= 0; i--) {
    const m = capturedLogs[i].match(/reset-password\?token=([0-9a-f]{64})/);
    if (m) return m[1];
  }
  return null;
}

beforeAll(async () => {
  const { resetDb } = require('../server/db');
  resetDb();
  process.env.NODE_ENV = 'test';
  process.env.PORT = 3008;
  process.env.JWT_SECRET = 'test-secret-password-reset';
  process.env.ALLOWED_ORIGIN = 'http://localhost:3008';
  process.env.MAIL_PROVIDER = 'console';
  process.env.RATE_LIMIT_MAX_RESET = '10';
  originalConsoleLog = console.log;
  console.log = (...args) => { capturedLogs.push(args.join(' ')); };
  const { start } = require('../server/index');
  testServer = await start();
  await new Promise(r => setTimeout(r, 800));
  const reg = await apiRequest('POST', '/api/user/register', {
    name: 'Reset Tester', email: 'reset@test.com', password: 'password123'
  });
  expect(reg.status).toBe(201);
});

afterAll(async () => {
  if (testServer) await new Promise(r => testServer.close(r));
  console.log = originalConsoleLog;
  const { resetDb } = require('../server/db');
  resetDb();
});

describe('AUTH-001 — request-reset', () => {
  test('unknown email returns generic success without leaking existence', async () => {
    capturedLogs.length = 0;
    const res = await apiRequest('POST', '/api/user/request-reset', { email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(capturedLogs.some(l => l.includes('Password reset link:'))).toBe(false);
    const { getDb } = require('../server/db');
    const db = await getDb();
    const rows = db.exec(`SELECT COUNT(*) FROM subscribers WHERE email = 'ghost@example.com'`);
    expect(rows[0].values[0][0]).toBe(0);
  });

  test('known email stores a one-time token with TTL and never leaks it in the response', async () => {
    capturedLogs.length = 0;
    const res = await apiRequest('POST', '/api/user/request-reset', { email: 'reset@test.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(capturedLogs.some(l => l.includes('Password reset link:'))).toBe(true);
    const token = lastResetToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const { getDb } = require('../server/db');
    const db = await getDb();
    const row = db.exec(`SELECT password_reset_token, password_reset_expires_at FROM subscribers WHERE email = 'reset@test.com'`);
    expect(row[0].values[0][0]).toBeDefined();
    expect(new Date(row[0].values[0][1]).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('AUTH-001 — reset-password negative', () => {
  test('invalid token is rejected with INVALID_RESET_TOKEN', async () => {
    const res = await apiRequest('POST', '/api/user/reset-password', { token: 'f'.repeat(64), newPassword: 'brandnewpass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  test('missing token is rejected with INVALID_RESET_TOKEN', async () => {
    const res = await apiRequest('POST', '/api/user/reset-password', { newPassword: 'brandnewpass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  test('short password is rejected with VALIDATION_ERROR', async () => {
    const res = await apiRequest('POST', '/api/user/reset-password', { token: 'f'.repeat(64), newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('expired token is rejected with INVALID_RESET_TOKEN', async () => {
    capturedLogs.length = 0;
    await apiRequest('POST', '/api/user/request-reset', { email: 'reset@test.com' });
    const token = lastResetToken();
    expect(token).toBeDefined();
    const { getDb } = require('../server/db');
    const db = await getDb();
    db.run(`UPDATE subscribers SET password_reset_expires_at = '2020-01-01T00:00:00.000Z' WHERE email = 'reset@test.com'`);
    const res = await apiRequest('POST', '/api/user/reset-password', { token, newPassword: 'brandnewpass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});

describe('AUTH-001 — full reset flow', () => {
  test('reset changes password, rejects old sessions, new password works, token is one-time', async () => {
    const before = await apiRequest('POST', '/api/user/login', { email: 'reset@test.com', password: 'password123' });
    expect(before.status).toBe(200);
    const oldToken = before.body.token;

    const me = await apiRequest('GET', '/api/user/me', null, oldToken);
    expect(me.status).toBe(200);

    capturedLogs.length = 0;
    await apiRequest('POST', '/api/user/request-reset', { email: 'reset@test.com' });
    const token = lastResetToken();
    expect(token).toBeDefined();

    const res = await apiRequest('POST', '/api/user/reset-password', { token, newPassword: 'brandnewpass1' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const meAfter = await apiRequest('GET', '/api/user/me', null, oldToken);
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.error.code).toBe('TOKEN_REVOKED');

    const oldLogin = await apiRequest('POST', '/api/user/login', { email: 'reset@test.com', password: 'password123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await apiRequest('POST', '/api/user/login', { email: 'reset@test.com', password: 'brandnewpass1' });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toBeDefined();

    const reuse = await apiRequest('POST', '/api/user/reset-password', { token, newPassword: 'anotherpass1' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});

describe('AUTH-001 — email content', () => {
  test('reset email contains a reset link but never the password', () => {
    const { RESET_PASSWORD_HTML } = require('../server/services/mailer');
    const html = RESET_PASSWORD_HTML('http://localhost:3008/reset-password?token=abc123');
    expect(html).toContain('reset-password?token=abc123');
    expect(html).toContain('1 час');
    expect(html).not.toContain('SuperSecretPass1');
  });
});

describe('AUTH-001 — rate limit', () => {
  test('request-reset is rate limited (429)', async () => {
    let hit429 = false;
    for (let i = 0; i < 15 && !hit429; i++) {
      const res = await apiRequest('POST', '/api/user/request-reset', { email: 'rate@test.com' }, null, { 'X-Test-Key': 'rate-limit-check' });
      if (res.status === 429) hit429 = true;
    }
    expect(hit429).toBe(true);
  });
});
