const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/app/wecom_bridge.db');
db.all("SELECT * FROM user_mode", (err, rows) => {
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
});
