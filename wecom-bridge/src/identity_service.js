const { ulid } = require('ulid');
const db = require('./pg_client');
const logger = require('./logger');

const identityService = {
    /**
     * 解析或创建身份锚点
     */
    resolveOrCreate: async (provider, externalKey, metadata = {}, tenantId = 'default') => {
        // 1. 先查是否存在 (连表查询获取完整身份)
        const existing = await db.query(
            `SELECT u.ty_uid, u.handle, u.actor_type, u.status, i.metadata 
             FROM identities i 
             JOIN users u ON i.ty_uid = u.ty_uid 
             WHERE i.provider = $1 AND i.external_key = $2`,
            [provider, externalKey]
        );

        if (existing.rows.length > 0) {
            let identity = existing.rows[0];
            const meta = identity.metadata || {};

            // 检查是否有合并迁移
            if (identity.status === 'merged') {
                const alias = await db.query(
                    'SELECT u.ty_uid, u.handle, u.actor_type FROM user_alias ua JOIN users u ON ua.primary_uid = u.ty_uid WHERE ua.alias_uid = $1',
                    [identity.ty_uid]
                );
                if (alias.rows.length > 0) {
                    identity = { ...identity, ...alias.rows[0] };
                }
            }

            return {
                ty_uid: identity.ty_uid,
                handle: identity.handle,
                actor_type: identity.actor_type,
                nickname: meta.nickname || null,
                source_id: `ty:${identity.ty_uid}`,
                is_new_user: false,
                resolved_via: 'identities'
            };
        }

        // 2. 幂等创建 (使用事务)
        return await db.withTransaction(async (client) => {
            // 再次确认防止并发竞态
            const reCheck = await client.query(
                'SELECT u.ty_uid, u.handle, u.actor_type FROM identities i JOIN users u ON i.ty_uid = u.ty_uid WHERE i.provider = $1 AND i.external_key = $2',
                [provider, externalKey]
            );
            if (reCheck.rows.length > 0) return { ...reCheck.rows[0], source_id: `ty:${reCheck.rows[0].ty_uid}`, is_new_user: false };

            const tyUid = `TYU_${ulid()}`;
            const actorType = metadata.actor_type || 'customer';

            // 生成 Handle (A-000001 / U-000001 等)
            const seqName = `seq_handle_${actorType}`;
            const handlePrefix = actorType === 'agent' ? 'A' : (actorType === 'employee' ? 'E' : (actorType === 'partner' ? 'P' : 'U'));

            const handleRes = await client.query(`SELECT LPAD(nextval($1)::text, 6, '0') as seq`, [seqName]);
            const handle = `${handlePrefix}-${handleRes.rows[0].seq}`;

            // 创建用户
            await client.query(
                'INSERT INTO users (ty_uid, tenant_id, actor_type, handle) VALUES ($1, $2, $3, $4)',
                [tyUid, tenantId, actorType, handle]
            );

            // 创建映射
            await client.query(
                'INSERT INTO identities (ty_uid, provider, external_key, metadata) VALUES ($1, $2, $3, $4)',
                [tyUid, provider, externalKey, JSON.stringify(metadata)]
            );

            // 记录审计事件
            await client.query(
                'INSERT INTO user_events (event_id, ty_uid, event_type, source, payload) VALUES ($1, $2, $3, $4, $5)',
                [ulid(), tyUid, 'user_created', 'identity_service', JSON.stringify({ provider, externalKey, handle, actorType })]
            );

            return {
                ty_uid: tyUid,
                handle: handle,
                actor_type: actorType,
                source_id: `ty:${tyUid}`,
                is_new_user: true,
                resolved_via: 'created'
            };
        });
    },

    /**
     * 绑定新身份
     */
    linkIdentity: async (tyUid, provider, externalKey, isVerified = false, metadata = {}) => {
        // 检查是否已被他人占用
        const conflict = await db.query(
            'SELECT ty_uid FROM identities WHERE provider = $1 AND external_key = $2',
            [provider, externalKey]
        );

        if (conflict.rows.length > 0) {
            if (conflict.rows[0].ty_uid === tyUid) return { ok: true, already_linked: true };
            return { ok: false, conflict_uid: conflict.rows[0].ty_uid };
        }

        await db.query(
            'INSERT INTO identities (ty_uid, provider, external_key, is_verified, metadata) VALUES ($1, $2, $3, $4, $5)',
            [tyUid, provider, externalKey, isVerified, JSON.stringify(metadata)]
        );

        return { ok: true, linked: { provider, external_key: externalKey, is_verified: isVerified } };
    },

    /**
     * 合并用户
     */
    mergeUsers: async (fromUid, toUid, reason = 'manual_merge') => {
        if (fromUid === toUid) return { ok: true };

        return await db.withTransaction(async (client) => {
            // 记录别名跳转
            await client.query(
                'INSERT INTO user_alias (alias_uid, primary_uid, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [fromUid, toUid, reason]
            );

            // 标记旧用户状态
            await client.query(
                "UPDATE users SET status = 'merged' WHERE ty_uid = $1",
                [fromUid]
            );

            // 记录事件
            await client.query(
                'INSERT INTO user_events (event_id, ty_uid, event_type, source, payload) VALUES ($1, $2, $3, $4, $5)',
                [ulid(), toUid, 'user_merged', 'system', JSON.stringify({ from_uid: fromUid, reason })]
            );

            return { ok: true, primary_uid: toUid, alias_uid: fromUid };
        });
    },

    /**
     * 解析投递目标
     */
    resolveDeliveryTarget: async (tyUid, preferredChannels = ['wecom', 'wechat', 'phone']) => {
        const result = await db.query(
            'SELECT provider, external_key, is_verified FROM identities WHERE ty_uid = $1',
            [tyUid]
        );

        const identities = result.rows;
        if (identities.length === 0) return { ok: false, error: 'no_identities_found' };

        // 按 preferredChannels 顺序匹配
        for (const channel of preferredChannels) {
            const target = identities.find(i => i.provider === channel);
            if (target) {
                return {
                    ok: true,
                    ty_uid: tyUid,
                    target: {
                        channel: target.provider,
                        external_key: target.external_key,
                        is_verified: target.is_verified
                    },
                    fallbacks: identities.filter(i => i.provider !== channel).map(i => ({
                        channel: i.provider,
                        external_key: i.external_key,
                        is_verified: i.is_verified
                    }))
                };
            }
        }

        return { ok: false, error: 'no_preferred_channel_match' };
    },

    /**
     * 同步 Chatwoot 绑定关系 (Phase 2)
     */
    syncChatwootLink: async (tyUid, linkData) => {
        const { account_id, inbox_id, contact_id, conversation_id, metadata = {} } = linkData;

        const sql = `
            INSERT INTO chatwoot_links (
                ty_uid, chatwoot_account_id, chatwoot_inbox_id, 
                chatwoot_contact_id, last_conversation_id, metadata
            ) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (chatwoot_account_id, chatwoot_inbox_id, ty_uid) 
            DO UPDATE SET 
                chatwoot_contact_id = EXCLUDED.chatwoot_contact_id,
                last_conversation_id = EXCLUDED.last_conversation_id,
                metadata = chatwoot_links.metadata || EXCLUDED.metadata,
                updated_at = now()
            RETURNING *;
        `;

        const result = await db.query(sql, [
            tyUid, account_id, inbox_id, contact_id, conversation_id, JSON.stringify(metadata)
        ]);

        return result.rows[0];
    },

    /**
     * 获取 Chatwoot 绑定关系
     */
    getChatwootLink: async (tyUid, accountId, inboxId) => {
        const result = await db.query(
            'SELECT * FROM chatwoot_links WHERE ty_uid = $1 AND chatwoot_account_id = $2 AND chatwoot_inbox_id = $3',
            [tyUid, accountId, inboxId]
        );
        return result.rows[0] || null;
    },

    /**
     * 更新身份元数据
     */
    updateMetadata: async (provider, externalKey, newMetadata) => {
        const sql = `
            UPDATE identities 
            SET metadata = metadata || $3, updated_at = now()
            WHERE provider = $1 AND external_key = $2
            RETURNING *;
        `;
        const result = await db.query(sql, [provider, externalKey, JSON.stringify(newMetadata)]);
        return result.rows[0];
    }
};

module.exports = identityService;
