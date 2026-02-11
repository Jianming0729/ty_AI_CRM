const express = require('express');
const router = express.Router();
const customer360Service = require('./service');
const logger = require('../../logger');

/**
 * 安全握手中间件 (X-CW-Signature Validation)
 */
const validateSignature = (req, res, next) => {
    // --- Architect Adaptive Security Layer (BusinessSystemAdapter Policy) ---
    const signature = req.headers['x-cw-signature'];
    const expectedToken = process.env.CHATWOOT_API_TOKEN || 'mock_api_token';

    // 1. 如果处于 Mock 模式，启用环境自适应逻辑：允许绕过或自动注入测试 Hash
    if (process.env.MOCK_MODE === 'true') {
        if (!signature || signature !== expectedToken) {
            logger.info(`[Security-Handshake] Mock Adaptive Bypass: Auto-authorizing request for UID: ${req.params.ty_uid}`);
            // 自动注入虚拟签名以通过后续可能的逻辑检查
            req.headers['x-cw-signature'] = expectedToken;
            return next();
        }
    }

    // 2. 严格模式校验 (生产环境或非 Mock 模式下强制执行)
    if (!signature || signature !== expectedToken) {
        logger.warn(`[Security-Handshake] Unauthorized access attempt from IP: ${req.ip} | UID: ${req.params.ty_uid} | Header: ${signature}`);
        return res.status(403).json({ error: 'Security Handshake Failed', reason: 'INVALID_SIGNATURE' });
    }
    next();
};

/**
 * Customer 360 聚合接口 (只读)
 * GET /api/customer360/v1/profile/:ty_uid
 */
router.get('/profile/:ty_uid', validateSignature, async (req, res) => {
    const { ty_uid } = req.params;

    try {
        const view = await customer360Service.getCustomerFullView(ty_uid);

        if (!view) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        res.status(200).json(view);

    } catch (error) {
        logger.error(`[Customer360-API] Failed for ${ty_uid}: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
