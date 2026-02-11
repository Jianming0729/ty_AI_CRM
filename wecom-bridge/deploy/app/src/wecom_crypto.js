const { decrypt, encrypt, getSignature } = require('@wecom/crypto');
const xml2js = require('xml2js');
const logger = require('./logger');

// Centralized Config (Loaded from env)
let WECOM_CONFIG = {
    token: process.env.WECOM_TOKEN,
    aesKey: process.env.WECOM_AES_KEY,
    suiteId: process.env.WECOM_SUITE_ID,
    corpId: process.env.WECOM_CORP_ID
};

// Fix AES Key padding if necessary
if (WECOM_CONFIG.aesKey && WECOM_CONFIG.aesKey.length === 43) {
    WECOM_CONFIG.aesKey += '=';
    logger.info('[Crypto] Auto-appended padding to WECOM_AES_KEY.');
}

module.exports = {
    verifyURL: (signature, timestamp, nonce, echoStr) => {
        const expectedSignature = getSignature(WECOM_CONFIG.token, timestamp, nonce, echoStr);
        if (signature !== expectedSignature) {
            logger.error(`[Crypto] Signature mismatch. Expected: ${expectedSignature}, Got: ${signature}`);
            throw new Error('Invalid signature');
        }
        try {
            const { message } = decrypt(WECOM_CONFIG.aesKey, echoStr, WECOM_CONFIG.suiteId);
            return message;
        } catch (e) {
            const { message } = decrypt(WECOM_CONFIG.aesKey, echoStr);
            return message;
        }
    },

    decryptMsg: async (signature, timestamp, nonce, xmlData) => {
        if (!xmlData || (typeof xmlData !== 'string' && !Buffer.isBuffer(xmlData))) {
            throw new Error(`Invalid XML data type: ${typeof xmlData}`);
        }
        const cleanXml = xmlData.toString().trim().replace(/^\uFEFF/, '');

        const encryptMatch = cleanXml.match(/<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/i)
            || cleanXml.match(/<Encrypt>([\s\S]*?)<\/Encrypt>/i);

        if (!encryptMatch) {
            throw new Error('Could not find <Encrypt> tag in XML');
        }

        const encryptMsg = encryptMatch[1].replace(/\s/g, '');

        const expectedSignature = getSignature(WECOM_CONFIG.token, timestamp, nonce, encryptMsg);
        if (signature !== expectedSignature) {
            logger.error(`[Crypto] Msg Signature mismatch. Expected: ${expectedSignature}, Got: ${signature}`);
            throw new Error('Invalid signature');
        }

        const idsToTry = [WECOM_CONFIG.suiteId, WECOM_CONFIG.corpId, null];
        let decrypted = null;
        let lastError = null;

        for (const tid of idsToTry) {
            try {
                const res = decrypt(WECOM_CONFIG.aesKey, encryptMsg, tid);
                if (res.message && res.message.toString().trim().startsWith('<')) {
                    decrypted = res;
                    logger.info(`[Crypto] Decrypt SUCCESS with targetId: ${tid}. Resolved ID: ${res.id}`);
                    break;
                }
            } catch (e) {
                lastError = e;
            }
        }

        if (!decrypted) {
            logger.error(`[Crypto] Decryption failed all modes. Last error: ${lastError ? lastError.message : 'Unknown'}`);
            throw new Error('Decryption failed to produce valid XML');
        }

        const msgStr = decrypted.message.toString();
        const parser = new xml2js.Parser({ explicitArray: false });
        try {
            return await parser.parseStringPromise(msgStr);
        } catch (xmlErr) {
            logger.error(`[Crypto] Decrypt output is not valid XML. Content: ${msgStr.substring(0, 100)}`);
            throw xmlErr;
        }
    },

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
        const encryptMsg = encrypt(WECOM_CONFIG.aesKey, xmlContent, WECOM_CONFIG.corpId);
        const signature = getSignature(WECOM_CONFIG.token, timestamp, nonce, encryptMsg);
        return `
        <xml>
            <Encrypt><![CDATA[${encryptMsg}]]></Encrypt>
            <MsgSignature><![CDATA[${signature}]]></MsgSignature>
            <TimeStamp>${timestamp}</TimeStamp>
            <Nonce><![CDATA[${nonce}]]></Nonce>
        </xml>`;
    }
};
