const axios = require('axios');
async function run() {
    try {
        const corpId = 'wwcc13ff6e75e81173';
        const secret = 'DDL6MI_cm2XZVcXcV33i2RkjbBCFIWiY2g3jIDp7Tek';
        const openKfId = 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';
        const targetUser = 'wmKkXdJgAAVx4N53nYCJE0Ebvcl3C25A';

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

        console.log("3. Starting session with QiXi...");
        const trans = await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans', { open_kfid: openKfId, external_userid: targetUser, service_state: 2, servicer_userid: 'QiXi' });
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
