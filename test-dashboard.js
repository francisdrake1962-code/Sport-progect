process.on('uncaughtException', e => { console.error('UNCAUGHT:', e.stack); process.exit(1); });
process.on('unhandledRejection', e => { console.error('REJECT:', e.stack || e); process.exit(1); });

const http = require('http');
const fs = require('fs');

function request(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 3001, path, method, headers: { 'Content-Type': 'application/json', ...(headers || {}) } };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  try {
    const { start } = require('./server/index.js');
    const server = await start();

    const login = await request('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    console.log('LOGIN:', login.status);
    if (login.status !== 200) { console.log('  body:', JSON.stringify(login.body)); server.close(); process.exit(1); }
    console.log('  token OK:', !!login.body.token);
    const auth = { 'Authorization': 'Bearer ' + login.body.token };

    const dash = await request('GET', '/api/user/dashboard', null, auth);
    console.log('DASHBOARD:', dash.status);
    if (dash.status === 200) {
      console.log('  user:', dash.body.user ? dash.body.user.name : 'null');
      console.log('  completedCount:', dash.body.completedCount);
      console.log('  lessonCount:', dash.body.lessonCount);
      console.log('  zoneCount:', dash.body.zoneCount);
      console.log('  programs:', dash.body.programs ? dash.body.programs.length : 0);
      if (dash.body.programs) dash.body.programs.forEach(p => console.log('    -', p.name, '(' + p.lesson_count + ' lessons)'));
      console.log('  schedule days:', dash.body.schedule ? dash.body.schedule.length : 0);
    } else {
      console.log('  body:', JSON.stringify(dash.body));
    }

    const cats = await request('GET', '/api/user/categories', null, auth);
    console.log('CATEGORIES:', cats.status);
    if (cats.status === 200) {
      console.log('  zones:', cats.body.zones ? cats.body.zones.map(z => z.zone + '(' + z.count + ')').join(', ') : 'none');
    } else {
      console.log('  body:', JSON.stringify(cats.body));
    }

    const exists = fs.existsSync('./dist/dashboard.html');
    console.log('DASHBOARD HTML:', exists ? 'EXISTS' : 'MISSING');

    console.log('\n=== DONE ===');
    server.close();
    process.exit(0);
  } catch(e) {
    console.error('FATAL:', e.message, e.stack);
    process.exit(1);
  }
})();
