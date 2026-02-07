const axios = require('axios');
const logger = require('./logger');

const corpId = process.env.WECOM_KF_CORP_ID || 'wwcc13ff6e75e81173';
const secret = process.env.WECOM_KF_SECRET || 'DDL6MI_cm2XZVcXcV33i2RkjbBCFIWiY2g3jIDp7Tek';

const FALLBACK_CONFIG = {
    COOLDOWN_MS: 1500,
    MSGCODE_MAX_AGE_SEC: 600
};

const stateMachine = new Map();

const wecomClient = {
    getAccessToken: async () => {
        try {
            const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
            return response.data.access_token;
        } catch (error) {
            logger.error(`[WeCom-Auth] Token Error: ${error.message}`);
            return null;
        }
    },

    sendKfMessage: async (toUser, openKfId, content, msgCode = null) => {
        const traceId = Math.random().toString(36).substring(7);
        const now = Date.now();
        
        if (msgCode) stateMachine.set(toUser, { msgCode, ts: now });
        const cached = stateMachine.get(toUser);
        
        const deliver = async (useMsgCode = null, mode = 'primary') => {
            const token = await wecomClient.getAccessToken();
            const payload = {
                touser: toUser,
                open_kfid: openKfId,
                msgtype: 'text',
                text: { content }
            };
            if (useMsgCode) payload.msg_code = useMsgCode;
            
            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`, payload);
            
            logger.info(JSON.stringify({
                tag: "OUTBOUND_METRICS",
                trace_id: traceId,
                external_userid: toUser,
                attempt: mode,
                errcode: response.data.errcode,
                errmsg: response.data.errmsg
            }));
            
            return response.data;
        };

        // 1. 尝试发送
        let activeMsgCode = msgCode || (cached?.msgCode);
        let result = await deliver(activeMsgCode, 'primary');

        // 2. 自愈策略：针对 95018 / 95016 (状态错误)
        if (result.errcode === 95018 || result.errcode === 95016) {
            logger.warn(`[HF-Retry] Trace: ${traceId} | 95018 Detected. Reseting to State 1 (Waiting)...`);
            
            // 尝试“归位”到待接入状态（状态1）
            await wecomClient.transKfServiceState(openKfId, toUser, 3);
            await new Promise(r => setTimeout(r, 800));
            
            let success = await wecomClient.transKfServiceState(openKfId, toUser, 1);
            if (!success) {
                await wecomClient.transKfServiceState(openKfId, toUser, 2, null);
            }
            
            await new Promise(r => setTimeout(r, FALLBACK_CONFIG.COOLDOWN_MS));
            
            // 再次投递（带 msg_code）
            result = await deliver(activeMsgCode, 'fallback');

            // 3. 终极自愈：如果带 msg_code 依然失败，尝试“盲发”（不带 msg_code）
            // 解决由于接待员配置问题导致的 session 状态无法手动 Trans 的僵局
            if (result.errcode === 95018 || result.errcode === 95016) {
                logger.warn(`[HF-Retry] Trace: ${traceId} | Fallback failed. Attempting BLIND-SEND (No MsgCode)...`);
                result = await deliver(null, 'blind-send');
            }
        }

        return result.errcode === 0 ? true : result;
    },

    transKfServiceState: async (openKfId, externalUserId, serviceState = 2, servicerUserId = null) => {
        try {
            const token = await wecomClient.getAccessToken();
            const payload = {
                open_kfid: openKfId,
                external_userid: externalUserId,
                service_state: serviceState
            };
            if (servicerUserId) payload.servicer_userid = servicerUserId;

            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans?access_token=${token}`, payload);
            logger.info(`[State-Trans] User: ${externalUserId} -> State: ${serviceState} | Res: ${response.data.errcode}`);
            return response.data.errcode === 0;
        } catch (error) { return false; }
    },

    getKfCustomer: async (externalUserId) => {
        try {
            const token = await wecomClient.getAccessToken();
            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/customer/batchget?access_token=${token}`, {
                external_userid_list: [externalUserId]
            });
            return (response.data.errcode === 0 && response.data.customer_list?.length > 0) ? response.data.customer_list[0] : null;
        } catch (error) { return null; }
    },

    syncKfMessages: async (cursor, openKfId) => {
        try {
            const token = await wecomClient.getAccessToken();
            const response = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${token}`, {
                cursor: cursor || '', limit: 20, open_kfid: openKfId
            });
            return response.data.errcode === 0 ? response.data : null;
        } catch (error) { return null; }
    },

    getKfServicers: async (openKfId) => {
        try {
            const token = await wecomClient.getAccessToken();
            const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`);
            return response.data.errcode === 0 ? response.data.servicer_list : null;
        } catch (error) { return null; }
    },

    getKfAccounts: async () => {
        try {
            const token = await wecomClient.getAccessToken();
            const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/list?access_token=${token}`);
            return response.data.errcode === 0 ? response.data.account_list : null;
        } catch (error) { return null; }
    }
};

module.exports = wecomClient;
