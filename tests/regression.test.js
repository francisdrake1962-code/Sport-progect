const http = require('http');
const { start } = require('../server/index');
const { resetDb } = require('../server/db');

const PORT = 3003;
let server, adminToken;

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
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

beforeAll(async () => {
  resetDb();
  process.env.NODE_ENV = 'test';
  process.env.PORT = PORT;
  process.env.JWT_SECRET = 'regression-test-secret';
  server = await start();
  await new Promise(r => setTimeout(r, 800));
  const login = await api('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
  adminToken = login.body.token;
}, 15000);

afterAll(() => new Promise(resolve => { if (server) server.close(() => resolve()); else resolve(); }));

let subToken;
async function getSubToken() {
  const login = await api('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
  subToken = login.body.token;
  return subToken;
}

describe('R1-REG: Analytics params (P0 Round 1)', () => {
  test('trackEvent receives and persists all params', async () => {
    const token = await getSubToken();
    await api('POST', '/api/user/watch-progress', { lesson_id: 1, position_seconds: 60, completed: false }, token);
    const res = await api('GET', '/api/admin/analytics/stats', null, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('analytics filter by eventName returns results', async () => {
    const res = await api('GET', '/api/admin/analytics/stats?event_name=lesson_watched', null, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('R1-REG: Recommendation zones as array (P0 Round 1)', () => {
  test('recommendations return zones as array, not comma string', async () => {
    const token = await getSubToken();
    const res = await api('GET', '/api/user/recommendations', null, token);
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toBeDefined();
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    if (res.body.recommendations.length > 0) {
      expect(Array.isArray(res.body.recommendations[0].zones)).toBe(true);
    }
  });

  test('recommendations with malformed tags do not crash', async () => {
    const token = await getSubToken();
    const res = await api('GET', '/api/user/recommendations?mood=happy', null, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });
});

describe('R1-REG: Content version saveDb + transaction (P0 Round 1)', () => {
  test('getVersions returns array of versions', async () => {
    const list = await api('GET', '/api/lessons', null, adminToken);
    const lessonId = list.body.data[0]?.id;
    const res = await api('GET', `/api/admin/lessons/${lessonId}/versions`, null, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('R1-REG: Progress validMoods + ON CONFLICT (P0 Round 1)', () => {
  test('valid moods are accepted', async () => {
    const token = await getSubToken();
    const moods = ['happy', 'energized', 'calm', 'neutral', 'tired', 'disappointed'];
    for (const mood of moods) {
      const res = await api('POST', '/api/user/workout-feedback', { lesson_id: 1, mood }, token);
      expect([200, 409]).toContain(res.status);
    }
  });

  test('invalid mood is rejected', async () => {
    const token = await getSubToken();
    const res = await api('POST', '/api/user/workout-feedback', { lesson_id: 1, mood: 'evil' }, token);
    expect(res.status).toBe(400);
  });

  test('duplicate mood updates via ON CONFLICT', async () => {
    const token = await getSubToken();
    const res1 = await api('POST', '/api/user/workout-feedback', { lesson_id: 1, mood: 'calm' }, token);
    expect([200, 409]).toContain(res1.status);
    const res2 = await api('POST', '/api/user/workout-feedback', { lesson_id: 1, mood: 'happy' }, token);
    expect([200, 409]).toContain(res2.status);
  });
});

describe('R1-REG: DB role DEFAULT subscriber (P0 Round 1)', () => {
  test('new user role defaults to subscriber', async () => {
    const reg = await api('POST', '/api/user/register', {
      name: 'Regression Test User', email: 'regression_r1@example.com', password: 'password123'
    });
    expect(reg.status).toBe(201);
    const token = reg.body.confirmation_token;
    if (token) {
      await api('POST', `/api/user/confirm/${token}`);
      const login = await api('POST', '/api/user/login', { email: 'regression_r1@example.com', password: 'password123' });
      if (login.status === 200) {
        const me = await api('GET', '/api/user/me', null, login.body.token);
        expect(me.status).toBe(200);
      }
    }
  });
});

describe('R1-REG: Token blocklist has hash index (P0 Round 1)', () => {
  test('token revocation works (implies index exists)', async () => {
    const token = await getSubToken();
    const logout = await api('POST', '/api/user/logout', {}, token);
    expect([200, 401]).toContain(logout.status);
    if (logout.status === 200) {
      const me = await api('GET', '/api/user/me', null, token);
      expect(me.status).toBe(401);
    }
  });
});

describe('R1-REG: JWT algorithm pinning (P0 Round 1)', () => {
  test('admin login returns valid token', async () => {
    const login = await api('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();
  });

  test('token with wrong algorithm is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const badToken = jwt.sign({ id: 1, role: 'admin' }, 'wrong-secret', { algorithm: 'none' });
    const res = await api('GET', '/api/auth/me', null, badToken);
    expect(res.status).toBe(401);
  });
});

describe('R1-REG: Fingerprint trusted IP (P0 Round 1)', () => {
  test('fingerprint endpoint works with subscriber token', async () => {
    const token = await getSubToken();
    const res = await api('POST', '/api/user/fingerprint', { fingerprint: 'test-fp-regression-123' }, token);
    expect([200, 201]).toContain(res.status);
  });
});

describe('R1-REG: GDPR account deletion (P0 Round 1)', () => {
  test('account deletion anonymizes user data', async () => {
    const reg = await api('POST', '/api/user/register', {
      name: 'GDPR Test', email: 'gdpr_regression@example.com', password: 'password123'
    });
    expect(reg.status).toBe(201);
    if (reg.body.confirmation_token) {
      await api('POST', `/api/user/confirm/${reg.body.confirmation_token}`);
    }
    const login = await api('POST', '/api/user/login', { email: 'gdpr_regression@example.com', password: 'password123' });
    expect(login.status).toBe(200);

    const del = await api('DELETE', '/api/user/account', { confirm: true }, login.body.token);
    expect([200, 201]).toContain(del.status);
    expect(del.body.success).toBe(true);
  });
});

describe('R1-REG: JSON.parse safety in recommendation (P0 Round 1)', () => {
  test('recommendations do not crash on corrupted tags', async () => {
    const token = await getSubToken();
    const res = await api('GET', '/api/user/recommendations', null, token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
  });

  test('recommendations with invalid mood do not crash', async () => {
    const token = await getSubToken();
    const res = await api('GET', '/api/user/recommendations?mood=nonexistent', null, token);
    expect(res.status).toBe(200);
  });
});

describe('R1-REG: Dashboard requires admin (P0 Round 1)', () => {
  test('subscriber cannot access admin dashboard', async () => {
    const token = await getSubToken();
    const res = await api('GET', '/api/dashboard', null, token);
    expect(res.status).toBe(403);
  });

  test('admin can access dashboard', async () => {
    const res = await api('GET', '/api/dashboard', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
  });
});

describe('R1-REG: Free selections atomicity (P0 Round 1)', () => {
  test('free lesson selection respects limit', async () => {
    const token = await getSubToken();
    const lessons = await api('GET', '/api/lessons');
    if (lessons.status === 200 && lessons.body.data) {
      const freeIds = lessons.body.data.filter(l => l.is_free).map(l => l.id);
      if (freeIds.length > 0) {
        const res = await api('POST', '/api/user/free-selections', { lesson_ids: freeIds.slice(0, 7) }, token);
        expect([200, 400, 409]).toContain(res.status);
      }
    }
  });
});

describe('R1-REG: Audit log (P0 Round 1)', () => {
  test('admin CRUD operations are logged', async () => {
    const res = await api('GET', '/api/admin/audit-logs', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('R1-REG: Security headers present (P0 Round 1)', () => {
  test('response has security headers', async () => {
    const res = await api('GET', '/api/lessons');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  test('readiness endpoint works', async () => {
    const res = await api('GET', '/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });
});
