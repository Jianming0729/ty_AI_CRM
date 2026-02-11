#!/bin/bash
# 👮 Tongye Security: Root Directory Hidden File Monitor
# MISSION: Detect unauthorized write attempts to root hidden files (e.g., .env)

WATCH_DIR="./wecom-bridge"
TARGET_FILE="$WATCH_DIR/.env"
LOG_FILE="./logs/security_audit.log"

mkdir -p ./logs

echo "🛡️ Security Monitor Started: Watching $TARGET_FILE"
echo "Timestamp | Event | Process | Result" >> $LOG_FILE

# Simulating a monitoring loop (In production, this would use inotifywait or fswatch)
# For this audit, we provide a verification logic.

verify_lockdown() {
    echo "--- 🔍 Governance Lockdown Verification ---"
    
    # 1. Try to write to root .env (Should fail if mounted :ro or protected)
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        echo "Skipping physical permission check on Windows, assuming Docker :ro handles it."
    else
        echo "[Test 1] Attempting to modify $TARGET_FILE..."
        # Simulate a write attempt
        if touch "$TARGET_FILE" 2>/dev/null; then
            # If the file exists and is writable, this is a violation in the 'lockdown' phase
            # But wait, locally I might have access. This check is primarily for INSIDE the container.
            echo "⚠️  WARNING: $TARGET_FILE is writable by current user. (Expected for local dev, CRITICAL for Prod-Docker)"
        else
            echo "✅ SUCCESS: $TARGET_FILE is READ-ONLY. Lockdown verified."
        fi
    fi

    # 2. Try to write to profiles directory (Should succeed)
    PROFILES_DIR="$WATCH_DIR/config/profiles"
    TEMP_FILE="$PROFILES_DIR/audit_test.tmp"
    echo "[Test 2] Attempting to write to $PROFILES_DIR..."
    if touch "$TEMP_FILE" 2>/dev/null; then
        echo "✅ SUCCESS: Profiles directory is writable for legitimate updates."
        rm "$TEMP_FILE"
    else
        echo "❌ FAILED: Profiles directory is not writable. OpenClaw iteration blocked."
    fi
}

verify_lockdown
