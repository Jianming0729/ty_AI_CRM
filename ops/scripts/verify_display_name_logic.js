/**
 * 🧪 Tongye Identity: Display Name Logic Unit Test
 * 任务：验证 buildContactDisplayName 优先级连条是否符合 V3.0 治理方案。
 */

const chatwoot = require('../../wecom-bridge/src/chatwoot_client');

const testCases = [
    {
        name: "场景 A: 新用户首次进入，携带企微昵称",
        input: { handle: "U-000001", wecomName: "QiXi", existingName: null },
        expected: "U-000001 | QiXi"
    },
    {
        name: "场景 B: 历史数据为占位符 'Contact'，新消息携带昵称 (预期自动修正)",
        input: { handle: "U-000002", wecomName: "小助手", existingName: "U-000002 | Contact" },
        expected: "U-000002 | 小助手"
    },
    {
        name: "场景 C: 历史已有自定义昵称，新消息未携带昵称 (预期保留旧昵称)",
        input: { handle: "U-000003", wecomName: null, existingName: "U-000003 | 张经理" },
        expected: "U-000003 | 张经理"
    },
    {
        name: "场景 D: 历史是 'Contact'，新消息也没昵称 (预期维持兜底)",
        input: { handle: "U-000004", wecomName: null, existingName: "U-000004 | Contact" },
        expected: "U-000004 | Contact"
    },
    {
        name: "场景 E: 异常格式历史 (只有 handle)，预期补全",
        input: { handle: "U-000005", wecomName: "王五", existingName: "U-000005" },
        expected: "U-000005 | 王五"
    }
];

console.log('--- 🧪 开始验证 Display Name 修复逻辑 ---');
let passed = 0;

testCases.forEach((tc, index) => {
    try {
        const result = chatwoot.buildContactDisplayName(tc.input);
        const isMatch = result === tc.expected;

        console.log(`\n测试用例 #${index + 1}: ${tc.name}`);
        console.log(`  输入: wecom_name="${tc.input.wecomName}", existing="${tc.input.existingName}"`);
        console.log(`  预期: ${tc.expected}`);
        console.log(`  实际: ${result}`);

        if (isMatch) {
            console.log('  状态: ✅ 通过');
            passed++;
        } else {
            console.log('  状态: ❌ 失败');
        }
    } catch (e) {
        console.log(`  状态: 💥 抛出异常: ${e.message}`);
    }
});

console.log('\n--- 📊 测试总结 ---');
console.log(`总数: ${testCases.length}, 通过: ${passed}, 失败: ${testCases.length - passed}`);

if (passed === testCases.length) {
    console.log('\n🎊 验证成功！所有命名优先级规则均符合 V3.0 治理方案。');
} else {
    process.exit(1);
}
