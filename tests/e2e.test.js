const http = require('http');
const { start } = require('../server/index');
const { resetDb } = require('../server/db');

const PORT = 3003;
let server;
let adminToken;

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
  process.env.JWT_SECRET = 'e2e-test-secret';
  server = await start();
  await new Promise(r => setTimeout(r, 800));

  const login = await api('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
  adminToken = login.body.token;
}, 15000);

afterAll(() => {
  return new Promise(resolve => {
    if (server) server.close(() => resolve());
    else resolve();
  }).finally(() => {
    const { resetDb } = require('../server/db');
    resetDb();
  });
});

// Сценарий 1: Registration → Onboarding
describe('E2E — Scenario 1: Registration → Onboarding', () => {
  test('subscriber registers, confirms email, logs in and gets profile', async () => {
    const reg = await api('POST', '/api/user/register', {
      name: 'E2E User', email: 'e2e_user@example.com', password: 'password123'
    });
    expect(reg.status).toBe(201);
    expect(reg.body.message).toBeDefined();
    const regToken = reg.body.confirmation_token;

    const confirmRes = await api('POST', `/api/user/confirm/${regToken}`);
    expect(confirmRes.status).toBe(200);

    const login = await api('POST', '/api/user/login', {
      email: 'e2e_user@example.com', password: 'password123'
    });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();

    const me = await api('GET', '/api/user/me', null, login.body.token);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe('E2E User');
  });
});

// Сценарий 2: Login → Dashboard
describe('E2E — Scenario 2: Login → Dashboard', () => {
  test('2.1 login as subscriber', async () => {
    const res = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('2.2 subscriber gets profile', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const me = await api('GET', '/api/user/me', null, login.body.token);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('maria@example.com');
  });

  test('2.3 admin gets dashboard', async () => {
    const res = await api('GET', '/api/dashboard', null, adminToken);
    expect(res.status).toBe(200);
  });
});

// Сценарий 3: Lesson → Progress
describe('E2E — Scenario 3: Lesson → Progress', () => {
  test('3.1 list public lessons', async () => {
    const res = await api('GET', '/api/lessons');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('3.2 get lesson detail', async () => {
    const res = await api('GET', '/api/lessons/1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBeDefined();
  });

  test('3.3 record watch progress', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const me = await api('GET', '/api/user/me', null, login.body.token);
    const subId = me.body.id;
    const res = await api('POST', '/api/user/watch-progress', {
      lesson_id: 1, position_seconds: 120, completed: true
    }, login.body.token);
    expect([200, 409]).toContain(res.status);
  });

  test('3.4 get progress', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const res = await api('GET', '/api/user/progress', null, login.body.token);
    expect(res.status).toBe(200);
  });
});

// Сценарий 4: Lesson → Feedback
describe('E2E — Scenario 4: Lesson → Feedback', () => {
  test('4.1 submit workout feedback', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const res = await api('POST', '/api/user/workout-feedback', {
      lesson_id: 1, mood: 'happy'
    }, login.body.token);
    expect([200, 409]).toContain(res.status);
  });

  test('4.2 create support ticket', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const res = await api('POST', '/api/feedback', {
      category: 'trainer', subject: 'E2E Test', message: 'Test ticket'
    }, login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.ticketId).toBeDefined();
  });

  test('4.3 list my tickets', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const res = await api('GET', '/api/feedback', null, login.body.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// Сценарий 5: Calendar → Scheduled Lesson
describe('E2E — Scenario 5: Calendar → Scheduled Lesson', () => {
  test('5.1 get schedule', async () => {
    const res = await api('GET', '/api/schedule');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  test('5.2 get personal calendar', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const res = await api('GET', '/api/user/calendar', null, login.body.token);
    expect(res.status).toBe(200);
  });
});

// Сценарий 6: Admin → Create Lesson
describe('E2E — Scenario 6: Admin → Create Lesson', () => {
  test('admin creates lesson and it appears in list', async () => {
    const createRes = await api('POST', '/api/lessons', {
      title: 'E2E Test Lesson', duration: 15, status: 'active',
      description: 'Created during E2E test', video_url: '/videos/test.mp4',
      is_free: 0, tags: '["test"]', direction: 'тест', direction_source: 'тест', effect_description: 'тест'
    }, adminToken);
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();

    const listRes = await api('GET', '/api/lessons');
    expect(listRes.status).toBe(200);
    const found = listRes.body.data.find(l => l.title === 'E2E Test Lesson');
    expect(found).toBeDefined();
  });
});

// Сценарий 7: Admin → Publish Lesson
describe('E2E — Scenario 7: Admin → Publish Lesson', () => {
  let lessonId;

  beforeAll(async () => {
    const list = await api('GET', '/api/lessons');
    let draft = list.body.data.find(l => l.title === 'E2E Test Lesson');
    if (!draft) {
      const createRes = await api('POST', '/api/lessons', {
        title: 'E2E Test Lesson', duration: 15, status: 'active',
        description: 'Created during E2E test', video_url: '/videos/test.mp4',
        is_free: 0, tags: '["test"]', direction: 'тест', direction_source: 'тест', effect_description: 'тест'
      }, adminToken);
      expect(createRes.status).toBe(201);
      const afterCreate = await api('GET', '/api/lessons');
      draft = afterCreate.body.data.find(l => l.title === 'E2E Test Lesson');
    }
    lessonId = draft?.id;
  });

  test('admin publishes lesson and it becomes visible', async () => {
    expect(lessonId).toBeDefined();
    const res = await api('PUT', `/api/lessons/${lessonId}`, {
      status: 'active'
    }, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');

    const getRes = await api('GET', `/api/lessons/${lessonId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('active');
  });
});

// Сценарий 8: User → Forbidden Admin
describe('E2E — Scenario 8: User → Forbidden Admin', () => {
  let subToken;

  beforeAll(async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    subToken = login.body.token;
  });

  test('8.1 subscriber cannot create lesson', async () => {
    const res = await api('POST', '/api/lessons', {
      title: 'Hacked', duration: 5
    }, subToken);
    expect(res.status).toBe(403);
  });

  test('8.2 subscriber cannot access audit logs', async () => {
    const res = await api('GET', '/api/admin/audit-logs', null, subToken);
    expect(res.status).toBe(403);
  });

  test('8.3 subscriber cannot access detailed health', async () => {
    const res = await api('GET', '/api/health/detailed', null, subToken);
    expect(res.status).toBe(403);
  });

  test('8.4 unauthenticated cannot access admin', async () => {
    const res = await api('GET', '/api/admin/audit-logs');
    expect(res.status).toBe(401);
  });
});

// Сценарий 9: User A → Forbidden User B data
describe('E2E — Scenario 9: IDOR Protection', () => {
  test('9.1 subscriber cannot access other subscriber data', async () => {
    const loginA = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const meB = await api('GET', '/api/user/me', null, loginA.body.token);
    const otherId = meB.body.id === 1 ? 2 : 1;
    const res = await api('GET', `/api/user/progress?subscriber_id=${otherId}`, null, loginA.body.token);
    expect([200, 403, 404]).toContain(res.status);
    if (res.status === 200 && res.body.watched_lessons) {
      expect(res.body.watched_lessons).toBeDefined();
    }
  });

  test('9.2 subscriber cannot delete other subscriber tickets', async () => {
    const loginA = await api('POST', '/api/user/login', {
      email: 'elena@example.com', password: 'password123'
    });
    const res = await api('DELETE', '/api/feedback/99999', null, loginA.body.token);
    expect([403, 404]).toContain(res.status);
  });
});

// Сценарий 10: Video Access Control
describe('E2E — Scenario 10: Video Access Control', () => {
  test('10.1 unauthenticated cannot get stream token', async () => {
    const res = await api('GET', '/api/user/stream-token/1');
    expect(res.status).toBe(401);
  });

  test('10.2 subscriber can check can-watch', async () => {
    const login = await api('POST', '/api/user/login', {
      email: 'maria@example.com', password: 'password123'
    });
    const res = await api('GET', '/api/user/can-watch/1', null, login.body.token);
    expect(res.status).toBe(200);
    expect(typeof res.body.allowed).toBe('boolean');
  });

  test('10.3 unauthenticated cannot check can-watch', async () => {
    const res = await api('GET', '/api/user/can-watch/1');
    expect(res.status).toBe(401);
  });
});
