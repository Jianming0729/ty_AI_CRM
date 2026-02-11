// --- 🛰️ Architecture Circuit Breaker ---
require('./bootstrap')();

const axios = require('axios');

async function run() {
    console.log("🚀 Starting inspect_kf with V3 Configuration...");

    const corpId = process.env.TONGYE_WEWORK_CORP_ID;
    const secret = process.env.TONGYE_WEWORK_SECRET;
    const openKfId = process.env.WECOM_OPEN_KF_ID;

    if (!corpId || !secret || !openKfId) {
        throw new Error("Missing required environment variables for inspection.");
    }

    const tokenRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tokenRes.data.access_token;

    const listRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`);
    console.log('Servicer List:', JSON.stringify(listRes.data, null, 2));
}
run().catch(console.error);
