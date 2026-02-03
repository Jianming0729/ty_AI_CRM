const { decrypt, encrypt, getSignature } = require('@wecom/crypto');
const xml2js = require('xml2js');

const token = process.env.WECOM_TOKEN;
const encodingAESKey = process.env.WECOM_AES_KEY;
const corpId = process.env.WECOM_CORP_ID;

module.exports = {
    /**
     * 验证回调 URL
     */
    verifyURL: (signature, timestamp, nonce, echoStr) => {
        const expectedSignature = getSignature(token, timestamp, nonce, echoStr);
        console.log(`[Crypto] Token: ${token}, Timestamp: ${timestamp}, Nonce: ${nonce}`);
        console.log(`[Crypto] EncMsg (first 10): ${echoStr.substring(0, 10)}`);
        console.log(`[Crypto] Signature: ${signature} vs Expected: ${expectedSignature}`);
        if (signature !== expectedSignature) {
            throw new Error('Invalid signature');
        }
        const { message, id } = decrypt(encodingAESKey, echoStr);
        console.log(`[Crypto] Decrypted ID: ${id}`);
        return message;
    },

    /**
     * 解密消息内容
     */
    decryptMsg: async (signature, timestamp, nonce, xmlData) => {
        console.log('[Crypto] decryptMsg called');
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(xmlData);
        if (!result || !result.xml) {
            console.error('[Crypto] Invalid XML structure:', result);
            throw new Error('Invalid XML structure');
        }
        const encryptMsg = result.xml.Encrypt;
        console.log('[Crypto] EncryptMsg found:', !!encryptMsg);

        const expectedSignature = getSignature(token, timestamp, nonce, encryptMsg);
        if (signature !== expectedSignature) {
            console.error(`[Crypto] Signature mismatch. Got: ${signature}, Expected: ${expectedSignature}`);
            throw new Error('Invalid signature');
        }

        const { message } = decrypt(encodingAESKey, encryptMsg);
        if (!message) {
            console.error('[Crypto] Decryption failed, message is empty');
            throw new Error('Decryption failed');
        }
        console.log('[Crypto] Decryption success, parsing interior XML');
        return parser.parseStringPromise(message.toString());
    },

    /**
     * 加密回复消息 (被动回复)
     */
    encryptMsg: (replyText, fromUser, toUser) => {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = Math.random().toString(36).substring(2, 15);

        const xmlContent = `
        <xml>
            <ToUserName><![CDATA[${toUser}]]></ToUserName>
            <FromUserName><![CDATA[${fromUser}]]></FromUserName>
            <CreateTime>${timestamp}</CreateTime>
            <MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[${replyText}]]></Content>
        </xml>`;

        const encryptMsg = encrypt(encodingAESKey, xmlContent, corpId);
        const signature = getSignature(token, timestamp, nonce, encryptMsg);

        return `
        <xml>
            <Encrypt><![CDATA[${encryptMsg}]]></Encrypt>
            <MsgSignature><![CDATA[${signature}]]></MsgSignature>
            <TimeStamp>${timestamp}</TimeStamp>
            <Nonce><![CDATA[${nonce}]]></Nonce>
        </xml>`;
    }
};
