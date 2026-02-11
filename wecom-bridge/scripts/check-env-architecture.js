const fs = require('fs');
const path = require('path');

/**
 * 👮 Digital Sheriff: Architecture Governance Enforcement
 * MISSION: Enforce V3.0 standards across the codebase.
 */

const MANIFESTO_PATH = path.join(__dirname, '../../docs/OPENCLAW_MANIFESTO.md');
const ROOT_ENV_PATH = path.join(__dirname, '../.env');
const SOURCE_DIR = path.join(__dirname, '../src');

// Refined patterns to look for assignments of secrets
const SECRET_ASSIGNMENT_PATTERN = /(?:const|let|var|id|key|password|token|secret|aes_key|auth)\s*[:=]\s*['"`][a-zA-Z0-9\-_]{16,}['"`]/i;
const OPENAI_KEY_PATTERN = /sk-[a-zA-Z0-9-]{20,}/;

const ALLOWED_ROOT_ENV_KEYS = ['PROFILE', 'NODE_ENV'];

function logViolation(rule, file, message) {
    console.error(`❌ [Architecture Violation] Rule: ${rule} - File: ${file}`);
    if (message) console.error(`   👉 Reason: ${message}`);
}

async function runAudit() {
    console.log('🛰️  Digital Sheriff auditing architecture compliance...');
    let violations = 0;

    // 1. Extract context from Manifesto (Check if it exists)
    if (!fs.existsSync(MANIFESTO_PATH)) {
        logViolation('GOVERNANCE_MISSING', 'docs/OPENCLAW_MANIFESTO.md', 'Global Manifesto not found!');
        violations++;
    }

    // 2. Scan Root .env
    if (fs.existsSync(ROOT_ENV_PATH)) {
        const content = fs.readFileSync(ROOT_ENV_PATH, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const key = trimmed.split('=')[0];
                if (!ALLOWED_ROOT_ENV_KEYS.includes(key)) {
                    logViolation('ZERO_SECRET_IN_ROOT', 'wecom-bridge/.env', `Prohibited key '${key}' detected. Root .env must only contain: ${ALLOWED_ROOT_ENV_KEYS.join(', ')}`);
                    violations++;
                }
            }
        }
    }

    // 3. Scan Source Code for hardcoded secrets
    function scanDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                scanDir(fullPath);
            } else if (file.endsWith('.js') || file.endsWith('.ts')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                // Skip specific files
                const fileName = path.basename(file);
                if (fileName === 'check-env-architecture.js' || fileName === 'bootstrap.js' || fileName === 'bootstrap_async.js' || fileName === 'test_mock_sandbox.js') continue;

                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) return; // Skip comments

                    if (SECRET_ASSIGNMENT_PATTERN.test(line) || OPENAI_KEY_PATTERN.test(line)) {
                        // Confirm it's a hardcoded string and not process.env
                        if (!line.includes('process.env')) {
                            logViolation('NO_HARDCODED_SECRETS', fullPath, `Potential secret assignment at line ${index + 1}: ${trimmedLine}`);
                            violations++;
                        }
                    }
                });
            }
        }
    }

    if (fs.existsSync(SOURCE_DIR)) {
        scanDir(SOURCE_DIR);
    }

    // 4. Final Verdict
    if (violations > 0) {
        console.error(`\n📊 Audit failed with ${violations} violations.`);
        process.exit(1);
    } else {
        console.log('\n✅ Audit passed. Codebase is compliant with V3.0 standards.');
        process.exit(0);
    }
}

runAudit();
