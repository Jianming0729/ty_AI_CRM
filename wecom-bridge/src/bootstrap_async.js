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
    logger.info(`🚀 [Bootstrap] Deep Architecture Self-Check (Required Schema: ${REQUIRED_SCHEMA_VERSION})...`);

    try {
        // 1. 检查环境变量 (Env Checklist)
        const requiredEnvs = [
            'PROFILE',
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

        // 2. 检查 PostgreSQL (ty_identity - Global SSOT)
        logger.info(`[Bootstrap] Probing PostgreSQL (ty_identity) at ${process.env.PG_HOST}...`);
        try {
            const pgRes = await db.query('SELECT current_database(), current_time');
            logger.info(`✅ [Bootstrap] Connected to PostgreSQL: ${pgRes.rows[0].current_database}`);

            const versionRes = await db.query("SELECT schema_version FROM system_meta LIMIT 1");
            if (versionRes.rows.length === 0) throw new Error("Table 'system_meta' is empty.");

            const currentPgVersion = versionRes.rows[0].schema_version;
            if (currentPgVersion !== REQUIRED_SCHEMA_VERSION) {
                throw new Error(`Schema Version Mismatch (Postgres): Expected ${REQUIRED_SCHEMA_VERSION}, found ${currentPgVersion}.`);
            }
            logger.info(`✅ [Bootstrap] PostgreSQL Schema Version (${currentPgVersion}) verified.`);
        } catch (err) {
            if (process.env.MOCK_MODE === 'true') {
                logger.warn(`⚠️ [Bootstrap WARNING] PostgreSQL Check Failed: ${err.message}. Continuing in MOCK_MODE.`);
            } else {
                throw new Error(`PostgreSQL Check Failed: ${err.message}`);
            }
        }

        // 3. 检查 SQLite (Local State)
        const dbName = process.env.SQLITE_DB_NAME || 'wecom_bridge.db';
        const dbPath = path.join(__dirname, `../${dbName}`);
        logger.info(`[Bootstrap] Probing SQLite at ${dbPath}...`);

        const localDb = new sqlite3.Database(dbPath);
        try {
            await new Promise((resolve, reject) => {
                localDb.get("SELECT schema_version FROM local_meta LIMIT 1", (err, row) => {
                    if (err || !row || row.schema_version !== REQUIRED_SCHEMA_VERSION) {
                        reject(new Error("SQLite Schema Version Mismatch or initialization required."));
                    } else {
                        resolve();
                    }
                });
            });
            logger.info(`✅ [Bootstrap] SQLite database version verified.`);
        } catch (err) {
            if (process.env.MOCK_MODE === 'true') {
                logger.warn(`⚠️ [Bootstrap WARNING] SQLite Check Failed: ${err.message}. Continuing in MOCK_MODE.`);
            } else {
                throw err;
            }
        }
        localDb.close();

        logger.info('🎊 [Bootstrap] Deep Architecture Self-Check PASSED.');
        return true;

    } catch (error) {
        logger.error(`❌ [Bootstrap FATAL] ${error.message}`);
        process.exit(1);
    }
}

module.exports = bootstrapCheck;
