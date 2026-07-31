const http = require('http');

const PORT = 3007;

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: urlPath, method, headers }, (res) => {
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

let testServer;

beforeAll(async () => {
  process.env.PORT = String(PORT);
  process.env.ALLOWED_ORIGIN = `http://localhost:${PORT}`;
  process.env.RATE_LIMIT_MAX_USER_API = '5';
  process.env.RATE_LIMIT_MAX_CONFIRM = '3';
  const { resetDb } = require('../server/db');
  resetDb();
  const { start } = require('../server/index');
  testServer = await start();
  await new Promise(resolve => setTimeout(resolve, 800));
});

afterAll(async () => {
  if (testServer) {
    await new Promise(resolve => testServer.close(resolve));
  }
  const { resetDb } = require('../server/db');
  resetDb();
});

describe('Rate Limiting — /api/user/stats (userApiLimiter)', () => {
  test('requests under the limit pass, burst over the limit returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await apiRequest('GET', '/api/user/stats');
      expect(res.status).toBe(200);
    }
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await apiRequest('GET', '/api/user/stats');
      if (res.status === 429) {
        got429 = true;
        expect(res.body.error).toContain('Too many requests');
        break;
      }
    }
    expect(got429).toBe(true);
  });
});

describe('Rate Limiting — GET /api/user/confirm/:token (confirmLimiter)', () => {
  test('requests under the limit pass, burst over the limit returns 429', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await apiRequest('GET', '/api/user/confirm/nonexistent-token');
      expect(res.status).not.toBe(429);
    }
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await apiRequest('GET', '/api/user/confirm/nonexistent-token');
      if (res.status === 429) {
        got429 = true;
        expect(res.body.error).toContain('Too many confirmation');
        break;
      }
    }
    expect(got429).toBe(true);
  });
});
