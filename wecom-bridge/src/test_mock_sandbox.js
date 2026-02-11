/**
 * 🛰️ Mock Sandbox Verification Script
 * 目标：验证在 PROFILE=mock_sandbox 下，所有外部调用均被 MockServiceFactory 拦截。
 */

process.env.PROFILE = 'mock_sandbox';
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// 1. 加载配置
const profilePath = path.join(__dirname, `../config/profiles/mock_sandbox.env`);
if (fs.existsSync(profilePath)) {
    const config = dotenv.parse(fs.readFileSync(profilePath));
    for (const k in config) process.env[k] = config[k];
}

const MockServiceFactory = require('./mock_service_factory');
const wecom = MockServiceFactory.getWeComClient();
const chatwoot = MockServiceFactory.getChatwootClient();
const openclaw = MockServiceFactory.getOpenClawClient();

async function runVerification() {
    console.log('--- 🧪 Phase 2: Mock Sandbox Verification ---');
    console.log(`Profile: ${process.env.PROFILE}`);
    console.log(`Mock Mode: ${process.env.MOCK_MODE}`);

    let interceptedCount = 0;

    // Test WeCom
    console.log('\n[Test 1] WeCom Send Message...');
    const wecomRes = await wecom.sendKfMessage('corp123', 'user456', 'kf789', 'Hello Mock');
    if (wecomRes.success) {
        console.log('✅ WeCom call intercepted by factory.');
        interceptedCount++;
    }

    // Test Chatwoot
    console.log('\n[Test 2] Chatwoot Sync...');
    const cwRes = await chatwoot.syncMessage({ ty_uid: 'U1' }, 'User Message');
    if (cwRes === 'mock_conversation_id') {
        console.log('✅ Chatwoot call intercepted by factory.');
        interceptedCount++;
    }

    // Test OpenClaw
    console.log('\n[Test 3] OpenClaw Request...');
    const ocRes = await openclaw.sendToAgent('Test Prompt');
    if (ocRes.includes('[MOCK-RESPONSE]')) {
        console.log('✅ OpenClaw call intercepted by factory.');
        interceptedCount++;
    }

    console.log('\n--- 📊 Summary ---');
    if (interceptedCount === 3) {
        console.log('🎊 VERIFICATION SUCCESS: All outbound services are successfully sandboxed.');
    } else {
        console.log('❌ VERIFICATION FAILED: Some services bypassed the mock factory.');
        process.exit(1);
    }
}

runVerification();
