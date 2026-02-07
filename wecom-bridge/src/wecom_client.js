const axios = require('axios');

const corpId = process.env.TONGYE_WEWORK_CORP_ID;
const secret = process.env.TONGYE_WEWORK_SECRET;
const agentId = process.env.TONGYE_WEWORK_AGENT_ID;

let cachedToken = null;
let tokenExpiry = 0;

/**
 * 企业微信主动推送客户端
 */
const wecomClient = {
    /**
     * 获取 Access Token (带缓存)
     */
    getAccessToken: async () => {
        const now = Date.now();
        if (cachedToken && now < tokenExpiry) {
            return cachedToken;
        }

        console.log('[WeCom] Refreshing access token...');
        const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);

        if (response.data.errcode !== 0) {
            throw new Error(`Failed to get WeCom token: ${response.data.errmsg}`);
        }

        cachedToken = response.data.access_token;
        // 提前 5 分钟过期
        tokenExpiry = now + (response.data.expires_in - 300) * 1000;
        return cachedToken;
    },

    /**
     * 发送文本消息
     * @param {string} toUser 企微 UserID
     * @param {string} content 消息内容
     */
    sendTextMessage: async (toUser, content) => {
        try {
            const token = await wecomClient.getAccessToken();
            const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;

            const payload = {
                touser: toUser,
                msgtype: 'text',
                agentid: agentId,
                text: { content: content },
                safe: 0
            };

            const response = await axios.post(url, payload);
            if (response.data.errcode === 0) {
                console.log(`[WeCom] Message sent to ${toUser} success`);
                return true;
            } else {
                console.error(`[WeCom] Message sent to ${toUser} failed:`, response.data.errmsg);
                return false;
            }
        } catch (error) {
            console.error(`[WeCom] API Error:`, error.message);
            return false;
        }
    },

    /**
     * 同步微信客服消息
     */
    syncKfMessages: async (cursor, openKfId) => {
        try {
            const token = await wecomClient.getAccessToken();
            const url = `https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${token}`;
            const payload = {
                cursor: cursor || '',
                limit: 20,
                open_kfid: openKfId
            };
            const response = await axios.post(url, payload);
            if (response.data.errcode === 0) {
                return response.data;
            }
            console.error(`[WeCom-KF] Sync Msg failed: ${response.data.errmsg}`);
            return null;
        } catch (error) {
            console.error(`[WeCom-KF] Sync Msg Error:`, error.message);
            return null;
        }
    },

    /**
     * 发送客服文本消息
     */
    sendKfMessage: async (toUser, openKfId, content) => {
        try {
            const token = await wecomClient.getAccessToken();
            const url = `https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`;

            // Helper function to deliver the message
            const deliver = async (currentMsgCode, attemptType) => {
                const payload = {
                    touser: toUser,
                    open_kfid: openKfId,
                    msgtype: 'text',
                    text: { content: content }
                };
                if (currentMsgCode) {
                    payload.msgid = currentMsgCode;
                }

                const response = await axios.post(url, payload);
                console.log(`[WeCom-KF] Message sent to ${toUser} (${attemptType}) with msgid ${currentMsgCode || 'N/A'}: ${response.data.errcode} - ${response.data.errmsg}`);
                return response.data;
            };

            // Placeholder for logger and FALLBACK_CONFIG if not defined elsewhere
            const logger = console; // Using console as a fallback for logger
            const FALLBACK_CONFIG = { COOLDOWN_MS: 1000 }; // Example cooldown

            // 1. 尝试发送
            let activeMsgCode = msgCode || (cached?.msgCode);
            let result = await deliver(activeMsgCode, 'primary');

            // 2. 自愈策略：针对 95018 (状态错误)
            if (result.errcode === 95018 || result.errcode === 95016) {
                logger.warn(`[HF-Retry] Trace: ${traceId} | 95018 Detected. Reseting to State 1 (Waiting)...`);

                // Placeholder for transKfServiceState if not defined elsewhere
                if (!wecomClient.transKfServiceState) {
                    wecomClient.transKfServiceState = async (kfid, user, state, servicer) => {
                        console.warn(`[WeCom-KF] transKfServiceState not implemented. Called with: ${kfid}, ${user}, ${state}, ${servicer}`);
                        return true; // Assume success for placeholder
                    };
                }

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
                // 适用于接待员处于不可用状态导致 session 强一致校验失败的情况
                if (result.errcode === 95018 || result.errcode === 95016) {
                    logger.warn(`[HF-Retry] Trace: ${traceId} | Fallback failed with ${result.errcode}. Attempting Blind-Send (No MsgCode)...`);
                    result = await deliver(null, 'blind-send');
                }
            }

            if (result.errcode === 0) {
                console.log(`[WeCom-KF] Message sent to ${toUser} success`);
                return { success: true };
            } else {
                console.error(`[WeCom-KF] Message sent to ${toUser} failed: ${result.errcode} - ${result.errmsg}`);
                return {
                    success: false,
                    errcode: result.errcode,
                    errmsg: result.errmsg
                };
            }
        } catch (error) {
            console.error(`[WeCom-KF] KF Send Error:`, error.message);
            return { success: false, errcode: -1, errmsg: error.message };
        }
    },

    /**
     * 获取外部联系人详情 (客户)
     */
    getExternalContact: async (externalUserId) => {
        try {
            const token = await wecomClient.getAccessToken();
            const url = `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/get?access_token=${token}&external_userid=${externalUserId}`;
            const response = await axios.get(url);
            if (response.data.errcode === 0) {
                return response.data.external_contact;
            }
            console.warn(`[WeCom] Get External Contact failed: ${response.data.errmsg}`);
            return null;
        } catch (error) {
            console.error(`[WeCom] Get External Contact Error:`, error.message);
            return null;
        }
    },

    /**
     * 获取内部成员详情
     */
    getUser: async (userId) => {
        try {
            const token = await wecomClient.getAccessToken();
            const url = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${token}&userid=${userId}`;
            const response = await axios.get(url);
            if (response.data.errcode === 0) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error(`[WeCom] Get User Error:`, error.message);
            return null;
        }
    }
};

module.exports = wecomClient;
