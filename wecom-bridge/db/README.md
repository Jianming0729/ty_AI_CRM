# Identity Database Ops Guide

## 1. 数据库初始化 (Cloud Container)
在云端服务器执行以下命令，创建专用数据库：

```bash
docker exec -it <postgres_container_name> psql -U <user> -c "CREATE DATABASE ty_identity;"
```

## 2. 执行迁移 (Migration)
进入 `migrations` 目录并执行 SQL：

```bash
cat migrations/001_initial_identity_schema.sql | docker exec -i <postgres_container_name> psql -U <user> -d ty_identity
```

## 3. 约束验收测试
验证唯一键约束是否生效：

```sql
-- 第一次插入
INSERT INTO users (ty_uid) VALUES ('TYU_TEST_01');
INSERT INTO identities (ty_uid, provider, external_key) VALUES ('TYU_TEST_01', 'wecom', 'QiXi');

-- 尝试重复插入相同的 provider + external_key (预期报错)
INSERT INTO identities (ty_uid, provider, external_key) VALUES ('TYU_TEST_01', 'wecom', 'QiXi');
```

预期错误提示：`ERROR: duplicate key value violates unique constraint "uq_identities_provider_key"`
