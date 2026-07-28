const path = require('path');
const fs = require('fs');
const http = require('http');

function apiRequest(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ hostname: '127.0.0.1', port: 3005, path: urlPath, method, headers }, (res) => {
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
const TEST_PORT = 3005;

beforeAll(async () => {
  const { resetDb } = require('../server/db');
  resetDb();
  process.env.NODE_ENV = 'test';
  process.env.PORT = TEST_PORT;
  process.env.JWT_SECRET = 'test-i18n-secret';
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

describe('i18n — Locale files', () => {
  test('en.json should exist', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'src', 'locales', 'en.json'))).toBe(true);
  });

  test('ru.json should exist', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'src', 'locales', 'ru.json'))).toBe(true);
  });

  test('en.json should be valid JSON with lang.code = en', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'en.json'), 'utf8'));
    expect(data['lang.code']).toBe('en');
    expect(data['lang.label']).toBe('English');
  });

  test('ru.json should be valid JSON with lang.code = ru', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'ru.json'), 'utf8'));
    expect(data['lang.code']).toBe('ru');
    expect(data['lang.label']).toBe('Русский');
  });

  test('en.json and ru.json should have the same keys', () => {
    const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'en.json'), 'utf8'));
    const ru = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'ru.json'), 'utf8'));
    const enKeys = Object.keys(en).sort();
    const ruKeys = Object.keys(ru).sort();
    expect(enKeys).toEqual(ruKeys);
  });

  test('i18n.js should exist', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'src', 'js', 'i18n.js'))).toBe(true);
  });
});

describe('i18n — API: GET /api/i18n/:lang', () => {
  test('should return en translations for /api/i18n/en', async () => {
    const res = await apiRequest('GET', '/api/i18n/en');
    expect(res.status).toBe(200);
    expect(res.body['lang.code']).toBe('en');
    expect(res.body['hero.title']).toBeDefined();
  });

  test('should return ru translations for /api/i18n/ru', async () => {
    const res = await apiRequest('GET', '/api/i18n/ru');
    expect(res.status).toBe(200);
    expect(res.body['lang.code']).toBe('ru');
    expect(res.body['hero.title']).toBeDefined();
  });

  test('should return 404 for unsupported language', async () => {
    const res = await apiRequest('GET', '/api/i18n/de');
    expect(res.status).toBe(404);
  });
});

describe('i18n — API: GET /api/user/detect-language', () => {
  test('should return language for localhost as ru', async () => {
    const res = await apiRequest('GET', '/api/user/detect-language');
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('ru');
  });
});

describe('i18n — DB: subscribers.preferred_language', () => {
  test('subscribers table should have preferred_language column', async () => {
    const db = await require('../server/db').getDb();
    const result = db.exec(`PRAGMA table_info(subscribers)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('preferred_language');
  });

  test('default preferred_language should be ru', async () => {
    const db = await require('../server/db').getDb();
    const result = db.exec(`SELECT preferred_language FROM subscribers LIMIT 1`);
    expect(result.length).toBe(1);
    expect(result[0].values[0][0]).toBe('ru');
  });
});

describe('i18n — DB: lesson_media table', () => {
  test('lesson_media table should exist', async () => {
    const db = await require('../server/db').getDb();
    const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='lesson_media'`);
    expect(result.length).toBe(1);
  });

  test('lesson_media should have required columns', async () => {
    const db = await require('../server/db').getDb();
    const result = db.exec(`PRAGMA table_info(lesson_media)`);
    const cols = result[0].values.map(r => r[1]);
    expect(cols).toContain('lesson_id');
    expect(cols).toContain('language');
    expect(cols).toContain('cf_video_uid');
    expect(cols).toContain('video_url');
    expect(cols).toContain('status');
  });
});

describe('i18n — API: PUT /api/user/language', () => {
  let subscriberToken;

  beforeAll(async () => {
    const res = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    subscriberToken = res.body.token;
  });

  test('should save language preference for subscriber', async () => {
    const res = await apiRequest('PUT', '/api/user/language', { language: 'en' }, subscriberToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.language).toBe('en');
  });

  test('should reject invalid language', async () => {
    const res = await apiRequest('PUT', '/api/user/language', { language: 'de' }, subscriberToken);
    expect(res.status).toBe(400);
  });

  test('should require auth', async () => {
    const res = await apiRequest('PUT', '/api/user/language', { language: 'en' });
    expect(res.status).toBe(401);
  });

  test('GET /api/user/me should return preferred_language', async () => {
    const res = await apiRequest('GET', '/api/user/me', null, subscriberToken);
    expect(res.status).toBe(200);
    expect(res.body.preferred_language).toBe('en');
  });
});

describe('i18n — API: lesson_media CRUD (admin)', () => {
  let adminToken;
  let testLessonId;

  beforeAll(async () => {
    const res = await apiRequest('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
    adminToken = res.body.token;
    const lessonsRes = await apiRequest('GET', '/api/lessons', null, adminToken);
    if (lessonsRes.body && Array.isArray(lessonsRes.body) && lessonsRes.body.length > 0) {
      testLessonId = lessonsRes.body[0].id;
    } else if (lessonsRes.body && lessonsRes.body.data && lessonsRes.body.data.length > 0) {
      testLessonId = lessonsRes.body.data[0].id;
    }
  });

  test('should create lesson_media entry', async () => {
    if (!testLessonId) return;
    const res = await apiRequest('POST', '/api/lesson-media', {
      lesson_id: testLessonId,
      language: 'en',
      cf_video_uid: 'test-en-video-uid',
      status: 'ready'
    }, adminToken);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('should list lesson_media entries', async () => {
    const res = await apiRequest('GET', '/api/lesson-media', null, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('public GET /api/lessons/:id/media should return media entries', async () => {
    if (!testLessonId) return;
    const res = await apiRequest('GET', '/api/lessons/' + testLessonId + '/media');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('should require admin for lesson-media create', async () => {
    const userRes = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const userToken = userRes.body.token;
    const res = await apiRequest('POST', '/api/lesson-media', {
      lesson_id: testLessonId || 1,
      language: 'es',
      cf_video_uid: 'test-es-uid'
    }, userToken);
    expect(res.status).toBe(403);
  });
});

describe('i18n — Lesson media fallback in stream-token', () => {
  let subscriberToken;

  beforeAll(async () => {
    const res = await apiRequest('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    subscriberToken = res.body.token;
  });

  test('stream-token response should include videoLanguage and isOriginal', async () => {
    const lessonsRes = await apiRequest('GET', '/api/lessons');
    const lessons = Array.isArray(lessonsRes.body) ? lessonsRes.body : (lessonsRes.body.data || []);
    const freeLesson = lessons.find(l => l.is_free);
    if (!freeLesson || !freeLesson.cf_video_uid) return;

    const res = await apiRequest('GET', '/api/user/stream-token/' + freeLesson.id, null, subscriberToken);
    if (res.status === 200) {
      expect(res.body.videoLanguage).toBeDefined();
      expect(res.body.isOriginal).toBeDefined();
      expect(['ru', 'en']).toContain(res.body.videoLanguage);
    }
  });
});
