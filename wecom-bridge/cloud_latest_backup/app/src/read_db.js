const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/app/wecom_bridge.db');
db.all("SELECT * FROM kf_cursors", (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows));
    db.close();
});
