# EscrowBase Setup Guide

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL (Neon.tech) + Prisma ORM
- **Deployment**: AWS Lambda via SST
- **Blockchain**: Base Mainnet (USDC only)
- **Auth**: Coinbase Smart Wallet (Passkey-first)
- **Banking**: Bridge.xyz (Virtual Accounts)
- **Custody**: Safe (Gnosis Multisig) - 1 vault per property

---

## 1. Database Setup (Neon.tech)

### Create a Neon Account

1. Go to [neon.tech](https://neon.tech) and sign up
2. Create a new project (e.g., "escrowbase-production")
3. Choose your region (closest to your AWS deployment region)

### Get Connection String

1. In your Neon dashboard, click on your project
2. Go to **Connection Details**
3. Copy the connection string (it looks like):
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Configure Environment

Add to your `.env.local`:
```bash
DATABASE_URL="postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

### Run Migrations

```bash
cd frontend
npx prisma generate
npx prisma db push
```

---

## 2. SST Deployment Setup

### Prerequisites

- AWS Account
- AWS CLI configured (`aws configure`)
- Node.js 18+

### Set Secrets

```bash
cd frontend

# Set your database URL
npx sst secret set DatabaseUrl "postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Set Bridge.xyz credentials (when you get them)
npx sst secret set BridgeApiKey "your-bridge-api-key"
npx sst secret set BridgeApiSecret "your-bridge-api-secret"
```

### Deploy to Dev

```bash
npx sst dev
```

### Deploy to Production

```bash
npx sst deploy --stage production
```

---

## 3. Bridge.xyz Setup

### Get API Access

1. Apply at [bridge.xyz](https://bridge.xyz)
2. Complete KYB (Know Your Business) verification
3. Receive API credentials

### Configure

Add to `.env.local`:
```bash
BRIDGE_API_KEY="your-api-key"
BRIDGE_API_SECRET="your-api-secret"
BRIDGE_WEBHOOK_SECRET="your-webhook-secret"
BRIDGE_USE_MOCK="false"  # Set to "true" for testing
```

### Webhook Setup

Configure Bridge.xyz to send webhooks to:
```
https://your-domain.com/api/webhooks/bridge
```

---

## 4. Coinbase Smart Wallet Setup

The app uses Coinbase Smart Wallet for authentication. Configuration:

```bash
# In .env.local
NEXT_PUBLIC_ONCHAINKIT_API_KEY="your-onchainkit-key"
```

Get your key at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)

---

## 5. Local Development

### Install Dependencies

```bash
cd frontend
npm install
```

### Generate Prisma Client

```bash
npx prisma generate
```

### Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

---

## 6. Architecture Overview

### Core Flow

```
1. Officer clicks "Open Escrow"
   └─> App deploys Safe contract
   └─> Calls Bridge API to create Virtual Account
   └─> Virtual Account maps to Safe address

2. Buyer wires funds to Virtual Account
   └─> Bridge converts USD → USDC
   └─> USDC deposited to Safe on Base
   └─> Funds remain 1:1 liquid USDC

3. Officer adds Payees
   └─> Bank details sent to Bridge API
   └─> Bridge returns beneficiary_id
   └─> We store ONLY beneficiary_id (Zero-Liability)

4. Officer clicks "Close Escrow"
   └─> Multisig approval required (2-of-3)
   └─> USDC sent to Bridge Liquidation Address
   └─> Bridge fires wires/ACH to beneficiaries
```

### Security: Zero-Liability Architecture

```
❌ WE NEVER STORE:
   - Bank account numbers
   - Routing numbers
   - Full SSNs

✅ WE ONLY STORE:
   - Bridge.xyz tokenized IDs
   - Non-sensitive metadata
   - Our internal reference IDs
```

---

## 7. Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon.tech PostgreSQL connection string |
| `NEXT_PUBLIC_ONCHAINKIT_API_KEY` | Coinbase OnchainKit API key |

### Bridge.xyz (Required for production)

| Variable | Description |
|----------|-------------|
| `BRIDGE_API_KEY` | Bridge.xyz API key |
| `BRIDGE_API_SECRET` | Bridge.xyz API secret |
| `BRIDGE_WEBHOOK_SECRET` | Webhook signature verification |
| `BRIDGE_USE_MOCK` | Set to `"true"` for testing |

### Optional

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_RPC_URL` | Custom Base RPC URL |
| `PUSHER_APP_ID` | Pusher app ID for real-time |
| `PUSHER_KEY` | Pusher key |
| `PUSHER_SECRET` | Pusher secret |

---

## 8. Testing

### Mock Mode

Set `BRIDGE_USE_MOCK=true` to use the mock Bridge service for testing without real money movement.

### Demo Flow

1. Sign in with Coinbase Smart Wallet
2. Click "+ New Escrow"
3. Enter property details and buyer info
4. Use "Demo Mode Controls" to simulate deposit
5. Add payees
6. Close escrow

---

## Need Help?

- Bridge.xyz Docs: https://docs.bridge.xyz
- SST Docs: https://docs.sst.dev
- Neon.tech Docs: https://neon.tech/docs
- Prisma Docs: https://prisma.io/docs



