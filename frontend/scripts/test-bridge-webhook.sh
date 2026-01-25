#!/bin/bash
# ============================================================================
# Bridge Webhook Tester for EscrowPayi
# ============================================================================
#
# Sends test webhooks to your live site (escrowpayi.com)
#
# USAGE:
#   ./scripts/test-bridge-webhook.sh [event-type] [escrow-id]
#
# EXAMPLES:
#   ./scripts/test-bridge-webhook.sh deposit.received ESC-001
#   ./scripts/test-bridge-webhook.sh deposit.completed ESC-001
#
# ============================================================================

# Default to localhost for testing (change to production URL if needed)
# WEBHOOK_URL="https://www.escrowpayi.com/api/webhooks/bridge"
WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3000/api/webhooks/bridge}"
EVENT_TYPE=${1:-"deposit.received"}
ESCROW_ID=${2:-"TEST-$(date +%s)"}
AMOUNT=${3:-"50000.00"}
TIMESTAMP=$(date +%s)000

# Show help if no arguments
if [ "$1" == "" ] || [ "$1" == "help" ] || [ "$1" == "--help" ]; then
    echo ""
    echo "=============================================="
    echo "  BRIDGE WEBHOOK TESTER"
    echo "=============================================="
    echo ""
    echo "Sends test webhooks to: $WEBHOOK_URL"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/test-bridge-webhook.sh <event-type> <escrow-id> [amount]"
    echo ""
    echo "EVENT TYPES:"
    echo "  deposit.received   - Wire initiated (funds pending)"
    echo "  deposit.completed  - Funds settled (GOOD FUNDS)"
    echo "  deposit.failed     - Deposit failed"
    echo "  transfer.completed - Payout completed"
    echo "  transfer.failed    - Payout failed"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/test-bridge-webhook.sh deposit.received ESC-001"
    echo "  ./scripts/test-bridge-webhook.sh deposit.completed ESC-001 75000.00"
    echo ""
    echo "=============================================="
    exit 0
fi

echo ""
echo "=============================================="
echo "  SENDING WEBHOOK: $EVENT_TYPE"
echo "=============================================="
echo "URL: $WEBHOOK_URL"
echo "Escrow ID: $ESCROW_ID"
echo "Amount: \$$AMOUNT"
echo ""

# Create payload based on event type
if [[ "$EVENT_TYPE" == deposit.* ]]; then
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_${TIMESTAMP}",
  "type": "${EVENT_TYPE}",
  "data": {
    "virtual_account_id": "va_test_${TIMESTAMP}",
    "amount": "${AMOUNT}",
    "currency": "usd",
    "status": "$([ "$EVENT_TYPE" == "deposit.completed" ] && echo "completed" || echo "pending")",
    "external_id": "${ESCROW_ID}",
    "metadata": {
      "deal_id": "${ESCROW_ID}",
      "source": "test_script"
    },
    "source": {
      "sender_name": "Test Buyer LLC",
      "bank_name": "Test Bank"
    },
    "destination": {
      "wallet_id": "wallet_test_${TIMESTAMP}",
      "address": "0x1111111111111111111111111111111111111111"
    },
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
)
else
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_${TIMESTAMP}",
  "type": "${EVENT_TYPE}",
  "data": {
    "transfer_id": "transfer_test_${TIMESTAMP}",
    "amount": "${AMOUNT}",
    "currency": "usd",
    "status": "$([ "$EVENT_TYPE" == "transfer.completed" ] && echo "completed" || echo "failed")",
    "metadata": {
      "deal_id": "${ESCROW_ID}",
      "escrow_id": "${ESCROW_ID}",
      "payee_id": "test-payee-001"
    },
    "destination": {
      "external_account_id": "ext_acct_test_${TIMESTAMP}",
      "payment_rail": "wire"
    },
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
)
fi

echo "Payload:"
echo "$PAYLOAD" | python3 -m json.tool 2>/dev/null || echo "$PAYLOAD"
echo ""
echo "=============================================="
echo ""

# Send the webhook
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: t=${TIMESTAMP},v0=dGVzdF9zaWduYXR1cmU=" \
  -d "$PAYLOAD")

# Parse response
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response Status: $HTTP_CODE"
echo "Response Body: $BODY"
echo ""

if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Webhook sent successfully!"
else
    echo "❌ Webhook failed (HTTP $HTTP_CODE)"
fi
echo ""
