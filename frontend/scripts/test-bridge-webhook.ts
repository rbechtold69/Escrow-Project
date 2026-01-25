#!/usr/bin/env npx ts-node
/**
 * ============================================================================
 * Bridge Webhook Testing Script
 * ============================================================================
 *
 * Simulates Bridge.xyz webhooks for local development and testing.
 *
 * USAGE:
 *   npx ts-node scripts/test-bridge-webhook.ts [event-type] [escrow-id]
 *
 * EXAMPLES:
 *   npx ts-node scripts/test-bridge-webhook.ts deposit.received ESC-001
 *   npx ts-node scripts/test-bridge-webhook.ts deposit.completed ESC-001
 *   npx ts-node scripts/test-bridge-webhook.ts transfer.completed ESC-001
 *
 * ============================================================================
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/bridge';

// Event types supported
type EventType =
  | 'deposit.received'
  | 'deposit.completed'
  | 'deposit.failed'
  | 'transfer.completed'
  | 'transfer.failed';

// Generate a unique ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Create deposit webhook payload
function createDepositEvent(
  type: 'deposit.received' | 'deposit.completed' | 'deposit.failed',
  escrowId: string,
  amount: string = '50000.00'
): object {
  return {
    id: generateId('evt'),
    type,
    data: {
      virtual_account_id: generateId('va'),
      amount,
      currency: 'usd',
      status: type === 'deposit.completed' ? 'completed' : type === 'deposit.failed' ? 'failed' : 'pending',
      external_id: escrowId,
      metadata: {
        deal_id: escrowId,
        source: 'test_script',
      },
      source: {
        sender_name: 'Test Buyer LLC',
        bank_name: 'Test Bank of America',
      },
      destination: {
        wallet_id: generateId('wallet'),
        address: '0x' + '1'.repeat(40),
      },
      transaction_hash: type === 'deposit.completed' ? '0x' + 'a'.repeat(64) : undefined,
      created_at: new Date().toISOString(),
    },
  };
}

// Create transfer webhook payload
function createTransferEvent(
  type: 'transfer.completed' | 'transfer.failed',
  escrowId: string,
  payeeId: string = 'test-payee-001',
  amount: string = '25000.00'
): object {
  return {
    id: generateId('evt'),
    type,
    data: {
      transfer_id: generateId('transfer'),
      amount,
      currency: 'usd',
      status: type === 'transfer.completed' ? 'completed' : 'failed',
      metadata: {
        deal_id: escrowId,
        escrow_id: escrowId,
        payee_id: payeeId,
      },
      destination: {
        external_account_id: generateId('ext_acct'),
        payment_rail: 'wire',
      },
      completed_at: type === 'transfer.completed' ? new Date().toISOString() : undefined,
      failure_reason: type === 'transfer.failed' ? 'Insufficient funds' : undefined,
      created_at: new Date().toISOString(),
    },
  };
}

// Create fake signature header (for dev/sandbox testing)
function createFakeSignatureHeader(): string {
  const timestamp = Date.now();
  // This is a fake signature - only works because dev mode allows unsigned webhooks
  const fakeSignature = Buffer.from('fake_test_signature').toString('base64');
  return `t=${timestamp},v0=${fakeSignature}`;
}

// Send webhook to local server
async function sendWebhook(eventType: EventType, escrowId: string, payeeId?: string): Promise<void> {
  let payload: object;

  switch (eventType) {
    case 'deposit.received':
    case 'deposit.completed':
    case 'deposit.failed':
      payload = createDepositEvent(eventType, escrowId);
      break;
    case 'transfer.completed':
    case 'transfer.failed':
      payload = createTransferEvent(eventType, escrowId, payeeId);
      break;
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SENDING WEBHOOK: ${eventType}`);
  console.log('='.repeat(60));
  console.log(`URL: ${WEBHOOK_URL}`);
  console.log(`Escrow ID: ${escrowId}`);
  console.log('\nPayload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('='.repeat(60) + '\n');

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': createFakeSignatureHeader(),
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = responseText;
    }

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    console.log('Response Body:', JSON.stringify(responseJson, null, 2));

    if (response.ok) {
      console.log('\n✅ Webhook sent successfully!\n');
    } else {
      console.log('\n❌ Webhook failed!\n');
    }
  } catch (error) {
    console.error('\n❌ Error sending webhook:', error);
  }
}

// Interactive menu
async function showMenu(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('BRIDGE WEBHOOK TESTER');
  console.log('='.repeat(60));
  console.log('\nAvailable event types:');
  console.log('  1. deposit.received    - Wire initiated (funds pending)');
  console.log('  2. deposit.completed   - Funds settled (GOOD FUNDS)');
  console.log('  3. deposit.failed      - Deposit failed');
  console.log('  4. transfer.completed  - Payout completed');
  console.log('  5. transfer.failed     - Payout failed');
  console.log('\nUsage:');
  console.log('  npx ts-node scripts/test-bridge-webhook.ts <event-type> <escrow-id>');
  console.log('\nExamples:');
  console.log('  npx ts-node scripts/test-bridge-webhook.ts deposit.completed ESC-001');
  console.log('  WEBHOOK_URL=https://abc123.ngrok.io/api/webhooks/bridge npx ts-node scripts/test-bridge-webhook.ts deposit.received ESC-001');
  console.log('='.repeat(60) + '\n');
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    await showMenu();
    process.exit(0);
  }

  const eventType = args[0] as EventType;
  const escrowId = args[1];
  const payeeId = args[2]; // Optional for transfer events

  const validEvents: EventType[] = [
    'deposit.received',
    'deposit.completed',
    'deposit.failed',
    'transfer.completed',
    'transfer.failed',
  ];

  if (!validEvents.includes(eventType)) {
    console.error(`Invalid event type: ${eventType}`);
    console.error(`Valid types: ${validEvents.join(', ')}`);
    process.exit(1);
  }

  await sendWebhook(eventType, escrowId, payeeId);
}

main().catch(console.error);
