#!/bin/bash

# 配置
SERVER_IP="60.205.92.221"
REMOTE_USER="root" # 或者你的用户名
REMOTE_DIR="/opt/wecom-bridge"

echo "🚀 开始准备部署文件..."

# 确保 build 依赖排除
# 创建临时目录
mkdir -p ./deploy/app
cp -r src config package.json package-lock.json Dockerfile Dockerfile.gateway .env ./deploy/app/
cp knowledge_base.json ./deploy/app/
cp -r public ./deploy/app/
mkdir -p ./deploy/local-llm
cp ../local-llm/mock_provider.py ./deploy/local-llm/
cp docker-compose.yml .env README.md ./deploy/
cp -r docs ./deploy/app/
cp deploy/nginx.conf ./deploy/

echo "📦 正在同步到服务器 ${SERVER_IP}..."

# 同步文件 (需要 SSH 密钥)
ssh ${REMOTE_USER}@${SERVER_IP} "mkdir -p ${REMOTE_DIR}"
rsync -avz ./deploy/ ${REMOTE_USER}@${SERVER_IP}:${REMOTE_DIR}/

echo "✅ 同步完成！"
echo "请登录服务器执行以下操作："
echo "1. cd ${REMOTE_DIR}"
echo "2. docker compose up -d --build"
echo "3. sudo cp deploy/nginx.conf /etc/nginx/conf.d/wecom.xytcloud.com.conf"
echo "4. sudo certbot --nginx -d wecom.xytcloud.com"
