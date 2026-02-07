const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../wecom_bridge.db');
const db = new sqlite3.Database(dbPath);

// 模式常量
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

// 初始化状态表
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS conversation_state (
        source_id TEXT PRIMARY KEY,
        mode TEXT DEFAULT 'AI_MODE',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS kf_cursor (
        open_kfid TEXT PRIMARY KEY,
        cursor TEXT,
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
    // 新增：会话审计追踪表 (Governance 6️⃣)
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

/**
 * 会话状态管理器 (Phase H1)
 */
const stateStore = {
    MODES,
    MSG_CODE_STATE,

    /**
     * 获取客服消息游标
     */
    getKfCursor: (openKfId) => {
        return new Promise((resolve) => {
            db.get("SELECT cursor FROM kf_cursor WHERE open_kfid = ?", [openKfId], (err, row) => {
                if (err || !row) return resolve(null);
                resolve(row.cursor);
            });
        });
    },

    /**
     * 更新客服消息游标
     */
    setKfCursor: (openKfId, cursor) => {
        return new Promise((resolve, reject) => {
            db.run(
                "INSERT OR REPLACE INTO kf_cursor (open_kfid, cursor, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                [openKfId, cursor],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    },

    /**
     * 获取会话模式
     * @param {string} sourceId 企微 UserID
     * @returns {Promise<string>} AI_MODE 或 HUMAN_MODE
     */
    getMode: (sourceId) => {
        return new Promise((resolve, reject) => {
            db.get("SELECT mode FROM conversation_state WHERE source_id = ?", [sourceId], (err, row) => {
                if (err) {
                    console.error('[StateStore] GetMode Error:', err.message);
                    return resolve(MODES.AI); // 默认报错返回 AI 模式
                }
                if (row) {
                    resolve(row.mode);
                } else {
                    resolve(MODES.AI); // 默认 AI 模式
                }
            });
        });
    },

    /**
     * 设置会话模式
     * @param {string} sourceId 企微 UserID
     * @param {string} mode AI_MODE 或 HUMAN_MODE
     */
    setMode: (sourceId, mode) => {
        return new Promise((resolve, reject) => {
            if (!Object.values(MODES).includes(mode)) {
                return reject(new Error('Invalid mode: ' + mode));
            }
            db.run(
                "INSERT OR REPLACE INTO conversation_state (source_id, mode, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                [sourceId, mode],
                (err) => {
                    if (err) {
                        console.error('[StateStore] SetMode Error:', err.message);
                        return reject(err);
                    }
                    console.log(`[StateStore] ${sourceId} mode set to ${mode}`);
                    resolve();
                }
            );
        });
    },

    /**
     * 获取 msg_code 状态
     */
    getMsgCodeState: (conversationId) => {
        return new Promise((resolve) => {
            db.get("SELECT * FROM msg_code_lifecycle WHERE conversation_id = ?", [conversationId], (err, row) => {
                if (err || !row) return resolve(null);
                resolve(row);
            });
        });
    },

    /**
     * 设置 msg_code 状态为 INVALID (治理级硬约束)
     */
    invalidateMsgCode: (conversationId, errorCode, reason) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // 1. 获取旧状态用于审计
                db.get("SELECT msg_code, state FROM msg_code_lifecycle WHERE conversation_id = ?", [conversationId], (err, row) => {
                    const oldState = row ? row.state : 'unknown';
                    const msgCode = row ? row.msg_code : 'none';

                    // 2. 更新状态
                    db.run(
                        `UPDATE msg_code_lifecycle 
                         SET state = ?, last_error_code = ?, invalid_reason = ?, updated_at = CURRENT_TIMESTAMP 
                         WHERE conversation_id = ?`,
                        [MSG_CODE_STATE.INVALID, errorCode, reason, conversationId]
                    );

                    // 3. 记录审计日志 (Governance 6️⃣)
                    db.run(
                        `INSERT INTO msg_code_audit (conversation_id, msg_code, old_state, new_state, reason)
                         VALUES (?, ?, ?, ?, ?)`,
                        [conversationId, msgCode, oldState, MSG_CODE_STATE.INVALID, `ERROR_${errorCode}: ${reason}`],
                        (auditErr) => {
                            if (auditErr) console.error('[Audit] Failed to log state change:', auditErr.message);
                            console.warn(`[Governance] msg_code for ${conversationId} invalidated. Audit record created.`);
                            resolve();
                        }
                    );
                });
            });
        });
    },

    /**
     * 更新或记录新的 msg_code
     */
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

                    // 只有在状态真正改变或新创建时才审计
                    if (oldState !== MSG_CODE_STATE.ACTIVE) {
                        db.run(
                            `INSERT INTO msg_code_audit (conversation_id, msg_code, old_state, new_state, reason)
                             VALUES (?, ?, ?, ?, ?)`,
                            [conversationId, msgCode, oldState, MSG_CODE_STATE.ACTIVE, 'NEW_MSG_CODE_EVENT'],
                            (auditErr) => {
                                if (auditErr) console.error('[Audit] Failed to log state change:', auditErr.message);
                                console.log(`[Governance] New msg_code for ${conversationId} activated. Audit record created.`);
                                resolve();
                            }
                        );
                    } else {
                        resolve();
                    }
                });
            });
        });
    },

    /**
     * 报告一次发送失败，累加计数
     */
    reportFailure: (conversationId) => {
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE msg_code_lifecycle SET failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ?",
                [conversationId],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });
    }
};

module.exports = stateStore;
