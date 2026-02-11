// --- 🛰️ Architecture Circuit Breaker ---
require('./bootstrap')();

const axios = require('axios');

async function run() {
    console.log("🚀 Starting inspect_sync with V3 Configuration...");

    const corpId = process.env.TONGYE_WEWORK_CORP_ID;
    const secret = process.env.TONGYE_WEWORK_SECRET;
    const openKfId = process.env.WECOM_OPEN_KF_ID;

    if (!corpId || !secret || !openKfId) {
        throw new Error("Missing required environment variables for inspection.");
    }

    const tRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tRes.data.access_token;

    let cursor = '';
    let hasMore = true;
    let lastData = null;

    while (hasMore) {
        const res = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${token}`, {
            cursor, limit: 10, open_kfid: openKfId
        });
        lastData = res.data;
        if (lastData.errcode !== 0) {
            console.error("Sync Error:", lastData);
            break;
        }
        cursor = lastData.next_cursor || '';
        hasMore = lastData.has_more === 1;
        if (!cursor) break;
    }
    console.log(JSON.stringify(lastData, null, 2));
}
run().catch(console.error);
