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

function apiUpload(urlPath, text, filename, token, extraFields) {
  return new Promise((resolve, reject) => {
    const boundary = '----qigongfeatures' + Date.now();
    let bodyParts = [];
    if (extraFields) {
      for (const [name, value] of Object.entries(extraFields)) {
        bodyParts.push(Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
        ));
      }
    }
    bodyParts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`
    ));
    bodyParts.push(Buffer.from(text));
    bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(bodyParts);
    const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ hostname: '127.0.0.1', port: TEST_PORT, path: urlPath, method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

let testServer;
const TEST_PORT = 3013;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);
  process.env.JWT_SECRET = 'test-features-secret';
  process.env.ALLOWED_ORIGIN = 'http://localhost:' + TEST_PORT;

  const { resetDb } = require('../server/db');
  resetDb();
  const { start } = require('../server/index');
  testServer = await start();
  await new Promise(resolve => setTimeout(resolve, 500));
}, 20000);

afterAll(async () => {
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

describe('Lesson features — reference', () => {
  const { BODY_ZONES, MOODS, ZONE_IDS, MOOD_IDS } = require('../server/constants/lesson-features');

  test('reference exports 8 body zones and 4 moods', () => {
    expect(BODY_ZONES.length).toBe(8);
    expect(MOODS.length).toBe(4);
    expect(ZONE_IDS).toContain('шея');
    expect(ZONE_IDS).toContain('спина_осанка');
    expect(MOOD_IDS).toContain('энергия');
    expect(MOOD_IDS).toContain('снятие стресса');
    expect(MOOD_IDS).toContain('поток');
  });

  test('GET /api/lesson-features returns the reference', async () => {
    const res = await apiRequest('GET', '/api/lesson-features');
    expect(res.status).toBe(200);
    expect(res.body.zones.length).toBe(8);
    expect(res.body.moods.length).toBe(4);
  });
});

describe('Lesson features — auto-classification', () => {
  const { inferLessonFeatures } = require('../server/services/lesson-features');

  test('detects neck and calm-down from theme/goals', () => {
    const f = inferLessonFeatures({
      title: 'Лёгкая шея',
      theme: 'суставная разминка для шеи',
      goals: 'разрабатывать шейный отдел, снимать напряжение',
      effect: 'шея расслабляется',
    });
    expect(f.zones).toContain('шея');
    expect(f.moods).toContain('снятие стресса');
  });

  test('detects balance mood from goals', () => {
    const f = inferLessonFeatures({
      title: 'Баланс',
      theme: 'координация и равновесие',
      goals: 'тренировать баланс тела',
      effect: 'устойчивость',
    });
    expect(f.zones).toContain('баланс_общее');
    expect(f.moods).toContain('баланс');
  });

  test('falls back to balance/general when no zone keyword matches', () => {
    const f = inferLessonFeatures({ title: 'Практика тишины', theme: 'медитация', goals: 'тишина и покой', effect: 'тишина' });
    expect(f.zones).toContain('баланс_общее');
  });
});

describe('Lesson features — moods API', () => {
  test('PUT/GET /api/lessons/:id/moods round-trips', async () => {
    const adminToken = await loginAdmin();

    const created = await apiRequest('POST', '/api/lessons', {
      title: 'Признаки тест', theme: 'тест', duration: 20, status: 'active',
      catalog_no: 7001, sort_order: 7001,
    }, adminToken);
    expect([200, 201]).toContain(created.status);
    const lessonId = created.body.id;
    expect(lessonId).toBeTruthy();

    const put = await apiRequest('PUT', `/api/lessons/${lessonId}/moods`, { moods: ['энергия', 'баланс'] }, adminToken);
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);

    const get = await apiRequest('GET', `/api/lesson-moods/${lessonId}`);
    expect(get.status).toBe(200);
    expect(get.body.sort()).toEqual(['баланс', 'энергия']);

    const getZones = await apiRequest('GET', `/api/lesson-zones/${lessonId}`);
    expect(getZones.status).toBe(200);
    expect(getZones.body).toEqual([]);

    const bad = await apiRequest('PUT', '/api/lessons/99999/moods', { moods: ['энергия'] }, adminToken);
    expect(bad.status).toBe(404);

    const invalid = await apiRequest('PUT', `/api/lessons/${lessonId}/moods`, { moods: 'not-array' }, adminToken);
    expect(invalid.status).toBe(400);
  });
});

describe('Lesson features — admin list shows all statuses with features', () => {
  test('GET /api/admin/lessons includes drafts and attaches zones/moods', async () => {
    const adminToken = await loginAdmin();
    const created = await apiRequest('POST', '/api/lessons', {
      title: 'Черновик список', theme: 'тест', duration: 20, status: 'draft',
      catalog_no: 7002, sort_order: 7002,
    }, adminToken);
    expect([200, 201]).toContain(created.status);
    const lessonId = created.body.id;
    await apiRequest('PUT', `/api/lessons/${lessonId}/zones`, { zones: ['поясница'] }, adminToken);
    await apiRequest('PUT', `/api/lessons/${lessonId}/moods`, { moods: ['поток'] }, adminToken);

    const res = await apiRequest('GET', '/api/admin/lessons', null, adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const draft = res.body.data.find(l => l.catalog_no === 7002);
    expect(draft).toBeTruthy();
    expect(draft.zones).toContain('поясница');
    expect(draft.moods).toContain('поток');
    expect(draft.zones_labels).toContain('Поясница');
  });

  test('public GET /api/lessons hides drafts', async () => {
    const res = await apiRequest('GET', '/api/lessons');
    expect(res.status).toBe(200);
    const found = (res.body.data || []).find(l => l.catalog_no === 7002);
    expect(found).toBeFalsy();
  });
});

describe('Lesson features — import fills zones and moods', () => {
  test('preview reports inferred zones/moods and apply persists them', async () => {
    const adminToken = await loginAdmin();
    const csv = '№;Название;Цель;Эффект\n' +
      '7003;Разминка для шеи;разработать шею, снять напряжение;шея становится свободной';

    const preview = await apiUpload('/api/admin/lessons/import', csv, 'batch.csv', adminToken);
    expect(preview.status).toBe(200);
    const row = (preview.body.preview || []).find(r => r.catalogNo === 7003);
    expect(row).toBeTruthy();
    expect(row.zones).toContain('шея');
    expect(row.moods).toContain('снятие стресса');

    const apply = await apiUpload('/api/admin/lessons/import', csv, 'batch.csv', adminToken, { action: 'apply' });
    expect(apply.status).toBe(200);
    expect(apply.body.success).toBe(true);

    const adminList = await apiRequest('GET', '/api/admin/lessons', null, adminToken);
    const lesson = adminList.body.data.find(l => l.catalog_no === 7003);
    expect(lesson).toBeTruthy();
    expect(lesson.zones).toContain('шея');
    expect(lesson.moods).toContain('снятие стресса');
  });
});

describe('Lesson features — picker filter', () => {
  test('/api/user/lessons-filter matches mood via lesson_moods', async () => {
    const adminToken = await loginAdmin();
    const created = await apiRequest('POST', '/api/lessons', {
      title: 'Фильтр настроение', theme: 'тест', duration: 20, status: 'active',
      catalog_no: 7101, sort_order: 7101,
    }, adminToken);
    expect([200, 201]).toContain(created.status);
    await apiRequest('PUT', `/api/lessons/${created.body.id}/moods`, { moods: ['энергия'] }, adminToken);

    const subToken = await loginSubscriber();
    const res = await apiRequest('GET', '/api/user/lessons-filter?mood=' + encodeURIComponent('энергия'), null, subToken);
    expect(res.status).toBe(200);
    const lessons = res.body.data || [];
    const matched = lessons.find(l => l.catalog_no === 7101);
    expect(matched).toBeTruthy();
  });

  test('/api/user/lessons-filter matches zone via lesson_zones', async () => {
    const adminToken = await loginAdmin();
    const created = await apiRequest('POST', '/api/lessons', {
      title: 'Фильтр зона', theme: 'тест', duration: 20, status: 'active',
      catalog_no: 7102, sort_order: 7102,
    }, adminToken);
    expect([200, 201]).toContain(created.status);
    await apiRequest('PUT', `/api/lessons/${created.body.id}/zones`, { zones: ['шея'] }, adminToken);

    const subToken = await loginSubscriber();
    const res = await apiRequest('GET', '/api/user/lessons-filter?zone=' + encodeURIComponent('шея'), null, subToken);
    expect(res.status).toBe(200);
    const lessons = res.body.data || [];
    const matched = lessons.find(l => l.catalog_no === 7102);
    expect(matched).toBeTruthy();
  });
});

