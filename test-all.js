// Combined: starts server, runs tests, then kills server
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Delete DB for clean state
const dbPath = path.join(__dirname, 'data', 'qigong.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

// Start server
const server = spawn('node', ['server/index.js'], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env }
});

let started = false;

server.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (data.toString().includes('Server running') && !started) {
    started = true;
    runTests();
  }
});

server.stderr.on('data', (data) => {
  process.stderr.write('[server-err] ' + data);
});

server.on('error', (err) => {
  console.error('Server spawn error:', err.message);
  process.exit(1);
});

async function runTests() {
  const http = require('http');

  function req(method, path, body, headers) {
    return new Promise((resolve, reject) => {
      const h = { 'Content-Type': 'application/json', ...(headers || {}) };
      const opts = { hostname: '127.0.0.1', port: 3001, path, method, headers: h };
      const r = http.request(opts, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      r.on('error', reject);
      if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
      r.end();
    });
  }

  try {
    console.log('\n=== TEST 1: GET /api/lessons ===');
    let r = await req('GET', '/api/lessons');
    const lessons = JSON.parse(r.body);
    console.log(`  Status: ${r.status}, Count: ${lessons.length}`);

    console.log('\n=== TEST 2: Login ===');
    r = await req('POST', '/api/user/login', { email: 'maria@example.com', password: 'password123' });
    const login = JSON.parse(r.body);
    if (!login.token) throw new Error('Login failed: ' + r.body);
    console.log(`  Status: ${r.status}, Token: OK`);
    const auth = { Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json' };

    console.log('\n=== TEST 3: GET /onboarding (fresh) ===');
    r = await req('GET', '/api/user/onboarding', null, auth);
    const ob1 = JSON.parse(r.body);
    console.log(`  Status: ${r.status}, Body: ${r.body}`);
    if (ob1.completed !== false) throw new Error('Expected completed=false');
    console.log('  PASS: completed=false');

    console.log('\n=== TEST 4: POST /onboarding (valid) ===');
    const payload = { experience: 'intermediate', goals: ['stress_relief', 'flexibility'], preferred_duration: 20, preferred_time: 'morning', focus_zones: ['шея', 'поясница'] };
    r = await req('POST', '/api/user/onboarding', payload, auth);
    console.log(`  Status: ${r.status}, Body: ${r.body}`);
    if (r.status !== 200) throw new Error('POST failed');
    console.log('  PASS: saved');

    console.log('\n=== TEST 5: GET /onboarding (after save) ===');
    r = await req('GET', '/api/user/onboarding', null, auth);
    const ob2 = JSON.parse(r.body);
    console.log(`  Body: ${r.body}`);
    if (ob2.completed !== true) throw new Error('Expected completed=true, got ' + ob2.completed);
    if (ob2.experience !== 'intermediate') throw new Error('experience mismatch: ' + ob2.experience);
    if (!ob2.goals.includes('stress_relief')) throw new Error('goals missing');
    if (ob2.preferred_duration !== 20) throw new Error('duration mismatch');
    if (ob2.preferred_time !== 'morning') throw new Error('time mismatch');
    if (!ob2.focus_zones.includes('шея')) throw new Error('zones missing');
    console.log('  PASS: all fields match');

    console.log('\n=== TEST 6: POST /onboarding (bad data) ===');
    const bad = { experience: 'X', goals: ['Y'], preferred_duration: 999, preferred_time: 'Z', focus_zones: ['W'] };
    r = await req('POST', '/api/user/onboarding', bad, auth);
    r = await req('GET', '/api/user/onboarding', null, auth);
    const ob3 = JSON.parse(r.body);
    console.log(`  After sanitize: ${r.body}`);
    if (ob3.experience !== 'beginner') throw new Error('Sanitize experience failed: ' + ob3.experience);
    if (ob3.goals.length !== 0) throw new Error('Sanitize goals failed: ' + JSON.stringify(ob3.goals));
    if (ob3.preferred_duration !== 15) throw new Error('Sanitize duration failed: ' + ob3.preferred_duration);
    if (ob3.preferred_time !== 'anytime') throw new Error('Sanitize time failed: ' + ob3.preferred_time);
    if (ob3.focus_zones.length !== 0) throw new Error('Sanitize zones failed');
    console.log('  PASS: sanitization works');

    console.log('\n=== TEST 7: Onboarding page HTML exists ===');
    const htmlPath = path.join(__dirname, 'dist', 'onboarding.html');
    if (!fs.existsSync(htmlPath)) throw new Error('onboarding.html not in dist');
    const html = fs.readFileSync(htmlPath, 'utf8');
    if (!html.includes('ob-step')) throw new Error('onboarding.html missing step classes');
    if (!html.includes('checkOnboarding')) throw new Error('onboarding.html missing checkOnboarding');
    console.log('  PASS: dist/onboarding.html exists and has key code');

    console.log('\n=== ALL 7 TESTS PASSED ===');
  } catch (e) {
    console.error('\nTEST FAILED:', e.message);
  } finally {
    server.kill();
    process.exit(0);
  }
}

setTimeout(() => {
  console.error('Timeout waiting for server to start');
  server.kill();
  process.exit(1);
}, 15000);
