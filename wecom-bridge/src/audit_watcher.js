const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const chatwoot = require('./chatwoot_client');
const identityService = require('./identity_service');

/**
 * AuditWatcher: Monitors OpenClaw Gateway Logs to sync AI actions to Chatwoot.
 * Targets: ~/.openclaw/logs/gateway.log
 */
class AuditWatcher {
    constructor() {
        this.logPath = path.join(process.env.HOME, '.openclaw/logs/gateway.log');
        this.lastSize = 0;
        this.checkInterval = 5000; // 5s poll

        // Chatwoot context
        this.accountId = process.env.CHATWOOT_ACCOUNT_ID;
        this.inboxId = process.env.CHATWOOT_INBOX_ID;
    }

    start() {
        if (!fs.existsSync(this.logPath)) {
            logger.warn(`[Audit-Watcher] Log file not found at ${this.logPath}. Waiting...`);
        } else {
            this.lastSize = fs.statSync(this.logPath).size;
        }

        logger.info(`[Audit-Watcher] Started monitoring ${this.logPath}`);

        setInterval(() => this.poll(), this.checkInterval);
    }

    async poll() {
        try {
            if (!fs.existsSync(this.logPath)) return;

            const stats = fs.statSync(this.logPath);
            if (stats.size === this.lastSize) return;

            if (stats.size < this.lastSize) {
                // Log rotated
                this.lastSize = 0;
            }

            const stream = fs.createReadStream(this.logPath, {
                start: this.lastSize,
                end: stats.size
            });

            let buffer = '';
            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep partial line

                lines.forEach(line => this.processLine(line));
            });

            this.lastSize = stats.size;
        } catch (err) {
            logger.error(`[Audit-Watcher] Poll error: ${err.message}`);
        }
    }

    async processLine(line) {
        // Pattern 1: Tool execution detection (based on skill invocation)
        // Example: 2026-02-10T... [exec] node C360Skill.js TYU_01KGJ...
        const skillMatch = line.match(/node C360Skill\.js\s+(TYU_[A-Z0-9]+)/);

        if (skillMatch) {
            const tyUid = skillMatch[1];
            logger.info(`[Audit-Watcher] Detected AI Skill execution for UID: ${tyUid}`);
            await this.syncToChatwoot(tyUid, `🤖 【AI 审计】助手调用了“客户全景画像”技能。\n\n查询目标: ${tyUid}\n来源: OpenClaw Gateway Log`);
            return;
        }

        // Pattern 2: Generic Tool Call detection (if OpenClaw logs it)
        if (line.includes('[TOOL_CALL]') || line.includes('calling tool')) {
            // Handle generic tool calls if needed
        }
    }

    async syncToChatwoot(tyUid, content) {
        try {
            const link = await identityService.getChatwootLink(tyUid, this.accountId, this.inboxId);
            if (link && link.last_conversation_id) {
                await chatwoot.syncPrivateNote(link.last_conversation_id, content);
                logger.info(`[Audit-Watcher] Synced audit note to CW conversation ${link.last_conversation_id}`);
            } else {
                logger.warn(`[Audit-Watcher] No active Chatwoot link found for ${tyUid}. Audit note skipped.`);
            }
        } catch (err) {
            logger.error(`[Audit-Watcher] Failed to sync to Chatwoot: ${err.message}`);
        }
    }
}

module.exports = new AuditWatcher();
