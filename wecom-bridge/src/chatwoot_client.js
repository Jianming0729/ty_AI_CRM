const axios = require('axios');
const dedup = require('./dedup_store');

const baseUrl = (process.env.CHATWOOT_BASE_URL || '').trim();
const apiToken = (process.env.CHATWOOT_API_TOKEN || '').trim();
const accountId = (process.env.CHATWOOT_ACCOUNT_ID || '').trim();
const inboxId = parseInt((process.env.CHATWOOT_INBOX_ID || '0').trim());

/**
 * Chatwoot API Client - Phase 0 Robust Version
 */
const chatwootClient = {
    syncMessage: async (fromUser, content, msgId) => {
        try {
            console.log(`[Chatwoot] Start Sync: ${fromUser} | Conv: http://172.17.0.1:3005`);

            const headers = {
                'api_access_token': apiToken,
                'Content-Type': 'application/json'
            };

            // 1. Search Contact
            const searchUrl = `${baseUrl}/api/v1/accounts/${accountId}/contacts/search`;
            console.log(`[Chatwoot] Step 1: Searching contact at ${searchUrl}`);
            const searchResponse = await axios.get(searchUrl, {
                params: { q: fromUser },
                headers: headers,
                timeout: 5000
            });

            // Extract contact
            const contacts = searchResponse.data.payload || [];
            let contact = contacts.find(c => c.identifier === fromUser);

            if (!contact) {
                console.log(`[Chatwoot] Step 1.5: Creating contact ${fromUser}`);
                const createContactResponse = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/contacts`, {
                    inbox_id: inboxId,
                    name: fromUser,
                    identifier: fromUser
                }, { headers, timeout: 5000 });
                contact = createContactResponse.data.payload ? createContactResponse.data.payload.contact : createContactResponse.data;
            }

            if (!contact || !contact.id) {
                throw new Error(`Failed to resolve contact: ${JSON.stringify(contact)}`);
            }

            // 2. Find Conversation
            const convsUrl = `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contact.id}/conversations`;
            console.log(`[Chatwoot] Step 2: Fetching conversations from ${convsUrl}`);
            const convsResponse = await axios.get(convsUrl, { headers, timeout: 5000 });

            const convs = convsResponse.data.payload || convsResponse.data || [];
            let conversation = Array.isArray(convs) ? convs.find(c => c.status !== 'resolved' && c.inbox_id === inboxId) : null;

            if (!conversation) {
                console.log(`[Chatwoot] Step 2.5: Creating new conversation for contact ${contact.id}`);
                const createConvResponse = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations`, {
                    source_id: fromUser, // 使用持久的 UserID 而不是动态的 MsgId
                    inbox_id: inboxId,
                    contact_id: contact.id
                }, { headers, timeout: 5000 });
                conversation = createConvResponse.data.payload || createConvResponse.data;
            }

            if (!conversation || !conversation.id) {
                throw new Error(`Failed to resolve conversation: ${JSON.stringify(conversation)}`);
            }

            // 3. Post Message
            const msgUrl = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversation.id}/messages`;
            console.log(`[Chatwoot] Step 3: Posting message to #${conversation.id}`);
            const msgResponse = await axios.post(msgUrl, {
                content: content,
                message_type: 'incoming',
                private: false
            }, { headers, timeout: 5000 });

            const createdMsg = msgResponse.data.payload || msgResponse.data;
            if (createdMsg && createdMsg.id) {
                dedup.markOutboundProcessed(createdMsg.id);
            }

            console.log(`[Chatwoot] SYNC COMPLETE -> ID: ${conversation.id}`);
            return conversation.id;

        } catch (error) {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`[Chatwoot] CRITICAL SYNC ERROR: ${errorMsg}`);
            return null;
        }
    },

    syncResponse: async (conversationId, content) => {
        if (!conversationId) return;
        try {
            const headers = {
                'api_access_token': apiToken,
                'Content-Type': 'application/json'
            };
            const response = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
                content: content,
                message_type: 'outgoing',
                private: false
            }, { headers, timeout: 5000 });

            const createdMsg = response.data.payload || response.data;
            if (createdMsg && createdMsg.id) {
                dedup.markOutboundProcessed(createdMsg.id);
            }

            console.log(`[Chatwoot] UI SYNC: Response posted to Conv #${conversationId}`);
        } catch (error) {
            console.error(`[Chatwoot] UI SYNC ERROR: ${error.message}`);
        }
    },

    /**
     * 同步 AI 建议到 Chatwoot (作为私有便笺)
     */
    syncPrivateNote: async (conversationId, content) => {
        if (!conversationId) return;
        try {
            const headers = {
                'api_access_token': apiToken,
                'Content-Type': 'application/json'
            };
            await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
                content: `【AI 建议】${content}`,
                message_type: 'outgoing',
                private: true // 私有便笺，仅客服可见
            }, { headers, timeout: 5000 });
            console.log(`[Chatwoot] Private note synced to Conv #${conversationId}`);
        } catch (error) {
            console.error(`[Chatwoot] Private note sync failed: ${error.message}`);
        }
    }
};

module.exports = chatwootClient;
