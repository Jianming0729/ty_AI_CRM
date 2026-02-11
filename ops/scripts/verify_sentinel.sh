#!/bin/bash
# 🧪 Pre-commit Sentinel Verification Script

SENTINEL="./ops/scripts/pre_commit_sentinel.sh"
chmod +x $SENTINEL

echo "--- 🧪 Starting Sentinel Verification ---"

# Setup: Create a temporary test file
TEST_FILE="wecom-bridge/src/security_test.js"
mkdir -p wecom-bridge/src

# Test 1: Valid code
echo "console.log('Safe code');" > $TEST_FILE
git add $TEST_FILE
echo "[Test 1] Valid code commit..."
if $SENTINEL; then
    echo "✅ Result: Passed (Correct)"
else
    echo "❌ Result: Failed (Incorrect)"
fi

# Test 2: Hardcoded Secret
echo "const SECRET_KEY = 'sk-proj-1234567890abcdef1234567890abcdef';" >> $TEST_FILE
git add $TEST_FILE
echo -e "\n[Test 2] Hardcoded Secret (sk-proj-...) commit..."
if $SENTINEL; then
    echo "❌ Result: Passed (Incorrect - should have blocked)"
else
    echo "✅ Result: Blocked (Correct)"
fi

# Test 3: AES_KEY Pattern
echo "const config = { AES_KEY: 'sensitive_value' };" > $TEST_FILE
git add $TEST_FILE
echo -e "\n[Test 3] AES_KEY pattern commit..."
if $SENTINEL; then
    echo "❌ Result: Passed (Incorrect - should have blocked)"
else
    echo "✅ Result: Blocked (Correct)"
fi

# Test 4: Root .env modification
echo "PROFILE=test" > wecom-bridge/.env
git add -f wecom-bridge/.env
echo -e "\n[Test 4] Root .env modification commit..."
if $SENTINEL; then
    echo "❌ Result: Passed (Incorrect - should have blocked)"
else
    echo "✅ Result: Blocked (Correct)"
fi

# Cleanup
git reset wecom-bridge/src/security_test.js
git reset wecom-bridge/.env
rm $TEST_FILE
# Restore .env to valid state
echo "PROFILE=prod_global" > wecom-bridge/.env

echo -e "\n--- 📊 Verification Complete ---"
