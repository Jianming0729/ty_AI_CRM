const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// 1. 加载基础 .env
dotenv.config();

// 2. 加载架构固化 Profile (Phase 4)
const profile = process.env.PROFILE;
if (!profile) {
    console.error('❌ [FATAL] PROFILE environment variable is NOT SET.');
    console.error('Available profiles: prod_global, prod_cn_direct, prod_cn_vpn, dev_local');
    process.exit(1);
}

const profilePath = path.join(__dirname, `../config/profiles/${profile}.env`);
if (!fs.existsSync(profilePath)) {
    console.error(`❌ [FATAL] Profile config NOT FOUND: ${profilePath}`);
    process.exit(1);
}

console.log(`[Config] 📂 Loading Architecture Profile: ${profile}`);
const profileConfig = dotenv.parse(fs.readFileSync(profilePath));
for (const key in profileConfig) {
    process.env[key] = profileConfig[key];
}
const express = require('express');
const crypto = require('./wecom_crypto');
const dedup = require('./dedup_store');
const openclaw = require('./openclaw_client');
const intent = require('./intent_processor');
const chatwoot = require('./chatwoot_client');
const stateStore = require('./state_store');
const wecom = require('./wecom_client');
const logger = require('./logger'); // 新增 Phase 5
const identityService = require('./identity_service'); // Phase 2
const bootstrapCheck = require('./bootstrap'); // Phase 1

// 全局错误捕获 (Phase 5 健壮性)
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
});

const app = express();
const port = process.env.PORT || 3001;

// 人工升级关键词
const ESCALATION_KEYWORDS = ['人工', '投诉', '电话', '找人', '真人', '客服'];

app.use(express.text({ type: ['application/xml', 'text/xml', 'application/x-www-form-urlencoded'] }));
app.use(express.json());

// 挂载 Identity 服务 (Phase 2)
const identityRouter = require('./identity_router');
app.use('/v1/identity', identityRouter);

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
    console.log(`[Message] POST /wechat incoming from ${req.ip}`); // Added log
    const { msg_signature, timestamp, nonce } = req.query;
    const xmlData = req.body;
    console.log('[Message] POST Query:', req.query);
    console.log('[Message] POST Body Type:', typeof xmlData);
    console.log('[Message] POST Body Length:', xmlData ? xmlData.length : 0);

    let msg, fromUser, content, msgId;
    try {
        // 1. 解密消息
        const decrypted = await crypto.decryptMsg(msg_signature, timestamp, nonce, xmlData);
        msg = decrypted.xml;
        msgId = msg.MsgId;
        fromUser = msg.FromUserName;
        content = msg.Content;

        console.log(`[Message] From: ${fromUser}, Content: ${content}, MsgId: ${msgId}`);
    } catch (error) {
        console.error('[Message] Decrypt failed:', error.message);
        return res.status(403).send('Forbidden');
    }

    try {
        // 1.5 身份解析 (Phase 2)
        console.log(`[Identity] Starting resolution for ${fromUser}...`);
        const identity = await identityService.resolveOrCreate('wecom', fromUser, { nickname: fromUser });
        const tyUid = identity.ty_uid;
        console.log(`[Identity] Resolved ${fromUser} to ${tyUid} (Handle: ${identity.handle}, isNew: ${identity.is_new_user})`);

        // 1.6 同步到 Chatwoot
        const chatwootConvId = await chatwoot.syncMessage(identity, content, msgId);

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

        // 3. 关键词自动升级人工 (Phase 5)
        const needsEscalation = ESCALATION_KEYWORDS.some(k => content.includes(k));
        if (needsEscalation) {
            logger.info(`[Escalation] User ${tyUid} (via ${fromUser}) requested human assistance.`);
            await stateStore.setMode(tyUid, stateStore.MODES.HUMAN);
            if (chatwootConvId) {
                chatwoot.syncPrivateNote(chatwootConvId, `🚨 预警：用户提及敏感词【${content}】，系统已自动切换至人工模式。`)
                    .catch(e => logger.warn(`[SyncGap] Failed to post escalation note: ${e.message}`));
            }
        }

        try {
            // 4. 检查会话状态 (使用 tyUid 持久态)
            const currentMode = await stateStore.getMode(tyUid);
            logger.debug(`[State] Session for ${tyUid} is in ${currentMode}`);

            // 5. 业务逻辑处理 (带降级保护)
            let aiResponse;
            try {
                if (userIntent === intent.INTENTS.TRANSFER || needsEscalation) {
                    aiResponse = "【系统通知】已为您尝试连接人工客服，请稍等。由于当前咨询人数较多，您也可以先留言，我会尽快同步给真人同事。";
                } else if (userIntent === intent.INTENTS.CHITCHAT) {
                    aiResponse = "您好！我是桐叶租车智能管家。您可以问我关于租车流程、押金规则或保险信息的问题，我会知无不言！";
                } else {
                    // FAQ 逻辑 - 进入 OpenClaw (RAG)
                    aiResponse = await openclaw.sendToAgent(content, tyUid);
                }
            } catch (aiError) {
                logger.error(`[Degradation] AI Processing failed: ${aiError.message}`);
                aiResponse = "【温馨提示】系统大脑由于网络波动暂时休息，已为您自动转接人工。如有紧急事项，建议您拨打页面下方电话。";
                await stateStore.setMode(tyUid, stateStore.MODES.HUMAN);
            }

            // 6. 模式化分发
            if (currentMode === stateStore.MODES.HUMAN || needsEscalation) {
                logger.info(`[State] Human Mode Active: Sending suggestion to Chatwoot for ${fromUser}`);
                if (chatwootConvId) {
                    await chatwoot.syncPrivateNote(chatwootConvId, aiResponse);
                }
                return res.send('success');
            } else {
                // AI 模式：发送消息给企微
                const encryptedXml = crypto.encryptMsg(aiResponse, msg.ToUserName, fromUser);

                // 同步 AI 消息到 Chatwoot (异步降级)
                if (chatwootConvId) {
                    chatwoot.syncResponse(chatwootConvId, aiResponse).catch(err =>
                        logger.warn(`[SyncGap] Chatwoot syncResponse failed: ${err.message}`)
                    );
                }

                logger.info(`[Response] AI Replying to ${fromUser} (tyUid: ${tyUid})`);
                res.status(200).set('Content-Type', 'application/xml').send(encryptedXml);
            }

            // 7. 审计留痕
            dedup.logInteraction(tyUid, content, userIntent, aiResponse, msgId);
            dedup.markProcessed(msgId);

        } catch (error) {
            logger.error(`[Fatal] Process error: ${error.message}`);
            res.send('success');
        }
    } catch (error) {
        logger.error(`[Fatal] Global error: ${error.message}`);
        res.send('success');
    }
});

/**
 * Chatwoot Webhook 事件接收 (Phase H3)
 * 核心逻辑：立即返回 200，防止 Chatwoot 因为超时重发
 */
app.post('/chatwoot/events', (req, res) => {
    console.log(`[Webhook] POST /chatwoot/events incoming from ${req.ip}`);
    res.status(200).send({ status: 'received' });

    const payload = req.body;
    logger.debug(`[Webhook] Event: ${payload.event} | SourceId: ${payload.conversation?.contact_inbox?.source_id}`);

    // 安全检查：防止 Payload 结构变化导致崩溃
    if (!payload.conversation || !payload.conversation.contact_inbox) {
        logger.warn('[Webhook] Ignored: Missing conversation or contact_inbox structure');
        return;
    }

    const event = payload.event;
    const msgType = payload.message_type;
    const msgId = payload.id;
    const isPrivate = payload.private;
    const content = payload.content;

    // 获取企微 UserID (优先使用 identifier，其次是 source_id)
    const wecomUserId = (payload.contact && payload.contact.identifier)
        ? payload.contact.identifier
        : payload.conversation.contact_inbox.source_id;

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

                // 3. 身份路由解析 (Phase 2)
                let targetId = wecomUserId;
                if (wecomUserId.startsWith('ty:')) {
                    const tyUid = wecomUserId.replace('ty:', '');
                    const resolution = await identityService.resolveDeliveryTarget(tyUid, ['wecom']);
                    if (resolution.ok && resolution.target.channel === 'wecom') {
                        targetId = resolution.target.external_key;
                    } else {
                        throw new Error(`Could not resolve WeCom target for ${wecomUserId}`);
                    }
                }

                console.log(`[Webhook] Human reply detected for ${targetId}: "${content}"`);

                // 4. 转发给企微用户
                const success = await wecom.sendTextMessage(targetId, content);

                if (success) {
                    // 5. 接管逻辑：一旦人工介入回复，将会话设为人工模式
                    const tyUid = wecomUserId.startsWith('ty:') ? wecomUserId.replace('ty:', '') : null;
                    if (tyUid) {
                        await stateStore.setMode(tyUid, stateStore.MODES.HUMAN);
                    } else {
                        await stateStore.setMode(targetId, stateStore.MODES.HUMAN);
                    }
                }
            } else {
                console.log(`[Webhook] Ignored event: ${event} | Type: ${msgType} | User: ${wecomUserId}`);
            }
        } catch (error) {
            console.error('[Webhook] Async process failed:', error.message);
        }
    })();
});

// 启动自检并开启服务
(async () => {
    try {
        await bootstrapCheck();
        app.listen(port, () => {
            logger.info(`\n🦞 WeCom Bridge Service Running`);
            logger.info(`- Local URL: http://localhost:${port}/wechat`);
            logger.info(`- Tracking: OpenClaw at ${process.env.OPENCLAW_GATEWAY_URL}`);
        });
    } catch (err) {
        logger.error(`[Fatal] Startup aborted: ${err.message}`);
        process.exit(1);
    }
})();
