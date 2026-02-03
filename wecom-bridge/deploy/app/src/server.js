/**
 * WeCom Bridge Server (Phase 1 Complete)
 * 对接企业微信与 OpenClaw Gateway
 */
require('dotenv').config();
const express = require('express');
const crypto = require('./wecom_crypto');
const dedup = require('./dedup_store');
const openclaw = require('./openclaw_client');
const intent = require('./intent_processor'); // 新增

const app = express();
const port = process.env.PORT || 3001;

app.use(express.text({ type: ['application/xml', 'text/xml', 'application/x-www-form-urlencoded'] }));
app.use(express.json());

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * 验证 URL
 */
app.get('/wechat', (req, res) => {
    console.log('[Verify] Full Query:', req.query);
    const { msg_signature, timestamp, nonce, echostr } = req.query;
    try {
        const decryptedEchoStr = crypto.verifyURL(msg_signature, timestamp, nonce, echostr);
        console.log('[Verify] Decrypted EchoStr:', decryptedEchoStr.toString());
        console.log('[Verify] URL verification success');
        res.status(200).set('Content-Type', 'text/plain').send(decryptedEchoStr.toString());
    } catch (error) {
        console.error('[Verify] URL verification failed:', error.message);
        res.status(403).send('Forbidden');
    }
});

/**
 * 接收消息
 */
app.post('/wechat', async (req, res) => {
    const { msg_signature, timestamp, nonce } = req.query;
    const xmlData = req.body;
    console.log('[Message] POST Query:', req.query);
    console.log('[Message] POST Body Type:', typeof xmlData);
    console.log('[Message] POST Body Length:', xmlData ? xmlData.length : 0);

    try {
        // 1. 解密消息
        const decrypted = await crypto.decryptMsg(msg_signature, timestamp, nonce, xmlData);
        const msg = decrypted.xml;
        const msgId = msg.MsgId;
        const fromUser = msg.FromUserName;
        const content = msg.Content;

        console.log(`[Message] From: ${fromUser}, Content: ${content}, MsgId: ${msgId}`);

        // 2. 幂等去重
        const isDuplicate = await dedup.isDuplicate(msgId);
        if (isDuplicate) {
            console.log(`[Dedup] Duplicate message detected: ${msgId}, skipping...`);
            return res.send('success');
        }

        // 3. 意图分发治理 (Governance Step 7)
        const userIntent = intent.classifyIntent(content);
        console.log(`[Intent] Classified as: ${userIntent}`);

        // 4. 业务动作阻断 (Governance Step 2.2 Deny List)
        // 一期拦截：禁止 AI 直接进行取消/退款等高风险操作
        if (content.match(/取消订单|退款|人工支付/) && userIntent === intent.INTENTS.ORDER) {
            const warningMsg = "【温馨提示】订单取消与退款涉及资金安全，请点击下方[人工客服]为您处理，或在 [我的订单] 手动操作。";
            const encryptedXml = crypto.encryptMsg(warningMsg, msg.ToUserName, fromUser);
            dedup.logInteraction(fromUser, content, userIntent, warningMsg, msgId);
            return res.status(200).set('Content-Type', 'application/xml').send(encryptedXml);
        }

        try {
            // 5. 调研/执行模块 (RAG vs Tool)
            let aiResponse;

            if (userIntent === intent.INTENTS.TRANSFER) {
                aiResponse = "【系统通知】已为您尝试连接人工客服，请稍等。由于当前咨询人数较多，您也可以先留言，我会尽快同步给真人同事。";
            } else if (userIntent === intent.INTENTS.CHITCHAT) {
                aiResponse = "您好！我是桐叶租车智能管家。您可以问我关于租车流程、押金规则或保险信息的问题，我会知无不言！";
            } else {
                // FAQ 逻辑 - 进入 OpenClaw (RAG)
                aiResponse = await openclaw.sendToAgent(content, fromUser);
            }

            // 6. 构造 XML 回复 (被动回复)
            const encryptedXml = crypto.encryptMsg(aiResponse, msg.ToUserName, fromUser);

            // 7. 审计留痕 (Governance Step 6 & 82)
            dedup.logInteraction(fromUser, content, userIntent, aiResponse, msgId);

            console.log(`[Response] Sending back to ${fromUser} [Intent: ${userIntent}]`);
            res.status(200).set('Content-Type', 'application/xml').send(encryptedXml);

            dedup.markProcessed(msgId);
        } catch (error) {
            console.error('[Process] Error processing message:', error.message);
            res.send('success');
        }

    } catch (error) {
        console.error('[Message] Decrypt failed:', error.message);
        res.status(403).send('Forbidden');
    }
});

app.listen(port, () => {
    console.log(`\n🦞 WeCom Bridge Service Running`);
    console.log(`- Local URL: http://localhost:${port}/wechat`);
    console.log(`- Tracking: OpenClaw at ${process.env.OPENCLAW_GATEWAY_URL}`);
});
