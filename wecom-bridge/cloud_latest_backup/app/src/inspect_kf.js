const axios = require('axios');
async function run() {
    const corpId = 'wwcc13ff6e75e81173';
    const secret = 'DDL6MI_cm2XZVcXcV33i2RkjbBCFIWiY2g3jIDp7Tek';
    const openKfId = 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';
    
    const tokenRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tokenRes.data.access_token;
    
    const listRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`);
    console.log('Servicer List:', JSON.stringify(listRes.data, null, 2));
}
run();
