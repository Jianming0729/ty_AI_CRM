/**
 * 🛰️ Tongye AI CRM: Chatwoot Contact Display Name Migration Script
 * 任务：扫描 Chatwoot 中所有联系人，将符合 "Handle | Contact" 模式的历史记录
 * 修正为最新的治理标准，尝试保留有效昵称。
 */

const axios = require('axios');
require('dotenv').config();

const baseUrl = (process.env.CHATWOOT_BASE_URL || '').trim();
const apiToken = (process.env.CHATWOOT_API_TOKEN || '').trim();
const accountId = (process.env.CHATWOOT_ACCOUNT_ID || '').trim();

if (!baseUrl || !apiToken || !accountId) {
    console.error('❌ 配置缺失，请确保 .env 中包含 CHATWOOT_BASE_URL, CHATWOOT_API_TOKEN, CHATWOOT_ACCOUNT_ID');
    process.exit(1);
}

const headers = {
    'api_access_token': apiToken,
    'Content-Type': 'application/json'
};

/**
 * 核心格式校验与昵称合并逻辑 (V3.0 标准)
 */
function buildTargetName(currentName, handle, metadataNickname = null) {
    const normalize = (s) => (typeof s === 'string' ? s.trim() : '');

    // 解析现有 Label
    let existingLabel = '';
    if (currentName && currentName.includes('|')) {
        existingLabel = normalize(currentName.split('|')[1]);
    } else {
        existingLabel = normalize(currentName);
    }

    // 过滤掉无效 Label
    if (existingLabel === 'Contact' || existingLabel === handle) {
        existingLabel = '';
    }

    // 优先级：Metadata 记录的昵称 > 现有 Label > "Contact"
    const label = normalize(metadataNickname) || existingLabel || "Contact";

    return `${handle} | ${label}`;
}

async function migrate() {
    console.log('🚀 开始扫描 Chatwoot 联系人，执行显示名治理修复...');
    let page = 1;
    let totalUpdated = 0;
    let totalScanned = 0;

    while (true) {
        try {
            console.log(`[Scan] 正在读取第 ${page} 页...`);
            const response = await axios.get(`${baseUrl}/api/v1/accounts/${accountId}/contacts`, {
                params: { page },
                headers
            });

            const contacts = response.data.payload || [];
            if (contacts.length === 0) break;

            for (const contact of contacts) {
                totalScanned++;
                const { id, name, custom_attributes, identifier } = contact;
                const handle = custom_attributes?.handle;
                const tyUid = custom_attributes?.ty_uid;

                // 仅处理属于 Tongye 体系 (有 handle) 的联系人
                if (!handle || !identifier || !identifier.startsWith('ty:')) continue;

                // 计算目标名称
                const targetName = buildTargetName(name, handle);

                if (name !== targetName) {
                    process.stdout.write(`[Fix] #${id}: "${name}" -> "${targetName}"... `);
                    try {
                        await axios.put(`${baseUrl}/api/v1/accounts/${accountId}/contacts/${id}`, {
                            name: targetName
                        }, { headers, timeout: 3000 });
                        console.log('✅ 成功');
                        totalUpdated++;
                    } catch (err) {
                        console.log(`❌ 失败: ${err.message}`);
                    }
                }
            }

            page++;
            // 避免请求过快被限流
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`[Error] 遍历中断: ${error.message}`);
            break;
        }
    }

    console.log('\n✨ 治理修复完成!');
    console.log(`- 扫描总数: ${totalScanned}`);
    console.log(`- 已修正数: ${totalUpdated}`);
}

migrate();
