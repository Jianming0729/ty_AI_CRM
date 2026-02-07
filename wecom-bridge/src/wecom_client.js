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
        const token = await wecomClient.getAccessToken();

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
