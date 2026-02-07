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

// 加载治理真值 (Source of Truth)
let GOVERNANCE_CONFIG = { kf_accounts: {} };
try {
    const govPath = path.join(__dirname, '../config/wework_governance.json');
    if (fs.existsSync(govPath)) {
        GOVERNANCE_CONFIG = JSON.parse(fs.readFileSync(govPath, 'utf8'));
        logger.info('[Governance] SOT Loaded Successfully.');
    }
} catch (e) { logger.error(`[Governance-Error] Failed to load SoT: ${e.message}`); }

app.use(express.text({ type: ['application/xml', 'text/xml', 'application/x-www-form-urlencoded'] }));
app.use(express.json());

const processKfMessage = async (kfMsg, openKfId) => {
    const fromUser = kfMsg.external_userid;
    const msgId = kfMsg.msgid;
    const msgCode = kfMsg.msg_code;
    const sendTime = kfMsg.send_time;
    const content = (kfMsg.msgtype === 'text' && kfMsg.text) ? kfMsg.text.content || '' : `[${kfMsg.msgtype}]`;

    if (!fromUser || !dedup.acquireLock(msgId)) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const age = nowSec - sendTime;
    const STALE_THRESHOLD = parseInt(process.env.STALE_THRESHOLD_SEC || '120');
    const isStale = age > STALE_THRESHOLD;

    logger.info(`[KF-Flow] >>> START: ${fromUser} | Msg: ${msgId.substring(0,8)} | Age: ${age}s`);

    try {
        let metadata = { nickname: fromUser };
        const userInfo = await wecom.getKfCustomer(fromUser);
        if (userInfo) {
            metadata.nickname = userInfo.nickname || fromUser;
            metadata.unionid = userInfo.unionid;
        }

        const identity = await identityService.resolveOrCreate('wecom', fromUser, metadata);
        const chatwootConvId = await chatwoot.syncMessage(identity, content, msgId, metadata.nickname);

        if (isStale) {
            logger.info(`[KF-Flow] SKIP AI: Message is stale (${age}s).`);
            return;
        }

        const mode = await stateStore.getMode(identity.ty_uid);
        if (kfMsg.msgtype === 'text' && mode === stateStore.MODES.AI) {
            const aiResponse = await openclaw.sendToAgent(content, identity.ty_uid);
            let result = await wecom.sendKfMessage(fromUser, openKfId, aiResponse, msgCode);
            if (result === true) {
                if (chatwootConvId) await chatwoot.syncResponse(chatwootConvId, aiResponse);
                logger.info(`[KF-Flow] DONE: Global Success for ${fromUser}`);
            } else {
                const ec = (result && result.errcode) ? result.errcode : 'FAILURE';
                if (chatwootConvId) await chatwoot.syncPrivateNote(chatwootConvId, `🚨 AI 投递异常 [${ec}]。已触发自愈重试。`);
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

const pollBacklog = async (specificOpenKfId = null) => {
    const openKfId = specificOpenKfId || process.env.WECOM_KF_ID || 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';
    const cursor = await stateStore.getKfCursor(openKfId);
    try {
        const syncResult = await wecom.syncKfMessages(cursor, openKfId);
        if (syncResult && syncResult.msg_list && syncResult.msg_list.length > 0) {
            lastCallbackAt = Date.now();
            syncResult.msg_list.sort((a,b) => a.send_time - b.send_time);
            for (const m of syncResult.msg_list) if (m.origin === 3) await processKfMessage(m, openKfId);
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
                await pollBacklog(item.open_kfid);
                await stateStore.markDone(item.id);
            } catch (err) {
                await stateStore.markFailed(item.id, err.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        } else { await new Promise(r => setTimeout(r, 500)); }
    }
};

const callbackHandler = async (req, res) => {
    if (DEBUG_ENABLED) {
        logger.info(`[RECEIVED_CALLBACK] IP: ${req.ip} | UA: ${req.get('User-Agent')} | Path: ${req.path}`);
    }
    lastCallbackAt = Date.now();
    const { msg_signature, timestamp, nonce } = req.query;
    if (!msg_signature) return res.send('success');
    try {
        const decrypted = await crypto.decryptMsg(msg_signature, timestamp, nonce, req.body);
        const msg = decrypted.xml;
        if (msg.MsgType === 'event' && msg.Event === 'kf_msg_or_event') {
            if (ASYNC_MODE) {
                await stateStore.enqueue(msg.OpenKfId);
                res.send('success');
            } else {
                res.send('success');
                await pollBacklog(msg.OpenKfId);
            }
        } else { res.send('success'); }
    } catch (e) { 
        logger.error(`[CB-DECRYPT-FAIL] Code: ERR_CRYPTO_01 | Msg: ${e.message}`);
        res.send('success');
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
            pollBacklog().catch(() => {});
        }
    }

    // 定时对账
    if (now - lastReconcileAt > (GOVERNANCE_CONFIG.global_settings?.auto_reconcile_interval_ms || 3600000)) {
        lastReconcileAt = now;
        reconcileConfig().catch(() => {});
    }
}, 60000);

app.all('/wecom/callback', callbackHandler);
app.all('/callback', callbackHandler);
app.all('/', callbackHandler);

app.post('/webhook/chatwoot', (req, res) => {
    res.status(200).send({ status: 'received' });
    const payload = req.body;
    if (payload.event === 'message_created' && payload.message_type === 'outgoing' && !payload.private) {
        (async () => {
            const sourceId = payload.contact?.identifier || payload.conversation?.contact_inbox?.source_id;
            if (!sourceId) return;
            let targetId = sourceId.startsWith('ty:') ? sourceId.replace('ty:', '') : sourceId;
            if (sourceId.startsWith('ty:')) {
                const r = await identityService.resolveDeliveryTarget(targetId);
                if (r.ok) targetId = r.target.external_key;
            }
            const openKfId = process.env.WECOM_KF_ID || 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';
            await wecom.sendKfMessage(targetId, openKfId, payload.content);
        })();
    }
});

(async () => {
    await bootstrapCheck();
    app.listen(port, async () => {
        logger.info(`🦞 Bridge Active [Port: ${port}]`);
        if (ASYNC_MODE) startWorker();
        await pollBacklog();
        reconcileConfig();
    });
})();
