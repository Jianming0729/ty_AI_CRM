const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const profile = process.env.PROFILE || 'prod_global';
const profilePath = path.join(__dirname, `../config/profiles/${profile}.env`);
if (fs.existsSync(profilePath)) {
    const profileConfig = dotenv.parse(fs.readFileSync(profilePath));
    for (const key in profileConfig) process.env[key] = profileConfig[key];
}

const express = require('express');
const crypto = require('./wecom_crypto');
const dedup = require('./dedup_store');
const openclaw = require('./openclaw_client');
const chatwoot = require('./chatwoot_client');
const stateStore = require('./state_store');
const wecom = require('./wecom_client');
const logger = require('./logger');
const identityService = require('./identity_service');
const bootstrapCheck = require('./bootstrap');

const app = express();
const port = process.env.PORT || 3001;

// --- 治理与自愈状态 ---
let lastCallbackAt = Date.now();
let lastAutoHealAt = 0;
let lastReconcileAt = 0;
let systemDegraded = false;

// 初始权限受 env 控制，但系统故障时会将其单向关闭
let autoConfigActive = process.env.WE_COM_AUTOCONFIG_ENABLED === 'true';

const DEBUG_ENABLED = process.env.DEBUG_CALLBACK === 'true';
const ASYNC_MODE = process.env.ASYNC_MODE === 'true';
const AUTO_HEAL_ENABLED = process.env.AUTO_HEAL_ENABLED === 'true';
const AUTO_HEAL_THRESHOLD = parseInt(process.env.AUTO_HEAL_THRESHOLD_SEC || '300');

/**
 * 治理级：受控的消息发送器 (闸门决策中心 - ty_uid 锚定)
 */
const governedSendKfMessage = async (corpId, tyUid, externalUserId, openKfId, content, msgCode = null) => {
    // 治理闸门 (Governance Gate)
    const session = await stateStore.getMsgCodeState(tyUid);
    const isSessionActive = session && session.state === stateStore.MSG_CODE_STATE.ACTIVE;

    if (!isSessionActive) {
        const reason = session ? `Session State: ${session.state}` : 'No Session Record';
        // 如果是人工主动回复且会话不活跃，返回特定错误以便通知坐席
        if (!msgCode) {
            logger.warn(`[Governance-Gate] 🚨 BLOCK_MANUAL_SEND: ty_uid ${tyUid} failed gate. Reason: ${reason}.`);
            return { success: false, errcode: -403, blocked: true, reason: 'SESSION_INACTIVE' };
        }
        // AI 自动回复同样拦截
        logger.error(`[Governance-Gate] 🚨 ABORT_REPLY: ty_uid ${tyUid} failed gate. Reason: ${reason}.`);
        return { success: false, errcode: -403, blocked: true, reason };
    }

    if (msgCode) {
        logger.info(`[Governance-Gate] Authorized AI reply for ${tyUid} with msg_code.`);
    } else {
        logger.info(`[Governance-Gate] Authorized manual delivery for ${tyUid}.`);
    }

    // 次级保护：失败计数熔断 (仅针对已有会话)
    if (session && session.failure_count >= 2) {
        await stateStore.invalidateMsgCode(tyUid, -2, 'Max retry failures exceeded (2)');
        logger.error(`[Governance-Gate] 🚨 CIRCUIT_BREAKER: ty_uid ${tyUid} failure count threshold reached.`);
        return { success: false, errcode: -2, blocked: true, reason: 'Failure threshold reached' };
    }

    // 2. 发送尝试 (原子动作)
    const result = await wecom.sendKfMessage(corpId, externalUserId, openKfId, content, msgCode);

    // 3. 状态回流与闭环 (G1 - 状态自愈由协议事件触发，此处仅负责标记失败)
    if (!result.success) {
        if (result.errcode === 95018 || result.errcode === 95016) {
            await stateStore.invalidateMsgCode(tyUid, result.errcode, result.errmsg);
            logger.error(`[Governance] FATAL_RECOVERY: code ${result.errcode} detected for ty_uid: ${tyUid}. Marking msg_code as INVALID.`);
            logger.error(`🚨 [PROTECTIVE_ALERT] Critical session entry failure for ${tyUid}. Manual rehydrate via new user message required.`);
        } else {
            await stateStore.reportFailure(tyUid);
        }
    }
    return result;
};

// 加载治理真值 (Source of Truth)
let GOVERNANCE_CONFIG = { kf_accounts: {} };
try {
    const govPath = path.join(__dirname, '../config/wework_governance.json');
    if (fs.existsSync(govPath)) {
        GOVERNANCE_CONFIG = JSON.parse(fs.readFileSync(govPath, 'utf8'));
        logger.info('[Governance] SOT Loaded Successfully.');
    }
} catch (e) { logger.error(`[Governance-Error] Failed to load SoT: ${e.message}`); }

// --- 基础中间件 ---
const traceMiddleware = (req, res, next) => {
    if (req.path.includes('callback') || req.path.includes('command')) {
        logger.info(`[TRACE] >>> ${req.method} ${req.originalUrl} | IP: ${req.ip} | Type: ${req.get('Content-Type')}`);
    }
    next();
};

app.use(traceMiddleware);
// 确保所有潜在的回调路径都能解析文本 Body
app.use(['/wecom/callback', '/wecom/command', '/callback'], express.text({ type: '*/*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- 合规与首页 (WeCom Compliance) ---
app.use(express.static(path.join(__dirname, '../public')));

const getComplianceHtml = (title, content) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; background: #f9f9f9; }
        .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        h2 { margin-top: 30px; color: #34495e; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
    </style>
</head>
<body>
    <div class="card">
        <pre>${content}</pre>
    </div>
</body>
</html>`;

app.get('/privacy', (req, res) => {
    const content = fs.readFileSync(path.join(__dirname, '../docs/wecom/privacy_policy_zh.md'), 'utf8');
    res.send(getComplianceHtml('隐私政策', content));
});

app.get('/terms', (req, res) => {
    const content = fs.readFileSync(path.join(__dirname, '../docs/wecom/service_agreement_zh.md'), 'utf8');
    res.send(getComplianceHtml('第三方服务协议', content));
});

app.get('/portal/chatwoot', (req, res) => {
    const target = process.env.PUBLIC_CRM_URL || process.env.CHATWOOT_BASE_URL || '/';
    logger.info(`[Portal] Redirecting user to: ${target}`);
    res.redirect(target);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

const processKfMessage = async (corpId, kfMsg, openKfId) => {
    const fromUser = kfMsg.external_userid; // 渠道 ID
    const msgId = kfMsg.msgid;
    const msgCode = kfMsg.msg_code;
    const sendTime = kfMsg.send_time;
    const content = (kfMsg.msgtype === 'text' && kfMsg.text) ? kfMsg.text.content || '' : `[${kfMsg.msgtype}]`;

    if (!fromUser) return;
    if (!msgCode && kfMsg.origin === 3) {
        logger.warn(`[Governance-Debug] msg_code MISSING for ${msgId}. FULL: ${JSON.stringify(kfMsg)}`);
    }

    // 治理级：获取处理锁 (但不得阻断协议层重灌)
    const isNewMessage = dedup.acquireLock(msgId);
    const nowSec = Math.floor(Date.now() / 1000);
    const age = nowSec - sendTime;
    const STALE_THRESHOLD = parseInt(process.env.STALE_THRESHOLD_SEC || '120');
    const isStale = age > STALE_THRESHOLD;

    try {
        // --- 第一阶段：协议与身份层 (Protocol & Identity Layer - 不受 dedup 阻断) ---
        let metadata = { nickname: fromUser };
        const userInfo = await wecom.getKfCustomer(corpId, fromUser);
        if (userInfo) {
            metadata.nickname = userInfo.nickname || fromUser;
            metadata.unionid = userInfo.unionid;
        }

        const identity = await identityService.resolveOrCreate('wecom', fromUser, metadata);
        const { ty_uid: tyUid, actor_type: actorType } = identity;

        // 核心治理：Rehydrate 必须逻辑闭环，不受 dedup 影响 (确保 95018 恢复可靠性)
        if (msgCode) {
            logger.info(`[Governance] Protocol Sync: Capturing msg_code for ${actorType}:${tyUid} at Corp:${corpId}.`);
            await stateStore.updateMsgCode(tyUid, corpId, msgCode);
        }

        // --- 第二阶段：幂等过滤层 (Deduplication Layer) ---
        if (!isNewMessage) {
            logger.info(`[Governance] Dedup Hit for ${msgId}. Protocol Layer REPLICATED, Action Layer SUPPRESSED.`);
            return;
        }

        logger.info(`[KF-Flow] >>> START: Corp:${corpId} | User:${fromUser} | Msg: ${msgId.substring(0, 8)} | Age: ${age}s`);

        // --- 第三阶段：操作与业务层 (Action & Business Layer) ---
        const chatwootConvId = await chatwoot.syncMessage(identity, content, msgId, metadata.nickname);

        if (isStale) {
            logger.info(`[KF-Flow] SKIP AI: Message is stale (${age}s).`);
            return;
        }

        const mode = await stateStore.getMode(tyUid);
        if (kfMsg.msgtype === 'text' && mode === stateStore.MODES.AI) {
            // 治理级检查：强制区分 Chatwoot 会话与 WeCom 会话 (使用 ty_uid)
            const session = await stateStore.getMsgCodeState(tyUid);
            const isSessionValid = session && session.state === stateStore.MSG_CODE_STATE.ACTIVE;

            if (!isSessionValid) {
                logger.error(`[Governance] ABORT_SEND: msg_code for ${tyUid} is NOT_ACTIVE. AI response suppressed.`);
                if (chatwootConvId) await chatwoot.syncPrivateNote(chatwootConvId, "🚨 治理提醒：该 WeCom 会话已失效，AI 已停止自动回复，等待用户新消息同步凭证。");
                return;
            }

            const aiResponse = await openclaw.sendToAgent(content, tyUid);
            // 使用受控发送器执行投递
            const result = await governedSendKfMessage(corpId, tyUid, fromUser, openKfId, aiResponse, msgCode);

            if (result.success) {
                if (chatwootConvId) await chatwoot.syncResponse(chatwootConvId, aiResponse);
                logger.info(`[KF-Flow] DONE: Global Success for ${fromUser}`);
            } else {
                const ec = result.errcode || 'FAILURE';
                if (chatwootConvId) await chatwoot.syncPrivateNote(chatwootConvId, `🚨 AI 投递失败 [${ec}]。${result.blocked ? '会话已被治理模块熔断保护。' : '已记录失败计数。'}`);
                logger.warn(`[KF-Flow] DONE: Delivery Failure [${ec}] for ${fromUser}`);
            }
        }
    } catch (err) {
        logger.error(`[KF-Flow] Fatal: ${err.message}`);
        dedup.releaseLock(msgId);
    } finally {
        dedup.markProcessed(msgId);
    }
};

/**
 * 声明式对账逻辑 (Read-Only Reconcile)
 */
const reconcileConfig = async () => {
    logger.info('[Reconcile] Starting Read-Only Configuration Audit...');
    try {
        const accounts = await wecom.getKfAccounts();
        if (!accounts) return;

        for (const acc of accounts) {
            const exp = GOVERNANCE_CONFIG.kf_accounts[acc.open_kfid];
            if (!exp) {
                logger.warn(`[RECONCILE_DIFF] Unknown Account Found in Production: ${acc.open_kfid} (${acc.name})`);
                continue;
            }

            // 1. 检查接待员列表
            const currentServicers = await wecom.getKfServicers(acc.open_kfid);
            const currentIds = (currentServicers || []).map(s => s.userid);
            const missing = (exp.servicers || []).filter(id => !currentIds.includes(id));
            const extra = currentIds.filter(id => !(exp.servicers || []).includes(id));

            if (missing.length > 0 || extra.length > 0) {
                logger.warn(`[RECONCILE_DIFF] Servicer Mismatch for ${acc.open_kfid}: Missing=${missing} | Extra=${extra}`);
            }
        }
        logger.info('[Reconcile] Audit Completed.');
    } catch (err) { logger.error(`[Reconcile-Error] ${err.message}`); }
};

const pollBacklog = async (corpId, specificOpenKfId = null) => {
    const openKfId = specificOpenKfId || process.env.WECOM_KF_ID || 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';
    if (!corpId) {
        logger.error(`[Poll-Backlog] Aborted: Missing corpId for openKfId: ${openKfId}`);
        return false;
    }

    const cursor = await stateStore.getKfCursor(openKfId);
    try {
        const syncResult = await wecom.syncKfMessages(corpId, cursor, openKfId);
        if (syncResult && syncResult.msg_list && syncResult.msg_list.length > 0) {
            lastCallbackAt = Date.now();
            syncResult.msg_list.sort((a, b) => a.send_time - b.send_time);
            for (const m of syncResult.msg_list) if (m.origin === 3) await processKfMessage(corpId, m, openKfId);
            if (syncResult.next_cursor) await stateStore.setKfCursor(openKfId, syncResult.next_cursor);
            return true;
        }
        return false;
    } catch (err) { throw err; }
};

const startWorker = async () => {
    logger.info('[Worker] Async Event Worker Started.');
    while (true) {
        const item = await stateStore.fetchPending();
        if (item) {
            await stateStore.markProcessing(item.id);
            try {
                await pollBacklog(item.corp_id, item.open_kfid);
                await stateStore.markDone(item.id);
            } catch (err) {
                await stateStore.markFailed(item.id, err.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        } else { await new Promise(r => setTimeout(r, 500)); }
    }
};

const callbackHandler = async (req, res) => {
    lastCallbackAt = Date.now();
    const { msg_signature, timestamp, nonce, echostr } = req.query;

    // --- Phase 1: Callback URL Verification (GET) ---
    // 仅用于应用初始化时的 URL 验证
    if (req.method === 'GET' && echostr) {
        try {
            const decryptedEchoStr = crypto.verifyURL(msg_signature, timestamp, nonce, echostr);
            logger.info(`[CALLBACK_VERIFY] URL Verified successfully for IP: ${req.ip}`);
            return res.status(200).send(decryptedEchoStr);
        } catch (e) {
            logger.error(`[CALLBACK_VERIFY_FAIL] Verification failed: ${e.message}`);
            return res.status(403).send('Verification failed');
        }
    }

    // --- Phase 2: Message & Event Handling (POST) ---
    // 微信服务器推送的生产级消息处理
    try {
        if (!msg_signature) {
            logger.warn(`[CALLBACK_POST] Missing signature from IP: ${req.ip}`);
            return res.status(200).send('success');
        }

        const decrypted = await crypto.decryptMsg(msg_signature, timestamp, nonce, req.body);
        const msg = decrypted.xml;

        // A. 第三方应用系统指令 (Suite Events)
        if (msg.InfoType) {
            const infoType = msg.InfoType;
            logger.info(`[WECOM_SUITE_EVENT] Type: ${infoType}`);

            switch (infoType) {
                case 'suite_ticket':
                    if (msg.SuiteId && msg.SuiteTicket) {
                        await stateStore.setSuiteTicket(msg.SuiteId, msg.SuiteTicket);
                        logger.info(`[WECOM_SUITE_EVENT] Ticket Updated & Persisted for ${msg.SuiteId}.`);
                    } else {
                        logger.warn('[WECOM_SUITE_EVENT] suite_ticket missing SuiteId or SuiteTicket content.');
                    }
                    break;
                case 'create_auth':
                    logger.info(`[WECOM_SUITE_EVENT] New Auth received. Code: ${msg.AuthCode}`);
                    // 异步触发激活流程，不阻塞回调 200 响应
                    wecom.activateTenant(msg.AuthCode).catch(e => {
                        logger.error(`[WECOM_SUITE_EVENT] Activation Background Job Failed: ${e.message}`);
                    });
                    break;
                case 'cancel_auth':
                    logger.warn(`[WECOM_SUITE_EVENT] Auth Cancelled by: ${msg.AuthCorpId}`);
                    break;
                default:
                    if (DEBUG_ENABLED) logger.info(`[WECOM_SUITE_EVENT] Other: ${infoType}`);
            }
            return res.status(200).send('success');
        }

        // B. 微信客服回调逻辑 (KF Messages/Events)
        if (msg.MsgType === 'event' && msg.Event === 'kf_msg_or_event') {
            const corpId = msg.ToUserName; // 回调解密报文中的 ToUserName 即为 CorpId
            if (ASYNC_MODE) {
                await stateStore.enqueue(corpId, msg.OpenKfId);
            } else {
                await pollBacklog(corpId, msg.OpenKfId);
            }
        } else if (DEBUG_ENABLED) {
            logger.info(`[WECOM_MSG_EVENT] Unhandled. Type: ${msg.MsgType}, Event: ${msg.Event}`);
        }

        // 无论业务逻辑是否成功，必须返回 success 给微信，防止重试风暴
        return res.status(200).send('success');

    } catch (e) {
        // 关键：异常捕获。解密失败可能涉及：1. Body 解析不对；2. Token/AESKey 不匹配
        let bodyPreview = 'EMPTY';
        if (req.body) {
            if (typeof req.body === 'string') bodyPreview = req.body.substring(0, 200);
            else bodyPreview = JSON.stringify(req.body).substring(0, 200);
        }
        logger.error(`[CALLBACK_FATAL] Error processing callback: ${e.message} | Body Preview: ${bodyPreview}`);
        if (e.stack) logger.error(e.stack);

        // 即使出错也返回 success，防止企微不断重试
        return res.status(200).send('success');
    }
};

// 【治愈与治理中心 - 1分钟心跳】
setInterval(async () => {
    const now = Date.now();
    const silenceSec = Math.floor((now - lastCallbackAt) / 1000);

    if (silenceSec > AUTO_HEAL_THRESHOLD) {
        logger.warn(`[CALLBACK_SILENCE_WARN] No callback for ${silenceSec}s.`);

        // --- 强制边界：单向降级 ---
        if (autoConfigActive) {
            logger.warn('[Governance] AUTOMATIC DEGRADATION: Link failure detected. Auto-Config DISABLED (One-Way). Manual recovery required.');
            autoConfigActive = false;
            systemDegraded = true;
        }

        if (AUTO_HEAL_ENABLED && (now - lastAutoHealAt > 60000)) {
            lastAutoHealAt = now;
            pollBacklog().catch(() => { });
        }
    }

    // 定时对账
    if (now - lastReconcileAt > (GOVERNANCE_CONFIG.global_settings?.auto_reconcile_interval_ms || 3600000)) {
        lastReconcileAt = now;
        reconcileConfig().catch(() => { });
    }
}, 60000);

app.all('/wecom/callback', callbackHandler);
app.all('/wecom/command', callbackHandler);
app.all('/callback', callbackHandler);
// app.all('/', callbackHandler); // Removed to allow landing page

app.post('/webhook/chatwoot', (req, res) => {
    const payload = req.body;
    logger.info(`[Webhook] Received Chatwoot event: ${payload.event} | Type: ${payload.message_type}`);
    res.status(200).send({ status: 'received' });
    if (payload.event === 'message_created' && payload.message_type === 'outgoing' && !payload.private) {
        (async () => {
            const sourceId = payload.contact?.identifier || payload.conversation?.contact_inbox?.source_id;
            if (!sourceId) return;

            let tyUid = sourceId.startsWith('ty:') ? sourceId.replace('ty:', '') : null;
            let externalUserId = !sourceId.startsWith('ty:') ? sourceId : null;

            try {
                // 如果只有 tyUid，解析出外部 ID 用于投递
                if (tyUid && !externalUserId) {
                    const r = await identityService.resolveDeliveryTarget(tyUid, ['wecom']);
                    if (r.ok) externalUserId = r.target.external_key;
                }
                // 如果只有外部 ID，解析出 tyUid 用于治理
                else if (externalUserId && !tyUid) {
                    const identity = await identityService.resolveOrCreate('wecom', externalUserId);
                    tyUid = identity.ty_uid;
                }

                if (!tyUid || !externalUserId) {
                    logger.error(`[Webhook] Failed to resolve tyUid/externalUserId for ${sourceId}`);
                    return;
                }

                const openKfId = process.env.WECOM_KF_ID || 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';

                // 多租户治理：解析 ty_uid 对应的 corp_id
                const corpId = await stateStore.getCorpIdByTyUid(tyUid);
                if (!corpId) {
                    logger.error(`[Webhook] ABORT: Could not resolve CorpId for ty_uid ${tyUid}. User must re-activate.`);
                    return;
                }

                // 使用受控发送器 (Governance: ty_uid Anchored)
                const result = await governedSendKfMessage(corpId, tyUid, externalUserId, openKfId, payload.content);

                // 如果被拦截是因为会话不活跃，给坐席发送私有提示
                if (result.blocked && result.reason === 'SESSION_INACTIVE') {
                    const conversationId = payload.conversation.id;
                    await chatwoot.syncPrivateNote(conversationId,
                        `🚨 【发送失败】当前客户会话未激活（企微 48h 窗口可能已关闭或 95018 风险）。\n\n请引导客户先在企业微信中发送任意消息（或图片/位置）以激活会话，然后再进行回复。`
                    );
                }
            } catch (error) {
                logger.error(`[Webhook] Process failed for ${sourceId}: ${error.message}`);
            }
        })();
    }
});

(async () => {
    await bootstrapCheck();

    // 启动自检日志：检查最新 suite_ticket 的时效性
    const latestTicket = await stateStore.getLatestSuiteTicket();
    if (latestTicket) {
        logger.info(`[Bootstrap] Latest suite_ticket age: ${latestTicket.age_sec}s (SuiteID: ${latestTicket.suite_id})`);

        // Warmup: 尝试预热 suite_access_token
        await wecom.getSuiteAccessToken().catch(e => logger.error(`[Bootstrap] Warmup failed: ${e.message}`));
    } else {
        logger.warn('[Bootstrap] No suite_ticket found in database. Waiting for first callback.');
    }

    app.listen(port, async () => {
        logger.info(`🦞 Bridge Active [Port: ${port}]`);
        if (ASYNC_MODE) startWorker();
        await pollBacklog();
        reconcileConfig();
    });
})();
