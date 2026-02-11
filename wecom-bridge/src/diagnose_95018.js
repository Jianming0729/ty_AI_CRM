// --- 🛰️ Architecture Circuit Breaker ---
require('./bootstrap')();

const axios = require('axios');

async function run() {
    console.log("🚀 Starting diagnose_95018 with V3 Configuration...");

    const corpId = process.env.TONGYE_WEWORK_CORP_ID;
    const secret = process.env.TONGYE_WEWORK_SECRET;
    const openKfId = process.env.WECOM_OPEN_KF_ID;
    const externalUserId = process.env.WECOM_EXTERNAL_USER_ID;

    if (!corpId || !secret || !openKfId || !externalUserId) {
        throw new Error("Missing required environment variables for diagnosis.");
    }

    const tRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tRes.data.access_token;

    console.log("--- Checking Current State ---");
    const stateRes = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/get?access_token=${token}`, {
        open_kfid: openKfId, external_userid: externalUserId
    });
    console.log("Current State:", JSON.stringify(stateRes.data));

    const trySend = async (label) => {
        console.log(`\n--- Attempting Send (${label}) ---`);
        const sendRes = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${token}`, {
            touser: externalUserId, open_kfid: openKfId, msgtype: 'text', text: { content: `Diagnostic Test: ${label}` }
        });
        console.log("Result:", JSON.stringify(sendRes.data));
        return sendRes.data.errcode === 0;
    };

    await trySend("Start Diagnostic");

    console.log("\n--- Step 1: Force Transition to State 2 ---");
    const trans1 = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans?access_token=${token}`, {
        open_kfid: openKfId, external_userid: externalUserId, service_state: 2
    });
    console.log("Trans 1 (to 2):", JSON.stringify(trans1.data));
    await trySend("After State=2");

    console.log("\n--- Step 2: Try to get state again ---");
    const stateRes2 = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/get?access_token=${token}`, {
        open_kfid: openKfId, external_userid: externalUserId
    });
    console.log("State Now:", JSON.stringify(stateRes2.data));

    console.log("\n--- Step 3: Transition to State 3 (Finish) ---");
    const trans2 = await axios.post(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans?access_token=${token}`, {
        open_kfid: openKfId, external_userid: externalUserId, service_state: 3
    });
    console.log("Trans 2 (to 3):", JSON.stringify(trans2.data));
}

run().catch(console.error);
