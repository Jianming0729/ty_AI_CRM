const axios = require('axios');
async function run() {
    const corpId = 'wwcc13ff6e75e81173';
    const secret = 'DDL6MI_cm2XZVcXcV33i2RkjbBCFIWiY2g3jIDp7Tek';
    const openKfId = 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';

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
        cursor = lastData.next_cursor;
        hasMore = lastData.has_more === 1;
    }
    console.log(JSON.stringify(lastData, null, 2));
}
run();
