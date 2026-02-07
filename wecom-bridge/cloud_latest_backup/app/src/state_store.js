const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../../wecom_bridge.db');
const db = new sqlite3.Database(dbPath);

const MODES = {
    AI: 'AI_MODE',
    HUMAN: 'HUMAN_MODE'
};

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS conversation_state (
        ty_uid TEXT PRIMARY KEY,
        mode TEXT DEFAULT 'AI_MODE',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS kf_cursor (
        open_kfid TEXT PRIMARY KEY,
        cursor TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS callback_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        open_kfid TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const stateStore = {
    MODES,

    getMode: (tyUid) => {
        return new Promise((resolve) => {
            db.get("SELECT mode FROM conversation_state WHERE ty_uid = ?", [tyUid], (err, row) => {
                if (row) resolve(row.mode);
                else resolve(MODES.AI);
            });
        });
    },

    setMode: (tyUid, mode) => {
        return new Promise((resolve, reject) => {
            db.run("INSERT OR REPLACE INTO conversation_state (ty_uid, mode, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [tyUid, mode], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    getKfCursor: (openKfId) => {
        return new Promise((resolve) => {
            db.get("SELECT cursor FROM kf_cursor WHERE open_kfid = ?", [openKfId], (err, row) => {
                if (err || !row) resolve(null);
                else resolve(row.cursor);
            });
        });
    },

    setKfCursor: (openKfId, cursor) => {
        return new Promise((resolve) => {
            db.run("INSERT OR REPLACE INTO kf_cursor (open_kfid, cursor, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [openKfId, cursor], () => resolve());
        });
    },

    // --- Queue Methods ---
    enqueue: (openKfId) => {
        return new Promise((resolve, reject) => {
            db.run("INSERT INTO callback_queue (open_kfid) VALUES (?)", [openKfId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    fetchPending: () => {
        return new Promise((resolve) => {
            db.get("SELECT * FROM callback_queue WHERE status = 'pending' AND retry_count < 5 ORDER BY id ASC LIMIT 1", (err, row) => {
                if (err) resolve(null);
                else resolve(row);
            });
        });
    },

    markProcessing: (id) => {
        return new Promise((resolve) => {
            db.run("UPDATE callback_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id], () => resolve());
        });
    },

    markDone: (id) => {
        return new Promise((resolve) => {
            db.run("DELETE FROM callback_queue WHERE id = ?", [id], () => resolve()); // 直接删除已完成的，保持表轻量
        });
    },

    markFailed: (id, error) => {
        return new Promise((resolve) => {
            db.run("UPDATE callback_queue SET status = 'pending', retry_count = retry_count + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [error, id], () => resolve());
        });
    }
};

module.exports = stateStore;
