const http = require('http');

const PORT = 3005;
let server, start, resetDb, getDb;

function api(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: urlPath, method, headers }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = PORT;
  process.env.JWT_SECRET = 'error-format-test-secret';
  ({ resetDb, getDb } = require('../server/db'));
  ({ start } = require('../server/index'));
  resetDb();
  server = await start();
  await new Promise(r => setTimeout(r, 800));
}, 15000);

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  const { resetDb } = require('../server/db');
  resetDb();
});

async function login(email, password) {
  const res = await api('POST', '/api/user/login', { email, password });
  return res;
}

describe('API-001 — unified error format (user endpoints)', () => {
  test('register: validation error -> {success:false, error:{code,message}, requestId}', async () => {
    const res = await api('POST', '/api/user/register', { name: 'Test', email: 'bad-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.error.message).toBe('string');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId.length).toBeGreaterThan(0);
  });

  test('register: duplicate email -> 409 EMAIL_ALREADY_REGISTERED', async () => {
    const res = await api('POST', '/api/user/register', { name: 'Dup', email: 'maria@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('login: wrong password -> 401 UNAUTHORIZED', async () => {
    const res = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('confirm: invalid token -> 400 INVALID_CONFIRMATION_TOKEN', async () => {
    const res = await api('POST', '/api/user/confirm/invalid-token-xyz');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CONFIRMATION_TOKEN');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('can-watch: no token -> 401 NO_TOKEN', async () => {
    const res = await api('GET', '/api/user/can-watch/8');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NO_TOKEN');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('can-watch: expired paid plan -> 200 allowed:false + top-level code preserved', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'expired', subscription_expires_at = datetime('now', '-1 day'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    require('../server/db').saveDb();
    const loginRes = await login('maria@example.com', 'password123');
    const res = await api('GET', '/api/user/can-watch/8', null, loginRes.body.token);
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('stream-token: expired paid plan -> 403 {success:false, error:{code}, requestId} + top-level code', async () => {
    const db = await getDb();
    db.run(`UPDATE subscribers SET plan = 'monthly', status = 'expired', subscription_expires_at = datetime('now', '-1 day'), email_confirmed = 1 WHERE email = 'maria@example.com'`);
    require('../server/db').saveDb();
    const loginRes = await login('maria@example.com', 'password123');
    const res = await api('GET', '/api/user/stream-token/8', null, loginRes.body.token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('SUBSCRIPTION_EXPIRED');
    expect(res.body.code).toBe('SUBSCRIPTION_EXPIRED');
    expect(typeof res.body.requestId).toBe('string');
  });
});

describe('API-001 — unified error format (payment endpoints)', () => {
  test('create: invalid plan -> 400 INVALID_PLAN', async () => {
    const loginRes = await login('maria@example.com', 'password123');
    const res = await api('POST', '/api/payment/create', { plan: 'weekly' }, loginRes.body.token);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_PLAN');
    expect(typeof res.body.requestId).toBe('string');
  });

  test('admin grants: subscriber without admin role -> 403 FORBIDDEN', async () => {
    const loginRes = await login('maria@example.com', 'password123');
    const res = await api('GET', '/api/payment/admin/grants', null, loginRes.body.token);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(typeof res.body.requestId).toBe('string');
  });
});

describe('API-001 — unified error format (admin auth endpoints)', () => {
  test('admin login: wrong password -> 401 UNAUTHORIZED', async () => {
    const res = await api('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(typeof res.body.requestId).toBe('string');
  });
});
