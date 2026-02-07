const axios = require('axios');
async function run() {
    const corpId = 'wwcc13ff6e75e81173';
    const secret = 'DDL6MI_cm2XZVcXcV33i2RkjbBCFIWiY2g3jIDp7Tek';
    const openKfId = 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';
    const externalUserId = 'wmKkXdJgAAVx4N53nYCJE0Ebvcl3C25A';

    const tRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tRes.data.access_token;

    const op = async (url, data) => {
        const r = await axios.post(url + '?access_token=' + token, data);
        return r.data;
    };

    console.log("1. Current state:", await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/get', { open_kfid: openKfId, external_userid: externalUserId }));
    console.log("2. Trans QiXi:", await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans', { open_kfid: openKfId, external_userid: externalUserId, service_state: 2, servicer_userid: 'QiXi' }));
    console.log("3. Trans QIXI:", await op('https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans', { open_kfid: openKfId, external_userid: externalUserId, service_state: 2, servicer_userid: 'QIXI' }));
    console.log("4. List servicers:", (await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`)).data);
}
run();
