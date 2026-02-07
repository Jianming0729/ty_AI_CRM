const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../../wecom_bridge.db');
const db = new sqlite3.Database(dbPath);

const MODES = {
    AI: 'AI_MODE',
    HUMAN: 'HUMAN_MODE'
};

// 会话状态常量 (中长期修复 - 治理级)
const MSG_CODE_STATE = {
    ACTIVE: 'active',        // 正常可投递
    INVALID: 'invalid',      // 已被企业微信拒绝，不可再用
    CLOSED: 'closed'         // 正常结束
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
    // 新增：msg_code 生命周期治理表
    db.run(`CREATE TABLE IF NOT EXISTS msg_code_lifecycle (
        conversation_id TEXT PRIMARY KEY,
        msg_code TEXT,
        state TEXT DEFAULT 'active',
        failure_count INTEGER DEFAULT 0,
        last_error_code INTEGER,
        invalid_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // 新增：会话审计追踪表
    db.run(`CREATE TABLE IF NOT EXISTS msg_code_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        msg_code TEXT,
        old_state TEXT,
        new_state TEXT,
        reason TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const stateStore = {
    MODES,
    MSG_CODE_STATE,

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
    },

    // --- msg_code Lifecycle Management (Governance) ---
    getMsgCodeState: (conversationId) => {
        return new Promise((resolve) => {
            db.get("SELECT * FROM msg_code_lifecycle WHERE conversation_id = ?", [conversationId], (err, row) => {
                if (err || !row) return resolve(null);
                resolve(row);
            });
        });
    },

    invalidateMsgCode: (conversationId, errorCode, reason) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT msg_code, state FROM msg_code_lifecycle WHERE conversation_id = ?", [conversationId], (err, row) => {
                    const oldState = row ? row.state : 'unknown';
                    const msgCode = row ? row.msg_code : 'none';

                    db.run(
                        `UPDATE msg_code_lifecycle 
                         SET state = ?, last_error_code = ?, invalid_reason = ?, updated_at = CURRENT_TIMESTAMP 
                         WHERE conversation_id = ?`,
                        [MSG_CODE_STATE.INVALID, errorCode, reason, conversationId]
                    );

                    db.run(
                        `INSERT INTO msg_code_audit (conversation_id, msg_code, old_state, new_state, reason)
                         VALUES (?, ?, ?, ?, ?)`,
                        [conversationId, msgCode, oldState, MSG_CODE_STATE.INVALID, `ERROR_${errorCode}: ${reason}`],
                        (auditErr) => {
                            if (auditErr) console.error('[Audit] Failed to log state change:', auditErr.message);
                            resolve();
                        }
                    );
                });
            });
        });
    },

    updateMsgCode: (conversationId, msgCode) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT state FROM msg_code_lifecycle WHERE conversation_id = ?", [conversationId], (err, row) => {
                    const oldState = row ? row.state : 'none';

                    db.run(
                        `INSERT OR REPLACE INTO msg_code_lifecycle 
                         (conversation_id, msg_code, state, failure_count, updated_at) 
                         VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
                        [conversationId, msgCode, MSG_CODE_STATE.ACTIVE]
                    );

                    if (oldState !== MSG_CODE_STATE.ACTIVE) {
                        db.run(
                            `INSERT INTO msg_code_audit (conversation_id, msg_code, old_state, new_state, reason)
                             VALUES (?, ?, ?, ?, ?)`,
                            [conversationId, msgCode, oldState, MSG_CODE_STATE.ACTIVE, 'NEW_MSG_CODE_EVENT'],
                            (auditErr) => resolve()
                        );
                    } else {
                        resolve();
                    }
                });
            });
        });
    },

    reportFailure: (conversationId) => {
        return new Promise((resolve) => {
            db.run(
                "UPDATE msg_code_lifecycle SET failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?",
                [conversationId],
                () => resolve()
            );
        });
    }
};

module.exports = stateStore;
