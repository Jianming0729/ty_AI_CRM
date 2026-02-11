// --- 🛰️ Architecture Circuit Breaker ---
require('./bootstrap')();

const axios = require('axios');

async function run() {
    try {
        console.log("🚀 Starting fix_snow with V3 Configuration...");

        const corpId = process.env.TONGYE_WEWORK_CORP_ID;
        const secret = process.env.TONGYE_WEWORK_SECRET;
        const openKfId = process.env.WECOM_OPEN_KF_ID;
        const targetUser = process.env.WECOM_EXTERNAL_USER_ID;

        if (!corpId || !secret || !openKfId || !targetUser) {
            throw new Error("Missing required environment variables for diagnosis.");
        }

        const tRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
        const token = tRes.data.access_token;

        const op = async (url, data) => {
            const r = await axios.post(url + '?access_token=' + token, data);
            return r.data;
        };

        console.log("1. Ending session...");
        await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans', { open_kfid: openKfId, external_userid: targetUser, service_state: 3 });

        console.log("2. Waiting 2 seconds...");
        await new Promise(r => setTimeout(r, 2000));

        console.log("3. Starting session (State 2)...");
        const trans = await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans', { open_kfid: openKfId, external_userid: targetUser, service_state: 2 });
        console.log("Trans Result:", JSON.stringify(trans));

        console.log("4. Sending message...");
        const send = await op('https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg', {
            touser: targetUser, open_kfid: openKfId, msgtype: 'text', text: { content: "Force Recovery Success!" }
        });
        console.log("Send Result:", JSON.stringify(send));
    } catch (e) {
        console.error(e.message);
    }
}
run();
