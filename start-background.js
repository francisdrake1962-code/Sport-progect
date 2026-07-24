const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', ['server/index.js'], {
  cwd: path.join(__dirname),
  detached: true,
  stdio: 'ignore'
});

server.unref();
console.log('Server started in background, PID:', server.pid);
console.log('URLs:');
console.log('  Admin panel:  http://localhost:3001/admin/');
console.log('  Lessons:      http://localhost:3001/admin/lessons.html');
console.log('  Login:        admin@qigong.com / admin123');
console.log('  API health:   http://localhost:3001/api/health');
