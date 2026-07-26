const { start } = require('../index');
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: 'localhost', port: 3001, path, method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => { let d=''; res.on('data', c => d+=c); res.on('end', () => resolve({ status: res.status || res.statusCode, body: JSON.parse(d||'{}') })); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

start().then(async () => {
  const login = await req('POST', '/api/auth/login', { email: 'admin@qigong.com', password: 'admin123' });
  const token = login.body.token;
  console.log('=== AFTER SEED ===');

  const gl = await req('GET', '/api/lessons');
  console.log('GET /api/lessons:', gl.status, 'count:', gl.body.length);

  const gc = await req('GET', '/api/complexes');
  console.log('GET /api/complexes:', gc.status, 'count:', gc.body.length);
  gc.body.forEach(c => console.log('  ' + c.id + ':', c.name, '(' + c.lesson_count + ' lessons)'));

  const cl = await req('GET', '/api/complex-lessons');
  console.log('GET /api/complex-lessons:', cl.status, 'count:', cl.body.length);

  const c1 = await req('GET', '/api/complexes/1');
  console.log('GET /api/complexes/1:', c1.status, c1.body.name, c1.body.lessons?.length, 'lessons');

  const feat = await req('GET', '/api/lessons/featured?limit=3');
  console.log('GET /api/lessons/featured:', feat.status, 'count:', feat.body.length);

  console.log('\n=== IMPORT CATALOG ===');
  const { importCatalog, insertIntoDb } = require('./import-catalog');
  const { lessons } = await importCatalog('C:/Users/admin/AppData/Local/Temp/xlsx_extract');
  await insertIntoDb(lessons);

  console.log('\n=== AFTER IMPORT ===');
  const gl2 = await req('GET', '/api/lessons');
  console.log('GET /api/lessons:', gl2.status, 'count:', gl2.body.length);

  console.log('\nAll checks passed!');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
