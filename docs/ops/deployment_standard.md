# 🚀 环境规约与部署标准 (Deployment Standard)

## 1. 环境主权定义
- **PROD (60.205.92.221)**: 唯一真值执行环境。
- **LOCAL (Sandbox)**: 逻辑镜像与思维实验区，禁止直接向生产注入未验证的副作用。

## 2. 部署网关流程
1. **代码合并**: 在本地完成 `Fix Mode` 开发。
2. **冒烟测试**: 在开发服务器执行 `./local_test.js`。
3. **版本标记**: 按照 Semantic Versioning 打 Tag (e.g., `v1.2.3`)。
4. **受控推送**: 运行 `wecom-bridge/deploy_to_cloud.sh`。

## 3. 容灾与恢复
- 数据库变更必须先在 `ty_identity` 测试库运行。
- 所有的 `docker-compose.yml` 变更必须经过 `docker config` 校验。

## 4. 回滚协议
若部署后 5 分钟内出现 `errcode: 95018` 等系统级异常，立即执行 `git checkout HEAD^` 并重新部署上一个稳定版本。
