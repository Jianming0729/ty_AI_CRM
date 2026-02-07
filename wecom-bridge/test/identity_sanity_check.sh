#!/bin/bash
BASE_URL="http://localhost:3001/v1/identity"

echo "--- 1. Testing resolve-or-create (New User) ---"
RES1=$(curl -s -X POST "$BASE_URL/resolve-or-create" \
  -H "Content-Type: application/json" \
  -d '{"provider":"wecom", "external_key":"test_user_001"}')
echo $RES1
UID1=$(echo $RES1 | grep -oE "TYU_[0-9A-Z]+" | head -n 1)
echo "Extracted UID: $UID1"

echo -e "\n--- 2. Testing resolve-or-create (Repeat User) ---"
curl -s -X POST "$BASE_URL/resolve-or-create" \
  -H "Content-Type: application/json" \
  -d '{"provider":"wecom", "external_key":"test_user_001"}'

echo -e "\n--- 3. Testing link (Conflict) ---"
# 尝试将相同的 wecom:test_user_001 绑定到另一个新 UID (通过创建一个新 UID 来对比)
RES2=$(curl -s -X POST "$BASE_URL/resolve-or-create" \
  -H "Content-Type: application/json" \
  -d '{"provider":"phone", "external_key":"13800138002"}')
UID2=$(echo $RES2 | grep -oE "TYU_[0-9A-Z]+" | head -n 1)
echo "New UID for phone: $UID2"

echo "Attempting to link existing wecom key to new phone UID..."
curl -s -X POST "$BASE_URL/link" \
  -H "Content-Type: application/json" \
  -d "{\"ty_uid\":\"$UID2\", \"provider\":\"wecom\", \"external_key\":\"test_user_001\"}"

echo -e "\n--- 4. Testing resolve-target ---"
curl -s -X POST "$BASE_URL/resolve-target" \
  -H "Content-Type: application/json" \
  -d "{\"ty_uid\":\"$UID1\"}"

echo -e "\n--- 5. Testing chatwoot link sync ---"
curl -s -X POST "$BASE_URL/chatwoot/sync" \
  -H "Content-Type: application/json" \
  -d "{\"ty_uid\":\"$UID1\", \"account_id\":1, \"inbox_id\":2, \"contact_id\":100, \"conversation_id\":200}"

echo -e "\n--- 6. Testing chatwoot link get ---"
curl -s "$BASE_URL/chatwoot/link?ty_uid=$UID1&account_id=1&inbox_id=2"

