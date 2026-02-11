const axios = require('axios');
const logger = require('./logger');
const stateStore = require('./state_store');

const SUITE_ID = process.env.WECOM_SUITE_ID;
const SUITE_SECRET = process.env.WECOM_SUITE_SECRET;

const FALLBACK_CONFIG = {
    COOLDOWN_MS: 1500,
    MSGCODE_MAX_AGE_SEC: 600
};

const stateMachine = new Map();

const wecomClient = {
    /**
     * 获取三方应用 Suite AccessToken (SaaS 核心)
     */
    getSuiteAccessToken: async () => {
        const data = await stateStore.getSuiteData(SUITE_ID);
        const now = Math.floor(Date.now() / 1000);

        // 1. 缓存有效性检查 (预留 120s 安全窗口)
        if (data && data.suite_access_token && data.expire_at > (now + 120)) {
            return data.suite_access_token;
        }

        // 2. 检查刷新条件：必须有 suite_ticket
        if (!data || !data.suite_ticket) {
            logger.error('[Suite-Auth] Cannot refresh token: suite_ticket missing in DB. Waiting for callback.');
            return data ? data.suite_access_token : null;
        }

        // 3. 执行远端刷新
        try {
            logger.info('[Suite-Auth] Attempting to refresh suite_access_token...');
            const res = await axios.post('https://qyapi.weixin.qq.com/cgi-bin/service/get_suite_token', {
                suite_id: SUITE_ID,
                suite_secret: SUITE_SECRET,
                suite_ticket: data.suite_ticket
            });

            if (res.data.suite_access_token) {
                const token = res.data.suite_access_token;
                const expiresAt = now + res.data.expires_in;
                await stateStore.saveSuiteToken(SUITE_ID, token, expiresAt);
                logger.info('[Suite-Auth] suite_access_token refreshed and persisted.');
                return token;
            } else {
                logger.error(`[Suite-Auth] Refresh Failed. ErrCode: ${res.data.errcode}, Msg: ${res.data.errmsg}`);
                return data ? data.suite_access_token : null;
            }
        } catch (error) {
            logger.error(`[Suite-Auth] Network Error during refresh: ${error.message}`);
            return data ? data.suite_access_token : null;
        }
    },

    /**
     * 动态获取租户企业 AccessToken (Multi-Tenant Factory)
     * corp_id -> permanent_code(DB) -> suite_access_token -> corp_access_token
     */
    getCorpAccessToken: async (corpId) => {
        if (!corpId) throw new Error('[Tenant-Auth] Missing corp_id for token generation.');

        const tenant = await stateStore.getTenant(corpId);
        const now = Math.floor(Date.now() / 1000);

        // 1. 缓存有效性检查 (预留 120s 安全窗口)
        if (tenant && tenant.access_token && tenant.expire_at > (now + 120)) {
            return tenant.access_token;
        }

        // 2. 刷新凭证
        if (!tenant || !tenant.permanent_code) {
            throw new Error(`[Tenant-Auth] No permanent_code found for Tenant: ${corpId}. Please verify auth.`);
        }

        try {
            const suiteToken = await wecomClient.getSuiteAccessToken();
            logger.info(`[Tenant-Auth] Refreshing corp_access_token for: ${corpId}...`);
            const res = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/service/get_corp_token?suite_access_token=${suiteToken}`, {
                auth_corpid: corpId,
                permanent_code: tenant.permanent_code
            });

            if (res.data.access_token) {
                const token = res.data.access_token;
                const expiresAt = now + res.data.expires_in;
                await stateStore.saveCorpToken(corpId, token, expiresAt);
                return token;
            } else {
                logger.error(`[Tenant-Auth] Failed to get corp_token for ${corpId}: ${res.data.errcode}`);
                return tenant.access_token; // 容错
            }
        } catch (error) {
            logger.error(`[Tenant-Auth] Network Error for tenant ${corpId}: ${error.message}`);
            return tenant ? tenant.access_token : null;
        }
    },

    /**
     * 激活租户：使用 AuthCode 换取永久授权码并存库 (SaaS 合法性确权)
     * 目标：实现第三方应用授权闭环，将 permanent_code 与 corp_id 持久化到 SSOT (Postgres)
     */
    activateTenant: async (authCode) => {
        try {
            const suiteToken = await wecomClient.getSuiteAccessToken();
            if (!suiteToken) throw new Error('Missing suite_access_token');

            logger.info(`[Tenant-Activation] 🔐 Attempting Auth Exchange for Code: ${authCode.substring(0, 5)}...`);

            // 1. 调用「获取企业永久授权码」接口
            const res = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/service/get_permanent_code?suite_access_token=${suiteToken}`, {
                auth_code: authCode
            });

            if (res.data.errcode === 0) {
                const { permanent_code, auth_corp_info, auth_info } = res.data;
                const corpId = auth_corp_info.corpid;
                const corpName = auth_corp_info.corp_name;

                // 2. 授权固化 (SSOT 持久化)
                // 幂等性说明：saveAuthorizedCorp 内部使用 ON CONFLICT (corp_id) DO UPDATE
                // 确保重复授权时仅更新授权信息，不产生脏数据。
                await stateStore.saveAuthorizedCorp(corpId, permanent_code, corpName, auth_info);

                logger.info(`🎊 [Tenant-Activation] SUCCESS: Tenant ${corpName} (${corpId}) authorized.`);
                return { success: true, corpId };
            } else {
                // 错误重试说明：WeCom 回调会有重试机制，此处抛出错误由 server.js 的 catch 捕获并记录
                // 若失败，企业侧可重新触发授权流程。
                throw new Error(`Exchange failed: ${res.data.errcode} - ${res.data.errmsg}`);
            }
        } catch (error) {
            logger.error(`[Tenant-Activation] FATAL_AUTH_EXCHANGE: ${error.message}`);
            throw error;
        }
    },

    sendKfMessage: async (corpId, toUser, openKfId, content, msgCode = null) => {
        const traceId = Math.random().toString(36).substring(7);
        const token = await wecomClient.getCorpAccessToken(corpId);

        const payload = {
            touser: toUser,
            open_kfid: openKfId,
            msgtype: 'text',
            text: { content }
        };
        if (msgCode) payload.msg_code = msgCode;

        try {
            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`, payload);

            logger.info(JSON.stringify({
                tag: "OUTBOUND_METRICS",
                trace_id: traceId,
                corp_id: corpId,
                external_userid: toUser,
                errcode: response.data.errcode,
                errmsg: response.data.errmsg
            }));

            return {
                success: response.data.errcode === 0,
                errcode: response.data.errcode,
                errmsg: response.data.errmsg
            };
        } catch (error) {
            logger.error(`[WeCom-KF] Send Error: ${error.message}`);
            return { success: false, errcode: -1, errmsg: error.message };
        }
    },

    transKfServiceState: async (corpId, openKfId, externalUserId, serviceState = 2, servicerUserId = null) => {
        try {
            const token = await wecomClient.getCorpAccessToken(corpId);
            const payload = {
                open_kfid: openKfId,
                external_userid: externalUserId,
                service_state: serviceState
            };
            if (servicerUserId) payload.servicer_userid = servicerUserId;

            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans?access_token=${token}`, payload);
            logger.info(`[State-Trans] Corp: ${corpId} | User: ${externalUserId} -> State: ${serviceState} | Res: ${response.data.errcode}`);
            return response.data.errcode === 0;
        } catch (error) { return false; }
    },

    getKfCustomer: async (corpId, externalUserId) => {
        try {
            const token = await wecomClient.getCorpAccessToken(corpId);
            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/customer/batchget?access_token=${token}`, {
                external_userid_list: [externalUserId]
            });
            return (response.data.errcode === 0 && response.data.customer_list?.length > 0) ? response.data.customer_list[0] : null;
        } catch (error) { return null; }
    },

    syncKfMessages: async (corpId, cursor, openKfId) => {
        try {
            const token = await wecomClient.getCorpAccessToken(corpId);
            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${token}`, {
                cursor: cursor || '', limit: 20, open_kfid: openKfId
            });
            return response.data.errcode === 0 ? response.data : null;
        } catch (error) { return null; }
    },

    getKfServicers: async (corpId, openKfId) => {
        try {
            const token = await wecomClient.getCorpAccessToken(corpId);
            const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`);
            return response.data.errcode === 0 ? response.data.servicer_list : null;
        } catch (error) { return null; }
    },

    getKfAccounts: async (corpId) => {
        try {
            const token = await wecomClient.getCorpAccessToken(corpId);
            const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/list?access_token=${token}`);
            return response.data.errcode === 0 ? response.data.account_list : null;
        } catch (error) { return null; }
    }
};

module.exports = wecomClient;
