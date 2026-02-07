const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function check() {
    require('dotenv').config({ path: path.join(__dirname, '../.env') });
    const profile = process.env.PROFILE || 'prod_global';
    const profilePath = path.join(__dirname, `../config/profiles/${profile}.env`);
    if (fs.existsSync(profilePath)) {
        const config = require('dotenv').parse(fs.readFileSync(profilePath));
        for (const k in config) process.env[k] = config[k];
    }

    const corpId = process.env.TONGYE_WEWORK_CORP_ID;
    const secret = process.env.TONGYE_WEWORK_SECRET;
    const openKfId = process.env.WECOM_OPEN_KF_ID || 'wkKkXdJgAADYkAWa75OYqvUij1lGvpyg';

    const tRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
    const token = tRes.data.access_token;

    console.log("--- Servicer List for " + openKfId + " ---");
    const srvRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${token}&open_kfid=${openKfId}`);
    console.log(JSON.stringify(srvRes.data, null, 2));

    console.log("\n--- KF Account List ---");
    const accRes = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/list?access_token=${token}`);
    console.log(JSON.stringify(accRes.data, null, 2));
}

check().catch(console.error);
