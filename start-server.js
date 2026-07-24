const { start } = require('./server/index.js');
start().then(() => {
  console.log('SERVER_READY http://localhost:3001');
}).catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
