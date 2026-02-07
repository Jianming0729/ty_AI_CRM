require('dotenv').config();
const axios = require('axios');

async function test() {
    const corpId = process.env.TONGYE_WEWORK_CORP_ID;
    const secret = process.env.TONGYE_WEWORK_SECRET;
    console.log(`Testing with CorpId: ${corpId}, Secret: ${secret ? '***' : 'MISSING'}`);

    try {
        const response = await axios.get(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`);
        console.log('Response:', response.data);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
