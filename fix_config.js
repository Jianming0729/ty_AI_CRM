const fs = require('fs');
const dotenv = require('dotenv');

// 1. 读取 .env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const apiKey = envConfig.OPENAI_API_KEY;
const baseUrl = envConfig.OPENAI_BASE_URL;

// 2. 更新 OpenClaw 配置
const configPath = `${process.env.HOME}/.openclaw/openclaw.json`;
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

config.env.OPENAI_API_KEY = apiKey;
config.env.OPENAI_BASE_URL = baseUrl;
// 植入熔断保护
config.agents.defaults.maxRetries = 3;
config.agents.defaults.contextTokens = 40000;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log("✅ 架构师指令：配置已物理注入，Token 熔断器已激活。");