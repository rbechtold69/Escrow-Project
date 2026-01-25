#!/bin/bash
# ============================================================================
# Start ngrok tunnel for Bridge webhook testing
# ============================================================================
#
# This script:
# 1. Starts ngrok tunnel to your local dev server
# 2. Displays the public URL to configure in Bridge dashboard
#
# USAGE:
#   ./scripts/start-webhook-tunnel.sh
#
# PREREQUISITES:
#   - ngrok installed (brew install ngrok)
#   - ngrok authenticated (ngrok config add-authtoken YOUR_TOKEN)
#   - Local dev server running on port 3000
#
# ============================================================================

set -e

PORT=${1:-3000}

echo ""
echo "=============================================="
echo "  BRIDGE WEBHOOK TUNNEL"
echo "=============================================="
echo ""
echo "Starting ngrok tunnel to localhost:$PORT..."
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed!"
    echo "   Install with: brew install ngrok"
    exit 1
fi

# Check if dev server is running
if ! curl -s http://localhost:$PORT > /dev/null 2>&1; then
    echo "⚠️  Warning: No server detected on localhost:$PORT"
    echo "   Make sure to run 'npm run dev' first!"
    echo ""
fi

echo "Starting tunnel..."
echo ""
echo "=============================================="
echo "  IMPORTANT: Copy the 'Forwarding' URL below"
echo "  and add it to your Bridge webhook settings:"
echo ""
echo "  Bridge Dashboard → Webhooks → Add Endpoint"
echo "  URL: https://YOUR_NGROK_URL/api/webhooks/bridge"
echo "=============================================="
echo ""

# Start ngrok
ngrok http $PORT
