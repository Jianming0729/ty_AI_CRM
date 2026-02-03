/**
 * WeCom Bridge Local Test Script
 * 模拟企业微信向 Bridge 发送消息
 */
const axios = require('axios');
const { encrypt, getSignature } = require('@wecom/crypto');

const token = 'ty-secret-token';
const encodingAESKey = 'kEZGmw0Y626grksOAFX/qyOc35klBKFfyuIx/BkNNvI';
const corpId = 'ww-corp-id-placeholder';

async function test() {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = '123456';

    console.log('--- TEST 1: URL Verification (GET) ---');
    const plainEchoStr = 'hello_wecom';
    const encryptedEchoStr = encrypt(encodingAESKey, plainEchoStr, corpId); // returns string
    const getSignatureStr = getSignature(token, timestamp, nonce, encryptedEchoStr);
    try {
        const getRes = await axios.get(`http://localhost:3001/wechat`, {
            params: {
                msg_signature: getSignatureStr,
                timestamp,
                nonce,
                echostr: encryptedEchoStr
            }
        });
        console.log('Verification Response (should be hello_wecom):', getRes.data);
    } catch (err) {
        console.error('Verification Failed:', err.response ? err.response.data : err.message);
    }

    console.log('\n--- TEST 2: Incoming Message (POST) ---');
    const xmlMsg = `
    <xml>
        <ToUserName><![CDATA[toUser]]></ToUserName>
        <FromUserName><![CDATA[tester-001]]></FromUserName>
        <CreateTime>${timestamp}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[帮我查一下这台车的保养记录]]></Content>
        <MsgId>1234567890</MsgId>
        <AgentID>1</AgentID>
    </xml>`;

    const encryptMsg = encrypt(encodingAESKey, xmlMsg, corpId);
    const postSignatureStr = getSignature(token, timestamp, nonce, encryptMsg);

    const postXml = `
    <xml>
        <Encrypt><![CDATA[${encryptMsg}]]></Encrypt>
        <MsgSignature><![CDATA[${postSignatureStr}]]></MsgSignature>
        <TimeStamp>${timestamp}</TimeStamp>
        <Nonce><![CDATA[${nonce}]]></Nonce>
    </xml>`;

    try {
        const postRes = await axios.post(`http://localhost:3001/wechat?msg_signature=${postSignatureStr}&timestamp=${timestamp}&nonce=${nonce}`, postXml, {
            headers: { 'Content-Type': 'application/xml' }
        });
        console.log('Message Response Status:', postRes.status, postRes.data);
    } catch (err) {
        console.error('Message Delivery Failed:', err.response ? err.response.data : err.message);
    }
}

test();
