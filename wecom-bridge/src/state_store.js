const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbName = process.env.SQLITE_DB_NAME || 'wecom_bridge.db';
const dbPath = path.join(__dirname, `../${dbName}`);
const db = new sqlite3.Database(dbPath);
const pg = require('./pg_client'); // 引入 PG 客户端用于第三方核心状态持久化

const MODES = {
    AI: 'AI_MODE',
    HUMAN: 'HUMAN_MODE'
};

const MSG_CODE_STATE = {
    ACTIVE: 'active',
    INVALID: 'invalid',
    CLOSED: 'closed'
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
        corp_id TEXT,
        open_kfid TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS msg_code_lifecycle (
        ty_uid TEXT PRIMARY KEY,
        corp_id TEXT,
        msg_code TEXT,
        state TEXT DEFAULT 'active',
        failure_count INTEGER DEFAULT 0,
        last_error_code INTEGER,
        invalid_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS msg_code_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ty_uid TEXT,
        msg_code TEXT,
        old_state TEXT,
        new_state TEXT,
        reason TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS suite_metadata (
        suite_id TEXT PRIMARY KEY,
        suite_ticket TEXT,
        suite_access_token TEXT,
        expire_at INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // --- PostgreSQL 初始化 (第三方应用核心状态 - 合规级持久化) ---
    // 使用 setImmediate 确保在所有环境与 Bootstrap Check 之后执行
    setImmediate(async () => {
        try {
            await pg.query(`
                CREATE TABLE IF NOT EXISTS wecom_suite_settings (
                    suite_id TEXT PRIMARY KEY,
                    suite_ticket TEXT NOT NULL,
                    last_received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await pg.query(`
                CREATE TABLE IF NOT EXISTS wecom_authorized_corp (
                    corp_id TEXT PRIMARY KEY,
                    permanent_code TEXT NOT NULL,
                    corp_name TEXT,
                    auth_info JSONB,
                    status TEXT DEFAULT 'active',
                    auth_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('✅ [PG-Init] SaaS tables ensured.');
        } catch (err) {
            console.error('[PG-Init] Failed to create SaaS tables:', err.message);
        }
    });

    // 新增：企业授权关系表 (SaaS 租户地线 - SQLite 缓存)
    db.run(`CREATE TABLE IF NOT EXISTS wecom_tenants (
        corp_id TEXT PRIMARY KEY,
        permanent_code TEXT,
        corp_name TEXT,
        access_token TEXT,
        expire_at INTEGER,
        installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.get("PRAGMA table_info(msg_code_lifecycle)", (err, rows) => {
        // Governance logic...
    });
});

const stateStore = {
    MODES,
    MSG_CODE_STATE,

    // --- Suite Ticket & Token Persistence (Legacy SQLite + New PG Compliance) ---
    setSuiteTicket: (suiteId, ticket) => {
        // 先异步更新 SQLite (保持向后兼容)
        db.run(
            `INSERT INTO suite_metadata (suite_id, suite_ticket, updated_at) 
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(suite_id) DO UPDATE SET suite_ticket=excluded.suite_ticket, updated_at=excluded.updated_at`,
            [suiteId, ticket]
        );

        // 核心：PostgreSQL 持久化 (合规性 SSOT)
        return pg.query(`
            INSERT INTO wecom_suite_settings (suite_id, suite_ticket, last_received_at, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (suite_id) DO UPDATE 
            SET suite_ticket = EXCLUDED.suite_ticket,
                last_received_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `, [suiteId, ticket]);
    },

    saveSuiteToken: (suiteId, token, expiresAt) => {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE suite_metadata SET suite_access_token = ?, expire_at = ?, updated_at = CURRENT_TIMESTAMP WHERE suite_id = ?`,
                [token, expiresAt, suiteId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    getSuiteData: async (suiteId) => {
        // 1. 从 SQLite 获取缓存的 Token 信息
        const localData = await new Promise((resolve) => {
            db.get("SELECT * FROM suite_metadata WHERE suite_id = ?", [suiteId], (err, row) => {
                resolve(row || {});
            });
        });

        // 2. 从 PostgreSQL 获取核心 Ticket (SSOT)
        try {
            const pgRes = await pg.query("SELECT suite_ticket FROM wecom_suite_settings WHERE suite_id = $1", [suiteId]);
            if (pgRes.rows.length > 0) {
                return { ...localData, suite_ticket: pgRes.rows[0].suite_ticket };
            }
        } catch (err) {
            console.error('[PG-Auth] Error fetching ticket from Postgres, using local fallback:', err.message);
        }

        return localData.suite_id ? localData : null;
    },

    /**
     * 从 PostgreSQL 获取最新的 suite_ticket
     * 作为第三方应用核心状态，这是系统生存能力的底线
     */
    getLatestSuiteTicket: async () => {
        try {
            const res = await pg.query(`
                SELECT *, 
                EXTRACT(EPOCH FROM (NOW() - last_received_at))::integer as age_sec
                FROM wecom_suite_settings 
                ORDER BY updated_at DESC LIMIT 1
            `);
            return res.rows.length > 0 ? res.rows[0] : null;
        } catch (err) {
            console.error('[PG-Auth] Failed to load latest suite_ticket from Postgres:', err.message);
            // 降级到 SQLite (逻辑自愈)
            return new Promise((resolve) => {
                db.get("SELECT *, (strftime('%s', 'now') - strftime('%s', updated_at)) as age_sec FROM suite_metadata ORDER BY updated_at DESC LIMIT 1", (err, row) => {
                    if (err || !row) resolve(null);
                    else resolve(row);
                });
            });
        }
    },

    // --- Tenant / Authorization Management ---
    saveTenant: (corpId, permanentCode, corpName) => {
        // 先同步到 SQLite (缓存级)
        db.run(
            `INSERT INTO wecom_tenants (corp_id, permanent_code, corp_name, last_seen_at) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(corp_id) DO UPDATE SET 
                permanent_code=excluded.permanent_code, 
                corp_name=excluded.corp_name,
                last_seen_at=CURRENT_TIMESTAMP`,
            [corpId, permanentCode, corpName]
        );

        // 核心：PostgreSQL 保存 (SSOT)
        return pg.query(`
            INSERT INTO wecom_authorized_corp (corp_id, permanent_code, corp_name, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (corp_id) DO UPDATE 
            SET permanent_code = EXCLUDED.permanent_code,
                corp_name = EXCLUDED.corp_name,
                updated_at = CURRENT_TIMESTAMP
        `, [corpId, permanentCode, corpName]);
    },

    saveAuthorizedCorp: (corpId, permanentCode, corpName, authInfo) => {
        // 同时更新 SQLite 缓存
        db.run(
            `INSERT INTO wecom_tenants (corp_id, permanent_code, corp_name, last_seen_at) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(corp_id) DO UPDATE SET 
                permanent_code=excluded.permanent_code, 
                corp_name=excluded.corp_name,
                last_seen_at=CURRENT_TIMESTAMP`,
            [corpId, permanentCode, corpName]
        );

        return pg.query(`
            INSERT INTO wecom_authorized_corp (corp_id, permanent_code, corp_name, auth_info, auth_time, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (corp_id) DO UPDATE 
            SET permanent_code = EXCLUDED.permanent_code,
                corp_name = EXCLUDED.corp_name,
                auth_info = EXCLUDED.auth_info,
                updated_at = CURRENT_TIMESTAMP
        `, [corpId, permanentCode, corpName, JSON.stringify(authInfo)]);
    },

    saveCorpToken: (corpId, token, expiresAt) => {
        // Token 属于高频易失缓存，仅存在 SQLite
        return new Promise((resolve, reject) => {
            db.run(
                "UPDATE wecom_tenants SET access_token = ?, expire_at = ?, last_seen_at = CURRENT_TIMESTAMP WHERE corp_id = ?",
                [token, expiresAt, corpId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    },

    getTenant: async (corpId) => {
        // 1. 尝试从 SQLite 读取令牌缓存
        const local = await new Promise((resolve) => {
            db.get("SELECT * FROM wecom_tenants WHERE corp_id = ?", [corpId], (err, row) => resolve(row));
        });

        // 2. 从 Postgres 获取永久授权码 (SSOT)
        try {
            const pgRes = await pg.query("SELECT permanent_code, corp_name, auth_info FROM wecom_authorized_corp WHERE corp_id = $1", [corpId]);
            if (pgRes.rows.length > 0) {
                return { ...local, ...pgRes.rows[0] };
            }
        } catch (err) {
            console.error('[PG-Auth] Error reading tenant SSOT:', err.message);
        }
        return local;
    },

    getPermanentCode: async (corpId) => {
        try {
            const res = await pg.query("SELECT permanent_code FROM wecom_authorized_corp WHERE corp_id = $1", [corpId]);
            if (res.rows.length > 0) return res.rows[0].permanent_code;
        } catch (e) { }

        return new Promise((resolve) => {
            db.get("SELECT permanent_code FROM wecom_tenants WHERE corp_id = ?", [corpId], (err, row) => {
                if (err || !row) resolve(null);
                else resolve(row.permanent_code);
            });
        });
    },

    getCorpIdByTyUid: (tyUid) => {
        return new Promise((resolve) => {
            db.get("SELECT corp_id FROM msg_code_lifecycle WHERE ty_uid = ?", [tyUid], (err, row) => {
                if (err || !row) resolve(null);
                else resolve(row.corp_id);
            });
        });
    },

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
    enqueue: (corpId, openKfId) => {
        return new Promise((resolve, reject) => {
            db.run("INSERT INTO callback_queue (corp_id, open_kfid) VALUES (?, ?)", [corpId, openKfId], (err) => {
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

    // --- msg_code Lifecycle Management (Governance: ty_uid Anchored) ---
    getMsgCodeState: (tyUid) => {
        return new Promise((resolve) => {
            db.get("SELECT * FROM msg_code_lifecycle WHERE ty_uid = ?", [tyUid], (err, row) => {
                if (err || !row) return resolve(null);
                resolve(row);
            });
        });
    },

    invalidateMsgCode: (tyUid, errorCode, reason) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT msg_code, state FROM msg_code_lifecycle WHERE ty_uid = ?", [tyUid], (err, row) => {
                    const oldState = row ? row.state : 'unknown';
                    const msgCode = row ? row.msg_code : 'none';

                    db.run(
                        `UPDATE msg_code_lifecycle 
                         SET state = ?, last_error_code = ?, invalid_reason = ?, updated_at = CURRENT_TIMESTAMP 
                         WHERE ty_uid = ?`,
                        [MSG_CODE_STATE.INVALID, errorCode, reason, tyUid]
                    );

                    db.run(
                        `INSERT INTO msg_code_audit (ty_uid, msg_code, old_state, new_state, reason)
                         VALUES (?, ?, ?, ?, ?)`,
                        [tyUid, msgCode, oldState, MSG_CODE_STATE.INVALID, `ERROR_${errorCode}: ${reason}`],
                        (auditErr) => {
                            if (auditErr) console.error('[Audit] Failed to log state change:', auditErr.message);
                            resolve();
                        }
                    );
                });
            });
        });
    },

    updateMsgCode: (tyUid, corpId, msgCode) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.get("SELECT state FROM msg_code_lifecycle WHERE ty_uid = ?", [tyUid], (err, row) => {
                    const oldState = row ? row.state : 'none';

                    db.run(
                        `INSERT OR REPLACE INTO msg_code_lifecycle 
                         (ty_uid, corp_id, msg_code, state, failure_count, updated_at) 
                         VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
                        [tyUid, corpId, msgCode, MSG_CODE_STATE.ACTIVE]
                    );

                    if (oldState !== MSG_CODE_STATE.ACTIVE) {
                        db.run(
                            `INSERT INTO msg_code_audit (ty_uid, msg_code, old_state, new_state, reason)
                             VALUES (?, ?, ?, ?, ?)`,
                            [tyUid, msgCode, oldState, MSG_CODE_STATE.ACTIVE, 'NEW_MSG_CODE_EVENT'],
                            (auditErr) => resolve()
                        );
                    } else {
                        resolve();
                    }
                });
            });
        });
    },

    reportFailure: (tyUid) => {
        return new Promise((resolve) => {
            db.run(
                "UPDATE msg_code_lifecycle SET failure_count = failure_count + 1, updated_at = CURRENT_TIMESTAMP WHERE ty_uid = ?",
                [tyUid],
                () => resolve()
            );
        });
    }
};

module.exports = stateStore;
