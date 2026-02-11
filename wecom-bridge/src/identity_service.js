const db = require('./pg_client');
const { ulid } = require('ulid');

const identityService = {
    /**
     * 实现基于 UnionID 锚点的自动身份收敛
     */
    resolveOrCreate: async (provider, externalKey, metadata = {}) => {
        // 1. 尝试使用 UnionID 寻找现有的身份聚合点
        if (metadata.unionid) {
            const unionRes = await db.query('SELECT ty_uid FROM identities WHERE provider = $1 AND external_key = $2',
                ['wechat_unionid', metadata.unionid]);

            if (unionRes.rows.length > 0) {
                const targetUid = unionRes.rows[0].ty_uid;

                // 检查当前 externalKey 是否已经关联该 UID
                const existingLink = await db.query('SELECT * FROM identities WHERE provider = $1 AND external_key = $2 AND ty_uid = $3',
                    [provider, externalKey, targetUid]);

                if (existingLink.rows.length === 0) {
                    console.info(`[Identity-Convergence] Auto-linking ${externalKey} to existing UID ${targetUid} via UnionID`);
                    await db.query('INSERT INTO identities (ty_uid, provider, external_key, metadata) VALUES ($1, $2, $3, $4)',
                        [targetUid, provider, externalKey, JSON.stringify(metadata)]);
                }

                // 返回统一的身份
                const user = await db.query('SELECT * FROM users WHERE ty_uid = $1', [targetUid]);
                return user.rows[0];
            }
        }

        // 2. 无 UnionID 或 UnionID 未匹配，按协议标识符查找
        // 修正：status 字段属于 users 表 (u.status)，i.status 不存在
        const existing = await db.query('SELECT u.*, i.metadata as ident_metadata FROM identities i JOIN users u ON i.ty_uid = u.ty_uid WHERE i.provider = $1 AND i.external_key = $2', [provider, externalKey]);

        if (existing.rows.length > 0) {
            let identity = existing.rows[0];
            if (metadata.nickname && (!identity.metadata || identity.metadata.nickname !== metadata.nickname)) {
                await db.query('UPDATE identities SET metadata = metadata || $1 WHERE provider = $2 AND external_key = $3',
                    [JSON.stringify({ nickname: metadata.nickname, ...metadata }), provider, externalKey]);
            }
            return identity;
        }

        // 3. 创建新身份 (完全找不到锚点)
        const tyUid = `TYU_${ulid()}`;
        console.info(`[Identity-Creation] Founding new persona: ${tyUid} for ${externalKey}`);

        await db.query('BEGIN');
        try {
            const handleRes = await db.query('SELECT COUNT(*) FROM users');
            const count = parseInt(handleRes.rows[0].count) + 1;
            const handle = `U-${count.toString().padStart(6, '0')}`;

            await db.query('INSERT INTO users (ty_uid, handle, actor_type) VALUES ($1, $2, $3)', [tyUid, handle, 'customer']);
            await db.query('INSERT INTO identities (ty_uid, provider, external_key, metadata) VALUES ($1, $2, $3, $4)', [tyUid, provider, externalKey, JSON.stringify(metadata)]);

            // 如果有 UnionID，埋下聚合锚点
            if (metadata.unionid) {
                await db.query('INSERT INTO identities (ty_uid, provider, external_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                    [tyUid, 'wechat_unionid', metadata.unionid]);
            }

            await db.query('COMMIT');
            const newUser = await db.query('SELECT * FROM users WHERE ty_uid = $1', [tyUid]);
            return newUser.rows[0];
        } catch (e) {
            await db.query('ROLLBACK');
            throw e;
        }
    },

    getChatwootLink: async (tyUid, accountId, inboxId) => {
        const res = await db.query('SELECT * FROM chatwoot_links WHERE ty_uid = $1 AND chatwoot_account_id = $2 AND chatwoot_inbox_id = $3', [tyUid, accountId, inboxId]);
        return res.rows[0] || null;
    },

    syncChatwootLink: async (tyUid, data) => {
        const sql = `INSERT INTO chatwoot_links (ty_uid, chatwoot_account_id, chatwoot_inbox_id, chatwoot_contact_id, last_conversation_id) 
                     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chatwoot_account_id, chatwoot_inbox_id, ty_uid) 
                     DO UPDATE SET chatwoot_contact_id = EXCLUDED.chatwoot_contact_id, last_conversation_id = EXCLUDED.last_conversation_id`;
        await db.query(sql, [tyUid, data.account_id, data.inbox_id, data.contact_id, data.conversation_id]);
    },

    resolveDeliveryTarget: async (tyUid) => {
        const res = await db.query('SELECT provider, external_key FROM identities WHERE ty_uid = $1 ORDER BY (provider = \'wecom\') DESC, is_verified DESC', [tyUid]);
        if (res.rows.length === 0) return { ok: false };
        return { ok: true, target: { channel: res.rows[0].provider, external_key: res.rows[0].external_key } };
    },

    resolveByChatwootContactId: async (contactId) => {
        const res = await db.query('SELECT ty_uid FROM chatwoot_links WHERE chatwoot_contact_id = $1 LIMIT 1', [contactId]);
        return res.rows[0] || null;
    }
};

module.exports = identityService;
