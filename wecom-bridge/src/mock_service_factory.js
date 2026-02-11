const logger = require('./logger');
const wecom = require('./wecom_client');
const chatwoot = require('./chatwoot_client');
const openclaw = require('./openclaw_client');

const isMock = process.env.MOCK_MODE === 'true';

/**
 * MockServiceFactory
 * 遵循 Phase 2 架构要求：在 mock_sandbox 环境下拦截所有外部调用
 */
const MockServiceFactory = {
    getWeComClient: () => {
        if (!isMock) return wecom;
        logger.warn('🛠️ [Mock-Service-Factory] Intercepting WeCom Client (MOCK_MODE=true)');
        return {
            ...wecom,
            getSuiteAccessToken: async () => 'mock_suite_token',
            getCorpAccessToken: async () => 'mock_corp_token',
            activateTenant: async (code) => {
                logger.info(`🚨 [MOCK-API] WeCom Activation intercepted for code: ${code}`);
                return { success: true, corpId: 'mock_corp_id' };
            },
            sendKfMessage: async (corpId, toUser, openKfId, content, msgCode) => {
                logger.info(`🚨 [MOCK-OUTBOUND] WeCom Send Message -> ${toUser}: "${content.substring(0, 50)}..."`);
                return { success: true, errcode: 0, errmsg: 'ok' };
            },
            getKfCustomer: async (corpId, userId) => {
                logger.info(`🚨 [MOCK-API] WeCom getKfCustomer for ${userId}`);
                return { nickname: 'Mock User', external_userid: userId, unionid: `union_${userId}` };
            },
            syncKfMessages: async () => {
                return { msg_list: [], next_cursor: 'mock_cursor' };
            },
            getKfAccounts: async () => [{ open_kfid: 'mock_kfid', name: 'Mock KF' }],
            getKfServicers: async () => []
        };
    },

    getChatwootClient: () => {
        if (!isMock) return chatwoot;
        logger.warn('🛠️ [Mock-Service-Factory] Intercepting Chatwoot Client (MOCK_MODE=true)');
        return {
            ...chatwoot,
            syncMessage: async (identity, content) => {
                logger.info(`🚨 [MOCK-OUTBOUND] Chatwoot Sync SUPPRESSED for content: "${content.substring(0, 30)}..."`);
                return 'mock_conversation_id';
            },
            syncResponse: async (convId, content) => {
                logger.info(`🚨 [MOCK-OUTBOUND] Chatwoot Response SUPPRESSED for Conv:${convId}`);
            },
            syncPrivateNote: async (convId, content) => {
                logger.info(`🚨 [MOCK-OUTBOUND] Chatwoot Private Note SUPPRESSED for Conv:${convId}`);
            }
        };
    },

    getOpenClawClient: () => {
        if (!isMock) return openclaw;
        logger.warn('🛠️ [Mock-Service-Factory] Intercepting OpenClaw Client (MOCK_MODE=true)');
        return {
            ...openclaw,
            sendToAgent: async (message, sessionId) => {
                logger.info(`🚨 [MOCK-API] OpenClaw Request intercepted: "${message}"`);
                return `[MOCK-RESPONSE] This is a sandbox response for: ${message}`;
            }
        };
    }
};

module.exports = MockServiceFactory;
