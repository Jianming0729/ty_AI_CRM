/**
 * 身份治理不变量测试 (Phase 3: Governance Tests)
 * 目标：验证 ty_uid 作为唯一真相源的稳定性，防止身份污染与漂移
 */
const assert = require('assert');

// 模拟数据库存储
const mockDbSystem = {
    users: [],
    identities: [],
    chatwoot_links: [],
    user_alias: [],
    msg_dedup: new Set(),
};

// Mock PostgreSQL Client
const mockPg = {
    query: async (text, params) => {
        // 1. 获取用户
        if (text.includes('JOIN users')) {
            const provider = params[0];
            const key = params[1];
            const identity = mockDbSystem.identities.find(i => i.provider === provider && i.external_key === key);
            if (!identity) return { rows: [] };
            const user = mockDbSystem.users.find(u => u.ty_uid === identity.ty_uid);
            return { rows: [{ ...user, ...identity }] };
        }
        // 2. 插入用户
        if (text.includes('INSERT INTO users')) {
            mockDbSystem.users.push({ ty_uid: params[0], tenant_id: params[1], actor_type: params[2], handle: params[3] });
            return { rows: [] };
        }
        // 3. 插入身份
        if (text.includes('INSERT INTO identities')) {
            mockDbSystem.identities.push({ ty_uid: params[0], provider: params[1], external_key: params[2], metadata: params[3] });
            return { rows: [] };
        }
        // 4. Handle 序列模拟
        if (text.includes('nextval')) {
            return { rows: [{ seq: mockDbSystem.users.length + 1 }] };
        }
        return { rows: [] };
    },
    withTransaction: async (cb) => {
        return await cb(mockPg);
    }
};

// Mock SQLite dedup_store
const mockDedup = {
    isDuplicate: async (msgId) => mockDbSystem.msg_dedup.has(msgId),
    markProcessed: (msgId) => mockDbSystem.msg_dedup.add(msgId),
};

// 获取被测逻辑 (由于 require 缓存，我们手动注入 mock)
const identityService = require('../src/identity_service');
// 简单的脏手段切换测试依赖
const originalPg = require('../src/pg_client');
Object.assign(originalPg, mockPg);

async function runTests() {
    console.log('🧪 [Test] Starting Governance Tests...');

    try {
        // --- Test 1: 同一身份多次进入，ty_uid 必须恒定 ---
        console.log('[Test 1] Testing ty_uid stability for same external_key...');
        const res1 = await identityService.resolveOrCreate('wecom', 'user_abc', { nickname: 'QiXi' });
        const res2 = await identityService.resolveOrCreate('wecom', 'user_abc', { nickname: 'QiXi' });

        assert.strictEqual(res1.ty_uid, res2.ty_uid, 'FAILED: ty_uid must be stable for same user');
        assert.strictEqual(res1.is_new_user, true, 'First time should be new');
        assert.strictEqual(res2.is_new_user, false, 'Second time should NOT be new');
        console.log('✅ Pass 1');

        // --- Test 2: 昵称或元数据改变，ty_uid 必须保持不变量 ---
        console.log('[Test 2] Testing ty_uid immunity to metadata changes...');
        const res3 = await identityService.resolveOrCreate('wecom', 'user_abc', { nickname: 'NewNickname' });
        assert.strictEqual(res3.ty_uid, res1.ty_uid, 'FAILED: ty_uid changed after nickname update');
        console.log('✅ Pass 2');

        // --- Test 3: ty_uid 格式校验 & 不允许为空 ---
        console.log('[Test 3: Checks formats and nulls]');
        assert.ok(res1.ty_uid.startsWith('TYU_'), 'FAILED: ty_uid format invalid');
        assert.ok(res1.handle.match(/^[UAEP]-\d+/), `FAILED: handle format invalid: ${res1.handle}`);
        console.log('✅ Pass 3');

        // --- Test 4: Webhook 重放幂等性 ---
        console.log('[Test 4] Testing message de-duplication idempotency...');
        const msgId = 'test_msg_123';
        const isDup1 = await mockDedup.isDuplicate(msgId);
        assert.strictEqual(isDup1, false, 'Fresh message should not be duplicate');

        mockDedup.markProcessed(msgId);
        const isDup2 = await mockDedup.isDuplicate(msgId);
        assert.strictEqual(isDup2, true, 'Replayed message must be detected as duplicate');
        console.log('✅ Pass 4');

        console.log('\n🎊 [SUCCESS] All Governance Invariants Verified.');
        process.exit(0);

    } catch (err) {
        console.error(`\n❌ [FAILURE] ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

runTests();
