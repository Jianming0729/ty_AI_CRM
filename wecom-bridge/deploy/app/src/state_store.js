const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../wecom_bridge.db');
const db = new sqlite3.Database(dbPath);

// 模式常量
const MODES = {
    AI: 'AI_MODE',
    HUMAN: 'HUMAN_MODE'
};

// 初始化状态表
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS conversation_state (
        source_id TEXT PRIMARY KEY,
        mode TEXT DEFAULT 'AI_MODE',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

/**
 * 会话状态管理器 (Phase H1)
 */
const stateStore = {
    MODES,

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
    }
};

module.exports = stateStore;
