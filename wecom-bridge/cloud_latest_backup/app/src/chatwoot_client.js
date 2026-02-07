const axios = require('axios');
const logger = require('./logger');
const identityService = require('./identity_service');

const baseUrl = (process.env.CHATWOOT_BASE_URL || '').trim();
const apiToken = (process.env.CHATWOOT_API_TOKEN || '').trim();
const accountId = (process.env.CHATWOOT_ACCOUNT_ID || '').trim();
const inboxId = parseInt((process.env.CHATWOOT_INBOX_ID || '0').trim());

const chatwootClient = {
    buildContactDisplayName: (handle, nickname) => {
        const label = nickname || 'Customer';
        return `${handle} | ${label}`;
    },

    syncMessage: async (identity, content, msgId, nickname = null) => {
        try {
            const { ty_uid: tyUid, handle, actor_type: actorType } = identity;
            const identifier = `ty:${tyUid}`;
            const headers = { 'api_access_token': apiToken, 'Content-Type': 'application/json' };
            const effectiveNickname = nickname || identity.nickname;

            let link = await identityService.getChatwootLink(tyUid, accountId, inboxId);
            let contactId = link ? link.chatwoot_contact_id : null;
            let conversationId = link ? link.last_conversation_id : null;

            const targetName = chatwootClient.buildContactDisplayName(handle, effectiveNickname);

            // 1. Resolve/Update Contact
            if (!contactId) {
                const searchRes = await axios.get(`${baseUrl}/api/v1/accounts/${accountId}/contacts/search`, { params: { q: identifier }, headers });
                contactId = (searchRes.data.payload?.find(c => c.identifier === identifier))?.id;
            }

            if (!contactId) {
                const createRes = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/contacts`, { inbox_id: inboxId, name: targetName, identifier }, { headers });
                contactId = (createRes.data.payload?.contact || createRes.data).id;
            } else {
                // 主动检查并更新昵称
                await axios.put(`${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}`, { name: targetName }, { headers }).catch(() => {});
            }

            // 2. Resolve Conversation
            if (!conversationId) {
                const createConvRes = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations`, { source_id: identifier, inbox_id: inboxId, contact_id: contactId }, { headers });
                conversationId = (createConvRes.data.payload || createConvRes.data).id;
            }

            // 3. Post Message
            await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, { content, message_type: 'incoming' }, { headers });

            await identityService.syncChatwootLink(tyUid, { account_id: accountId, inbox_id: inboxId, contact_id: contactId, conversation_id: conversationId });
            return conversationId;
        } catch (error) {
            logger.error(`[Chatwoot] Sync failed: ${error.message}`);
            return null;
        }
    },

    syncResponse: async (conversationId, content) => {
        try {
            const headers = { 'api_access_token': apiToken, 'Content-Type': 'application/json' };
            await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, { content, message_type: 'outgoing' }, { headers });
        } catch (error) {
            logger.error(`[Chatwoot] Response failed: ${error.message}`);
        }
    },

    syncPrivateNote: async (conversationId, content) => {
        try {
            const headers = { 'api_access_token': apiToken, 'Content-Type': 'application/json' };
            await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, { content, message_type: 'outgoing', private: true }, { headers });
        } catch (error) {
            logger.error(`[Chatwoot] Note failed: ${error.message}`);
        }
    }
};

module.exports = chatwootClient;
