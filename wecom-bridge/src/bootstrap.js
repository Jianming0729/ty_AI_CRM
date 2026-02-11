const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * 🚀 Architecture Circuit Breaker (V3.0 Standard)
 * 执行优先级：1 (Must be called before any other requires)
 */
function bootstrap() {
    const rootEnvPath = path.join(__dirname, '../.env');

    // 1. 验证 .env 是否存在且仅作为引导器
    if (fs.existsSync(rootEnvPath)) {
        const rootConfig = dotenv.parse(fs.readFileSync(rootEnvPath));
        const keys = Object.keys(rootConfig);

        // 核心逻辑：根目录 .env 除 PROFILE 外不得包含业务 Key
        const illegalKeys = keys.filter(k => k !== 'PROFILE' && k !== 'NODE_ENV');
        if (illegalKeys.length > 0) {
            console.error('❌ [Architecture Violation] Root .env contains prohibited keys:', illegalKeys);
            console.error('👉 The root .env MUST ONLY contain the PROFILE variable.');
            console.error('👉 Please move all other keys to config/profiles/${PROFILE}.env');
            process.exit(1); // 触发断路器
        }
    }

    // 2. 验证 Profile 强制化
    // 先加载 root .env 以获取 PROFILE 变量
    dotenv.config({ path: rootEnvPath });

    const profile = process.env.PROFILE;
    if (!profile) {
        console.error('❌ [Architecture Violation] PROFILE environment variable is MANDATORY.');
        process.exit(1);
    }

    const profilePath = path.join(__dirname, `../config/profiles/${profile}.env`);
    if (!fs.existsSync(profilePath)) {
        console.error(`❌ [Profile Missing] Target profile file not found at: ${profilePath}`);
        process.exit(1);
    }

    // 3. 加载 Profile 配置并注入
    dotenv.config({ path: profilePath, override: true });
    console.log(`✅ [System Boot] Profile "${profile}" loaded successfully.`);
}

// 保持对旧有异步检查的支持
bootstrap.asyncCheck = () => require('./bootstrap_async');


module.exports = bootstrap;
