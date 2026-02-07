const express = require('express');
const router = express.Router();
const identityService = require('./identity_service');
const logger = require('./logger');

/**
 * (A) 解析或创建 ty_uid
 */
router.post('/resolve-or-create', async (req, res) => {
    try {
        const { provider, external_key, metadata, tenant_id } = req.body;
        if (!provider || !external_key) {
            return res.status(400).json({ error: 'provider and external_key are required' });
        }

        const result = await identityService.resolveOrCreate(provider, external_key, metadata, tenant_id);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`[API] resolve-or-create failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * (B) 绑定新身份
 */
router.post('/link', async (req, res) => {
    try {
        const { ty_uid, provider, external_key, is_verified, metadata } = req.body;
        if (!ty_uid || !provider || !external_key) {
            return res.status(400).json({ error: 'ty_uid, provider, and external_key are required' });
        }

        const result = await identityService.linkIdentity(ty_uid, provider, external_key, is_verified, metadata);

        if (!result.ok) {
            return res.status(409).json({
                error: 'Identity conflict',
                conflict_uid: result.conflict_uid
            });
        }

        res.status(200).json(result);
    } catch (error) {
        logger.error(`[API] link identity failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * (C) 合并用户
 */
router.post('/merge', async (req, res) => {
    try {
        const { from_uid, to_uid, reason } = req.body;
        if (!from_uid || !to_uid) {
            return res.status(400).json({ error: 'from_uid and to_uid are required' });
        }

        const result = await identityService.mergeUsers(from_uid, to_uid, reason);
        res.status(200).json(result);
    } catch (error) {
        logger.error(`[API] merge users failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * (D) 解析投递目标
 */
router.post('/resolve-target', async (req, res) => {
    try {
        const { ty_uid, preferred_channels } = req.body;
        if (!ty_uid) {
            return res.status(400).json({ error: 'ty_uid is required' });
        }

        const result = await identityService.resolveDeliveryTarget(ty_uid, preferred_channels);
        if (!result.ok) {
            return res.status(404).json(result);
        }
        res.status(200).json(result);
    } catch (error) {
        logger.error(`[API] resolve-target failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * (E) 同步 Chatwoot 绑定关系
 */
router.post('/chatwoot/sync', async (req, res) => {
    try {
        const { ty_uid, account_id, inbox_id, contact_id, conversation_id, metadata } = req.body;
        if (!ty_uid || !account_id || !inbox_id) {
            return res.status(400).json({ error: 'ty_uid, account_id, and inbox_id are required' });
        }

        const result = await identityService.syncChatwootLink(ty_uid, {
            account_id, inbox_id, contact_id, conversation_id, metadata
        });
        res.status(200).json(result);
    } catch (error) {
        logger.error(`[API] chatwoot link sync failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * (F) 获取 Chatwoot 绑定关系
 */
router.get('/chatwoot/link', async (req, res) => {
    try {
        const { ty_uid, account_id, inbox_id } = req.query;
        if (!ty_uid || !account_id || !inbox_id) {
            return res.status(400).json({ error: 'ty_uid, account_id, and inbox_id are required' });
        }

        const result = await identityService.getChatwootLink(ty_uid, account_id, inbox_id);
        if (!result) return res.status(404).json({ error: 'Link not found' });
        res.status(200).json(result);
    } catch (error) {
        logger.error(`[API] get chatwoot link failed: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
