#!/bin/bash
# 🛰️ Tongye Security: Git Pre-commit Governance Sentinel
# MISSION: Prevent credential leakage and configuration violation during commit.

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔍 [Security Sentinel] Auditing staged changes..."

# 1. Block changes to root .env
# We check for absolute match or relative match depending on where git is run
FORBIDDEN_FILE="wecom-bridge/.env"
if git diff --cached --name-only | grep -E "^(.*/)?$FORBIDDEN_FILE$" > /dev/null; then
    echo -e "${RED}❌ ARCHITECTURE VIOLATION: Changes to $FORBIDDEN_FILE are blocked.${NC}"
    echo "Root .env is a 'Read-Only Bootstrap'. Move your changes to /config/profiles/."
    exit 1
fi

# 2. Scan for Keyword Patterns in Staged Files
# Patterns: PG_PASSWORD, AES_KEY, TOKEN, PASS, SECRET, sk- (openai)
PATTERNS="PG_PASSWORD|AES_KEY|TOKEN|PASS|SECRET|sk-[a-zA-Z0-9-]{20,}"
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

VIOLATIONS=0
for FILE in $STAGED_FILES; do
    if [[ -f "$FILE" ]]; then
        # Use git diff --cached -U0 to minimize context
        # Filter for added lines (starts with + but not +++)
        MATCHES=$(git diff --cached -U0 "$FILE" | grep "^+[^+]" | grep -Ei "$PATTERNS")
        if [ ! -z "$MATCHES" ]; then
            echo -e "${RED}❌ SECURITY BREACH: Potential credential detected in $FILE:${NC}"
            echo "$MATCHES"
            VIOLATIONS=$((VIOLATIONS+1))
        fi
    fi
done

if [ $VIOLATIONS -gt 0 ]; then
    echo -e "${RED}Commit rejected. Please extract secrets to environment variables or Profile files.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Security audit passed.${NC}"
exit 0
