const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../wecom_bridge.db');
const db = new sqlite3.Database(dbPath);

// 初始化数据库
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS msg_dedup (
        msg_id TEXT PRIMARY KEY,
        timestamp INTEGER
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON msg_dedup(timestamp)`);

    // 新增：审计日志表
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        query TEXT,
        intent TEXT,
        response TEXT,
        msg_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const TTL = 3600; // 1小时 (秒)

module.exports = {
    /**
     * 检查是否重复 (Promise 版)
     */
    isDuplicate: (msgId) => {
        return new Promise((resolve, reject) => {
            if (!msgId) return resolve(false);

            db.get("SELECT msg_id FROM msg_dedup WHERE msg_id = ?", [msgId], (err, row) => {
                if (err) return reject(err);
                if (row) {
                    console.log(`[Dedup] Duplicate found in DB: ${msgId}`);
                    return resolve(true);
                }
                resolve(false);
            });
        });
    },

    /**
     * 标记已处理
     */
    markProcessed: (msgId) => {
        if (!msgId) return;
        const now = Math.floor(Date.now() / 1000);
        db.run("INSERT OR IGNORE INTO msg_dedup (msg_id, timestamp) VALUES (?, ?)", [msgId, now], (err) => {
            if (err) console.error('[Dedup] DB Insert Error:', err.message);
        });

        // 定期清理过期记录 (10% 概率触发)
        if (Math.random() < 0.1) {
            const expiry = now - TTL;
            db.run("DELETE FROM msg_dedup WHERE timestamp < ?", [expiry]);
        }
    },

    /**
     * 审计留痕
     */
    logInteraction: (userId, query, intent, response, msgId) => {
        db.run(
            "INSERT INTO audit_log (user_id, query, intent, response, msg_id) VALUES (?, ?, ?, ?, ?)",
            [userId, query, intent, response, msgId],
            (err) => {
                if (err) console.error('[Audit] DB Log Error:', err.message);
            }
        );
    }
};
