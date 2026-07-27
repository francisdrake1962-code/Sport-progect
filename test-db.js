const {getDb} = require('./server/db');
getDb().then(db => {
    console.log('DB OK');
    const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log(r[0].values.map(v => v[0]).join(', '));
    
    // Check user_preferences table
    const cols = db.exec("PRAGMA table_info(user_preferences)");
    console.log('\nuser_preferences columns:');
    if (cols.length) cols[0].values.forEach(r => console.log('  ' + r[1] + ' (' + r[2] + ')'));
    
    process.exit(0);
}).catch(e => {
    console.error('DB FAIL:', e.message);
    process.exit(1);
});
