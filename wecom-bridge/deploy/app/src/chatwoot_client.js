const axios = require('axios');
const dedup = require('./dedup_store');

const baseUrl = (process.env.CHATWOOT_BASE_URL || '').trim();
const apiToken = (process.env.CHATWOOT_API_TOKEN || '').trim();
const accountId = (process.env.CHATWOOT_ACCOUNT_ID || '').trim();
const inboxId = parseInt((process.env.CHATWOOT_INBOX_ID || '0').trim());

const identityService = require('./identity_service');

/**
 * Chatwoot API Client - Phase 2 Identity-Linked Version
 */
const chatwootClient = {
    syncMessage: async (identity, content, msgId) => {
        try {
            const { ty_uid: tyUid, handle, actor_type: actorType } = identity;
            const identifier = `ty:${tyUid}`;
            console.log(`[Chatwoot] Start Sync: ${identifier} (Handle: ${handle}) | msgId: ${msgId}`);

            const headers = {
                'api_access_token': apiToken,
                'Content-Type': 'application/json'
            };

            // 0. Check Local Cache (DB chatwoot_links)
            let link = await identityService.getChatwootLink(tyUid, accountId, inboxId);
            let contactId = link ? link.chatwoot_contact_id : null;
            let conversationId = link ? link.last_conversation_id : null;

            // 1. Resolve Contact (if not in link or if we want to verify)
            let contact = null;
            if (!contactId) {
                const searchUrl = `${baseUrl}/api/v1/accounts/${accountId}/contacts/search`;
                console.log(`[Chatwoot] Contact Resolution: Searching for ${identifier}`);
                const searchResponse = await axios.get(searchUrl, {
                    params: { q: identifier },
                    headers: headers,
                    timeout: 5000
                });

                const contacts = searchResponse.data.payload || [];
                contact = contacts.find(c => c.identifier === identifier);

                if (!contact) {
                    console.log(`[Chatwoot] Creating new contact for ${identifier}`);
                    const contactData = {
                        inbox_id: inboxId,
                        name: `${handle} | ${identity.nickname || 'Contact'}`,
                        identifier: identifier,
                        custom_attributes: {
                            ty_uid: tyUid,
                            handle: handle,
                            actor_type: actorType
                        }
                    };
                    const createContactResponse = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/contacts`, contactData, { headers, timeout: 5000 });
                    contact = createContactResponse.data.payload ? createContactResponse.data.payload.contact : createContactResponse.data;
                }
                if (contact && contact.id) contactId = contact.id;
            }

            // 1.1 UI 固化校验：强制同步 Handle 到联系人姓名 (治理方案要求)
            if (contactId) {
                const targetName = `${handle} | ${identity.nickname || 'Contact'}`;
                // 只有在缓存中没有 contact 对象，或者名字没对齐时才请求更新 (减少 API 调用)
                if (!contact || contact.name !== targetName) {
                    console.log(`[Chatwoot] UI Alignment: Ensuring contact ${contactId} name is "${targetName}"`);
                    await axios.put(`${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}`, {
                        name: targetName,
                        custom_attributes: {
                            ty_uid: tyUid,
                            handle: handle,
                            actor_type: actorType
                        }
                    }, { headers, timeout: 3000 }).catch(err => console.warn(`[SyncGap] Failed to align UI name: ${err.message}`));
                }
            }

            if (!contactId) {
                throw new Error(`Failed to resolve contact for ${identifier}`);
            }

            // 2. Resolve Conversation
            let isConvValid = false;
            if (conversationId) {
                try {
                    const convDetailUrl = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}`;
                    const convDetail = await axios.get(convDetailUrl, { headers, timeout: 3000 });
                    const status = convDetail.data.status;
                    if (status !== 'resolved') isConvValid = true;
                } catch (e) {
                    console.log(`[Chatwoot] Existing conv ${conversationId} invalid or not found.`);
                }
            }

            if (!isConvValid) {
                console.log(`[Chatwoot] Resolving active conversation for contact ${contactId}`);
                const convsUrl = `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`;
                const convsResponse = await axios.get(convsUrl, { headers, timeout: 5000 });

                const convs = convsResponse.data.payload || convsResponse.data || [];
                let conversation = Array.isArray(convs) ? convs.find(c => c.status !== 'resolved' && c.inbox_id === inboxId) : null;

                if (!conversation) {
                    console.log(`[Chatwoot] Creating new conversation for contact ${contactId}`);
                    const createConvResponse = await axios.post(`${baseUrl}/api/v1/accounts/${accountId}/conversations`, {
                        source_id: identifier,
                        inbox_id: inboxId,
                        contact_id: contactId
                    }, { headers, timeout: 5000 });
                    conversation = createConvResponse.data.payload || createConvResponse.data;
                }

                if (conversation && conversation.id) conversationId = conversation.id;
            }

            if (!conversationId) {
                throw new Error(`Failed to resolve conversation for ${identifier}`);
            }

            // 3. Persist/Update Link in DB
            await identityService.syncChatwootLink(tyUid, {
                account_id: accountId,
                inbox_id: inboxId,
                contact_id: contactId,
                conversation_id: conversationId
            }).catch(e => console.warn(`[Identity] Failed to sync Chatwoot link: ${e.message}`));

            // 4. Post Identity Mapping Note (Governance Requirement)
            if (!link || link.conversation_id !== conversationId) {
                await chatwootClient.syncPrivateNote(conversationId, `[Identity Linked]\nhandle=${handle}\nty_uid=${tyUid}\nactor_type=${actorType}`).catch(() => { });
            }

            // 5. Post Message
            const msgUrl = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;
            const msgResponse = await axios.post(msgUrl, {
                content: content,
                message_type: 'incoming',
                private: false
            }, { headers, timeout: 5000 });

            const createdMsg = msgResponse.data.payload || msgResponse.data;
            if (createdMsg && createdMsg.id) {
                dedup.markOutboundProcessed(createdMsg.id);
            }

            return conversationId;

        } catch (error) {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`[Chatwoot] SYNC FAILED: ${errorMsg}`);
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
