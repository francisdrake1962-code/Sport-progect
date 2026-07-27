const http = require('http');

function request(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port: 3001, path, method, headers: headers || {} };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('=== 1. Server API ===');
  let r = await request('GET', '/api/lessons');
  console.log('GET /api/lessons:', r.status, r.body.substring(0, 80));

  console.log('\n=== 2. Login ===');
  r = await request('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
  console.log('POST /api/user/login:', r.status);
  const login = JSON.parse(r.body);
  if (!login.token) { console.error('NO TOKEN!', r.body); process.exit(1); }
  console.log('token:', login.token.substring(0, 30) + '...');
  const auth = { Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json' };

  console.log('\n=== 3. GET /onboarding (fresh user) ===');
  r = await request('GET', '/api/user/onboarding', null, auth);
  console.log('GET /api/user/onboarding:', r.status, r.body);
  const ob = JSON.parse(r.body);
  if (ob.completed !== false) { console.error('ERROR: expected completed=false'); process.exit(1); }
  console.log('OK: completed=false');

  console.log('\n=== 4. POST /onboarding (valid data) ===');
  const payload = { experience: 'intermediate', goals: ['stress_relief', 'flexibility'], preferred_duration: 20, preferred_time: 'morning', focus_zones: ['шея', 'поясница'] };
  r = await request('POST', '/api/user/onboarding', payload, auth);
  console.log('POST /api/user/onboarding:', r.status, r.body);
  const save = JSON.parse(r.body);
  if (!save.success) { console.error('ERROR: save failed'); process.exit(1); }
  console.log('OK: saved');

  console.log('\n=== 5. GET /onboarding (after save) ===');
  r = await request('GET', '/api/user/onboarding', null, auth);
  console.log('GET /api/user/onboarding:', r.status, r.body);
  const ob2 = JSON.parse(r.body);
  if (ob2.completed !== true) { console.error('ERROR: expected completed=true'); process.exit(1); }
  if (ob2.experience !== 'intermediate') { console.error('ERROR: experience mismatch'); process.exit(1); }
  if (!ob2.goals.includes('stress_relief')) { console.error('ERROR: goals missing'); process.exit(1); }
  if (ob2.preferred_duration !== 20) { console.error('ERROR: duration mismatch'); process.exit(1); }
  console.log('OK: all fields match');

  console.log('\n=== 6. POST /onboarding (invalid data) ===');
  const badPayload = { experience: 'INVALID', goals: ['INVALID'], preferred_duration: 999, preferred_time: 'INVALID', focus_zones: ['invalid'] };
  r = await request('POST', '/api/user/onboarding', badPayload, auth);
  console.log('POST /api/user/onboarding (bad):', r.status, r.body);
  const saveBad = JSON.parse(r.body);
  if (!saveBad.success) { console.error('ERROR: should sanitize and save'); process.exit(1); }

  r = await request('GET', '/api/user/onboarding', null, auth);
  const ob3 = JSON.parse(r.body);
  console.log('After bad save:', JSON.stringify(ob3));
  if (ob3.experience !== 'beginner') { console.error('ERROR: sanitized experience wrong:', ob3.experience); process.exit(1); }
  if (ob3.goals.length !== 0) { console.error('ERROR: sanitized goals should be empty'); process.exit(1); }
  if (ob3.preferred_duration !== 15) { console.error('ERROR: sanitized duration wrong'); process.exit(1); }
  console.log('OK: sanitization works');

  console.log('\n=== ALL TESTS PASSED ===');
  process.exit(0);
}

test().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
