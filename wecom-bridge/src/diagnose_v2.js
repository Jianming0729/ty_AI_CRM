// --- 🛰️ Architecture Circuit Breaker ---
require('./bootstrap')();

const axios = require('axios');

async function run() {
    console.log("🚀 Starting diagnose_v2 with V3 Configuration...");

    const corpId = process.env.TONGYE_WEWORK_CORP_ID;
    const secret = process.env.TONGYE_WEWORK_SECRET;
    const openKfId = process.env.WECOM_OPEN_KF_ID;
    const externalUserId = process.env.WECOM_EXTERNAL_USER_ID;

    if (!corpId || !secret || !openKfId || !externalUserId) {
        throw new Error("Missing required environment variables for diagnosis.");
    }

    const tRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tRes.data.access_token;

    const op = async (url, data) => {
        const r = await axios.post(url + '?access_token=' + token, data);
        return r.data;
    };

    console.log("1. Current state:", await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/get', { open_kfid: openKfId, external_userid: externalUserId }));
    console.log("2. List servicers:", (await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`)).data);
}

run().catch(console.error);
