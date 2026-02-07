const logger = require('./logger');
const db = require('./pg_client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const REQUIRED_SCHEMA_VERSION = '2.1.0';

/**
 * 架构启动自检 (Phase 1 & 2: Version Solidification)
 * 目标：在正式服务启动前，强校验环境标准与数据库 Schema 版本号
 */
async function bootstrapCheck() {
    logger.info(`🚀 [Bootstrap] Architecture Self-Check (Required Schema: ${REQUIRED_SCHEMA_VERSION})...`);

    try {
        // 1. 检查环境变量 (Env Checklist)
        const requiredEnvs = [
            'PROFILE', // 架构固化：必须指定运行环境 Profile
            'WECOM_TOKEN', 'WECOM_AES_KEY', 'WECOM_CORP_ID',
            'CHATWOOT_API_TOKEN', 'CHATWOOT_BASE_URL', 'CHATWOOT_ACCOUNT_ID', 'CHATWOOT_INBOX_ID',
            'PG_HOST', 'PG_USER', 'PG_PASSWORD', 'PG_DATABASE',
            'OPENCLAW_GATEWAY_URL'
        ];
        for (const env of requiredEnvs) {
            if (!process.env[env] || process.env[env].trim() === '') {
                throw new Error(`Environment Variable Missing: ${env}`);
            }
        }

        // 1.1 检查 Profile 对应变量是否已加载 (Phase 4 固化)
        const profileEnvs = ['WECOM_WEBHOOK_BASE_URL', 'CHATWOOT_BASE_URL', 'PUBLIC_CRM_URL'];
        for (const env of profileEnvs) {
            if (!process.env[env]) throw new Error(`Architecture Violation: Profile Environment Variable '${env}' is missing. Check your /config/profiles/ file.`);
        }
        logger.info(`✅ [Bootstrap] Environment variables and Profile (${process.env.PROFILE}) verified.`);

        // 2. 检查 PostgreSQL (ty_identity - Global SSOT)
        logger.info(`[Bootstrap] Probing PostgreSQL (ty_identity) at ${process.env.PG_HOST}...`);
        try {
            const pgRes = await db.query('SELECT current_database(), current_time');
            logger.info(`✅ [Bootstrap] Connected to PostgreSQL: ${pgRes.rows[0].current_database}`);

            // 校验 Schema 版本 (system_meta)
            const versionRes = await db.query("SELECT schema_version FROM system_meta LIMIT 1");
            if (versionRes.rows.length === 0) {
                throw new Error("Architecture Violation: Table 'system_meta' is empty in ty_identity.");
            }

            const currentPgVersion = versionRes.rows[0].schema_version;
            if (currentPgVersion !== REQUIRED_SCHEMA_VERSION) {
                throw new Error(`Schema Version Mismatch (Postgres): Expected ${REQUIRED_SCHEMA_VERSION}, found ${currentPgVersion}. Please run migrations manually.`);
            }
            logger.info(`✅ [Bootstrap] PostgreSQL Schema Version (${currentPgVersion}) verified.`);
        } catch (err) {
            if (err.message.includes('relation "system_meta" does not exist')) {
                throw new Error("Architecture Violation: Table 'system_meta' missing in ty_identity.");
            }
            throw new Error(`PostgreSQL Check Failed: ${err.message}`);
        }

        // 3. 检查 SQLite (wecom_bridge.db - Local State)
        const dbPath = path.join(__dirname, '../wecom_bridge.db');
        logger.info(`[Bootstrap] Probing SQLite (Local State) at ${dbPath}...`);

        const localDb = new sqlite3.Database(dbPath);
        await new Promise((resolve, reject) => {
            localDb.serialize(() => {
                // 1. 强制表结构对齐
                localDb.run("CREATE TABLE IF NOT EXISTS local_meta (schema_version TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");

                // 2. 校验版本
                const checkVersion = () => {
                    localDb.get("SELECT schema_version FROM local_meta LIMIT 1", (err, row) => {
                        if (err) {
                            if (err.message.includes('no such column')) {
                                logger.warn('⚠️ [Bootstrap] Old SQLite schema detected, migrating...');
                                localDb.serialize(() => {
                                    localDb.run("DROP TABLE local_meta");
                                    localDb.run("CREATE TABLE local_meta (schema_version TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
                                    localDb.run("INSERT INTO local_meta (schema_version) VALUES (?)", [REQUIRED_SCHEMA_VERSION], (initErr) => {
                                        if (initErr) return reject(new Error(`SQLite migration failed: ${initErr.message}`));
                                        resolve();
                                    });
                                });
                                return;
                            }
                            return reject(new Error(`SQLite Query Error: ${err.message}`));
                        }

                        if (!row) {
                            // 初始化写入版本
                            logger.warn(`⚠️ [Bootstrap] Initializing SQLite local_meta with version ${REQUIRED_SCHEMA_VERSION}...`);
                            localDb.run("INSERT INTO local_meta (schema_version) VALUES (?)", [REQUIRED_SCHEMA_VERSION], (writeErr) => {
                                if (writeErr) return reject(new Error(`SQLite Init Error: ${writeErr.message}`));
                                resolve();
                            });
                        } else if (row.schema_version !== REQUIRED_SCHEMA_VERSION) {
                            return reject(new Error(`Schema Version Mismatch (SQLite): Expected ${REQUIRED_SCHEMA_VERSION}, found ${row.schema_version}. Manual intervention required.`));
                        } else {
                            resolve();
                        }
                    });
                };
                checkVersion();
            });
        });
        localDb.close();
        logger.info(`✅ [Bootstrap] SQLite database version verified (${REQUIRED_SCHEMA_VERSION}).`);

        // 4. 检查 Chatwoot API
        const cwUrl = `${process.env.CHATWOOT_BASE_URL}/api/v1/accounts/${process.env.CHATWOOT_ACCOUNT_ID}/inboxes`;
        logger.info(`[Bootstrap] Probing Chatwoot API at ${cwUrl}...`);
        try {
            await axios.get(cwUrl, {
                headers: { 'api_access_token': process.env.CHATWOOT_API_TOKEN },
                timeout: 5000
            });
            logger.info('✅ [Bootstrap] Chatwoot API connectivity verified.');
        } catch (err) {
            throw new Error(`Chatwoot API Check Failed: ${err.message}`);
        }

        logger.info('🎊 [Bootstrap] Architecture Self-Check PASSED.');
        return true;

    } catch (error) {
        logger.error(`❌ [Bootstrap FATAL] ${error.message}`);
        logger.error('系统架构自检失败，进程已强行中断。请检查环境配置与数据库状态。');
        process.exit(1);
    }
}

module.exports = bootstrapCheck;
