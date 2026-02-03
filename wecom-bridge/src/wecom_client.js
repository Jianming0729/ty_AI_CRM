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
    }
};

module.exports = wecomClient;
