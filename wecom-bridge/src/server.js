/**
 * WeCom Bridge Server (Phase 1 Complete)
 * 对接企业微信与 OpenClaw Gateway
 */
require('dotenv').config();
const express = require('express');
const crypto = require('./wecom_crypto');
const dedup = require('./dedup_store');
const openclaw = require('./openclaw_client');
const intent = require('./intent_processor');
const chatwoot = require('./chatwoot_client');
const stateStore = require('./state_store');
const wecom = require('./wecom_client'); // 新增 Phase 4

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

        // 1.5 同步到 Chatwoot (Phase 2)
        const chatwootConvId = await chatwoot.syncMessage(fromUser, content, msgId);

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
            // 4. 检查会话状态 (Phase H1)
            const currentMode = await stateStore.getMode(fromUser);
            console.log(`[State] Session for ${fromUser} is in ${currentMode}`);

            // 5. 业务逻辑处理
            let aiResponse;
            if (userIntent === intent.INTENTS.TRANSFER) {
                aiResponse = "【系统通知】已为您尝试连接人工客服，请稍等。由于当前咨询人数较多，您也可以先留言，我会尽快同步给真人同事。";
            } else if (userIntent === intent.INTENTS.CHITCHAT) {
                aiResponse = "您好！我是桐叶租车智能管家。您可以问我关于租车流程、押金规则或保险信息的问题，我会知无不言！";
            } else {
                // FAQ 逻辑 - 进入 OpenClaw (RAG)
                aiResponse = await openclaw.sendToAgent(content, fromUser);
            }

            // 6. 模式化分发 (Phase H2)
            if (currentMode === stateStore.MODES.HUMAN) {
                console.log(`[State] Human Mode: Sending suggestion to Chatwoot private note...`);
                if (chatwootConvId) {
                    await chatwoot.syncPrivateNote(chatwootConvId, aiResponse);
                }
                // 此时不再回复企微，直接返回 success 给企微服务器，避免其重试
                return res.send('success');
            } else {
                // AI 模式：发送消息给企微
                const encryptedXml = crypto.encryptMsg(aiResponse, msg.ToUserName, fromUser);

                // 同步 AI 消息到 Chatwoot 可见区域
                if (chatwootConvId) {
                    await chatwoot.syncResponse(chatwootConvId, aiResponse);
                }

                console.log(`[Response] AI Replying to ${fromUser}`);
                res.status(200).set('Content-Type', 'application/xml').send(encryptedXml);
            }

            // 7. 审计留痕
            dedup.logInteraction(fromUser, content, userIntent, aiResponse, msgId);
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

/**
 * Chatwoot Webhook 事件接收 (Phase H3)
 * 核心逻辑：立即返回 200，防止 Chatwoot 因为超时重发
 */
app.post('/chatwoot/events', (req, res) => {
    res.status(200).send({ status: 'received' });

    const payload = req.body;
    console.log('[Webhook] Full Payload:', JSON.stringify(payload, null, 2));
    const event = payload.event;
    const msgType = payload.message_type;
    const msgId = payload.id;
    const isPrivate = payload.private;
    const content = payload.content;

    // 获取企微 UserID (优先使用 identifier，其次是 source_id)
    const wecomUserId = (payload.contact && payload.contact.identifier)
        ? payload.contact.identifier
        : (payload.conversation && payload.conversation.contact_inbox ? payload.conversation.contact_inbox.source_id : null);

    (async () => {
        try {
            // 1. 仅处理出站且非私有的客服消息
            if (event === 'message_created' && msgType === 'outgoing' && !isPrivate && wecomUserId) {

                // 2. 防环路检查：如果是 Bridge 自己刚才同步的消息，则跳过
                const isDuplicate = await dedup.isOutboundDuplicate(msgId);
                if (isDuplicate) {
                    console.log(`[Webhook] Loop prevented for msg ${msgId}, skipping...`);
                    return;
                }

                console.log(`[Webhook] Human reply detected for ${wecomUserId}: "${content}"`);

                // 3. 转发给企微用户
                const success = await wecom.sendTextMessage(wecomUserId, content);

                if (success) {
                    // 4. 接管逻辑：一旦人工介入回复，将会话设为人工模式
                    await stateStore.setMode(wecomUserId, stateStore.MODES.HUMAN);
                }
            } else {
                console.log(`[Webhook] Ignored event: ${event} | Type: ${msgType} | User: ${wecomUserId}`);
            }
        } catch (error) {
            console.error('[Webhook] Async process failed:', error.message);
        }
    })();
});

app.listen(port, () => {
    console.log(`\n🦞 WeCom Bridge Service Running`);
    console.log(`- Local URL: http://localhost:${port}/wechat`);
    console.log(`- Tracking: OpenClaw at ${process.env.OPENCLAW_GATEWAY_URL}`);
});
