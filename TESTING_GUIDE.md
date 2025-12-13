# EscrowBase Testing Guide

## Overview

This guide walks you through setting up a complete **sandbox environment** where you can test all features without spending real money or creating real bank accounts.

**What you'll be testing:**
- ✅ Coinbase Smart Wallet authentication (real passkeys, testnet blockchain)
- ✅ Bridge.xyz banking integration (sandbox API, fake bank accounts)
- ✅ Smart contracts (Base Sepolia testnet, test tokens)
- ✅ Database operations (local or cloud PostgreSQL)

---

## Quick Start Checklist

- [ ] 1. Set up local database (5 min)
- [ ] 2. Get Bridge.xyz sandbox credentials (10 min)
- [ ] 3. Create testnet wallet & get test ETH (5 min)
- [ ] 4. Deploy test contracts (10 min)
- [ ] 5. Configure environment variables (5 min)
- [ ] 6. Run the app and test! (ongoing)

---

## Step 1: Database Setup

### Option A: Local Docker (Recommended)

```bash
# Start PostgreSQL in Docker
docker run --name escrow-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=escrowbase \
  -p 5432:5432 \
  -d postgres:15

# Your DATABASE_URL will be:
# postgresql://postgres:postgres@localhost:5432/escrowbase
```

### Option B: Free Cloud Database

**Supabase (Recommended for beginners):**
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → Database → Connection string
4. Copy the URI (use "Transaction" mode for serverless)

**Neon:**
1. Go to [neon.tech](https://neon.tech)
2. Create a project
3. Copy the connection string

### Initialize the Database

```bash
cd frontend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create database tables
npx prisma db push

# (Optional) Open Prisma Studio to view data
npx prisma studio
```

---

## Step 2: Bridge.xyz Sandbox

Bridge.xyz provides a full sandbox environment with fake money.

### Get Sandbox Credentials

1. Go to [dashboard.bridge.xyz](https://dashboard.bridge.xyz)
2. Create an account (or sign in)
3. **Toggle "Sandbox Mode"** in the top-right corner
4. Go to **Settings → API Keys**
5. Create a new API key
6. Save these values:
   - API Key ID
   - API Secret
   - Webhook Secret

### Sandbox Features

| Feature | Sandbox Behavior |
|---------|-----------------|
| Virtual Accounts | Creates fake routing/account numbers |
| Wire Transfers | Simulates instantly (no real money) |
| External Accounts | Tokenizes fake bank details |
| Webhooks | Sends real webhook events |

### Test Webhook Locally

Use ngrok to receive webhooks locally:

```bash
# Install ngrok
npm install -g ngrok

# Start your app
npm run dev

# In another terminal, expose port 3000
ngrok http 3000

# Copy the https URL and add to Bridge dashboard:
# https://xxxx.ngrok.io/api/webhooks/bridge
```

---

## Step 3: Testnet Wallet Setup

### Create a Test Wallet

You need a wallet to deploy contracts and pay for gas on testnet.

**Option A: Use an existing wallet**
- Export the private key from MetaMask (Settings → Security → Export Private Key)
- ⚠️ Use a wallet with NO real funds!

**Option B: Generate a new wallet**
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# This outputs a private key like:
# a1b2c3d4e5f6...
# Prefix with 0x: 0xa1b2c3d4e5f6...
```

### Get Test ETH (Base Sepolia)

You need test ETH to pay for gas on Base Sepolia.

**Faucets:**
1. [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet) - Requires Coinbase account
2. [Alchemy Faucet](https://sepoliafaucet.com/) - Requires Alchemy account
3. [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia)

**Steps:**
1. Import your private key into MetaMask
2. Switch to "Base Sepolia" network
3. Copy your wallet address
4. Paste into faucet and request ETH
5. Wait for confirmation (~10 seconds)

### Add Base Sepolia to MetaMask

```
Network Name: Base Sepolia
RPC URL: https://sepolia.base.org
Chain ID: 84532
Currency Symbol: ETH
Block Explorer: https://sepolia.basescan.org
```

---

## Step 4: Deploy Test Contracts

Since USDM and Aerodrome don't exist on testnet, we deploy mock versions.

### Mock Token Contracts

Create these simplified mock contracts for testing:

```solidity
// contracts/test/MockUSDC.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 10_000_000 * 10**6); // 10M USDC
    }
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    // Anyone can mint for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

```solidity
// contracts/test/MockUSDM.sol  
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDM is ERC20 {
    uint256 public constant YIELD_RATE = 500; // 5% APY in basis points
    
    constructor() ERC20("Mock USDM", "USDM") {
        _mint(msg.sender, 10_000_000 * 10**18); // 10M USDM
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    // Simulate yield by allowing manual rebase
    function simulateYield(address account, uint256 yieldAmount) external {
        _mint(account, yieldAmount);
    }
}
```

### Deploy with Foundry

```bash
cd contracts

# Install Foundry if needed
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Set environment
export PRIVATE_KEY=0x...your_testnet_private_key
export RPC_URL=https://sepolia.base.org

# Deploy MockUSDC
forge create --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  src/test/MockUSDC.sol:MockUSDC

# Deploy MockUSDM  
forge create --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  src/test/MockUSDM.sol:MockUSDM

# Deploy EscrowFactory (update constructor args with mock addresses)
forge create --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  src/EscrowFactory.sol:EscrowFactory \
  --constructor-args <MOCK_USDC_ADDRESS> <MOCK_USDM_ADDRESS>
```

### Deploy with Hardhat (Alternative)

```bash
cd contracts
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Create deployment script
npx hardhat run scripts/deploy-testnet.js --network baseSepolia
```

---

## Step 5: Configure Environment

Create your `.env.local` file:

```bash
cd frontend
cp .env.example .env.local
```

Fill in the values:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/escrowbase"

# Blockchain - Base Sepolia Testnet
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_CHAIN_NAME="Base Sepolia"
NEXT_PUBLIC_RPC_URL="https://sepolia.base.org"
NEXT_PUBLIC_BLOCK_EXPLORER="https://sepolia.basescan.org"

# Your deployed contract addresses
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS="0x..."
NEXT_PUBLIC_MOCK_USDC_ADDRESS="0x..."
NEXT_PUBLIC_MOCK_USDM_ADDRESS="0x..."

# Bridge.xyz Sandbox
BRIDGE_API_URL="https://api.sandbox.bridge.xyz"
BRIDGE_API_KEY="your_sandbox_key"
BRIDGE_API_SECRET="your_sandbox_secret"
BRIDGE_WEBHOOK_SECRET="your_webhook_secret"

# Server wallet (testnet only!)
SERVER_PRIVATE_KEY="0x..."
```

---

## Step 6: Run and Test

### Start the App

```bash
cd frontend
npm run dev

# Open http://localhost:3000
```

### Test the Auth Flow

1. Click "Create Account"
2. Enter name and email
3. Complete passkey setup (this is real - uses your device)
4. You should be redirected to dashboard

**What's happening:**
- Coinbase Smart Wallet creates a real wallet on Base Sepolia
- Your user record is saved to the database
- No real money is involved

### Test Adding a Payee

1. Go to an escrow detail page
2. Click "Add Payee"
3. Enter test bank details:
   - Bank Name: `Test Bank`
   - Routing Number: `021000021` (Chase test routing)
   - Account Number: `123456789`
4. Submit

**What's happening:**
- Data is sent to Bridge.xyz **sandbox**
- Bridge returns a token like `ext_acct_sandbox_xxx`
- Only the token is stored in your database
- No real bank account is created

### Test Deposits (Simulated)

In Bridge.xyz sandbox, you can simulate deposits:

1. Go to Bridge Dashboard (sandbox mode)
2. Find your virtual account
3. Click "Simulate Deposit"
4. Enter amount and confirm
5. Webhook will fire to your ngrok URL

### Test Smart Contracts

```bash
# Using cast (Foundry)
export RPC_URL=https://sepolia.base.org

# Check MockUSDC balance
cast call <MOCK_USDC_ADDRESS> "balanceOf(address)" <YOUR_WALLET> --rpc-url $RPC_URL

# Mint test USDC to yourself
cast send <MOCK_USDC_ADDRESS> "mint(address,uint256)" <YOUR_WALLET> 1000000000 --rpc-url $RPC_URL --private-key $PRIVATE_KEY
```

---

## Testing Checklist

### Authentication
- [ ] Create new account with passkey
- [ ] Sign out and sign back in
- [ ] Try signing in with unregistered passkey (should show "not found")

### Payee Management
- [ ] Add payee with bank details
- [ ] Verify bank numbers are NOT in database (check Prisma Studio)
- [ ] Verify Bridge token IS in database

### Bridge.xyz Integration
- [ ] Create virtual account for escrow
- [ ] Simulate deposit via Bridge dashboard
- [ ] Receive webhook and process deposit
- [ ] Initiate transfer to payee

### Smart Contracts
- [ ] Deploy mock tokens
- [ ] Deposit USDC to vault
- [ ] Verify USDC→USDM swap (or mock equivalent)
- [ ] Close escrow and verify distribution

---

## Troubleshooting

### "Cannot connect to database"
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart if needed
docker start escrow-postgres
```

### "Insufficient funds for gas"
- Get more test ETH from faucet
- Check you're on Base Sepolia (chain ID 84532)

### "Bridge API error"
- Verify you're using sandbox URL: `api.sandbox.bridge.xyz`
- Check API key is from sandbox mode
- Verify webhook secret matches

### "Contract not found"
- Verify contract addresses in `.env.local`
- Check contracts are deployed to Base Sepolia
- Use block explorer to verify: `https://sepolia.basescan.org/address/0x...`

### "Passkey not working"
- Coinbase Smart Wallet works on both testnet and mainnet
- Make sure you're using a supported browser (Chrome, Safari, Edge)
- Try the QR code option if passkey fails

---

## Moving to Production

When ready to go live:

1. **Database**: Migrate to production PostgreSQL (e.g., AWS RDS, Supabase Pro)

2. **Bridge.xyz**: 
   - Disable sandbox mode in dashboard
   - Generate production API keys
   - Update webhook URL to production domain
   - Complete KYB verification

3. **Blockchain**:
   - Update chain ID to 8453 (Base Mainnet)
   - Deploy contracts to mainnet
   - Update contract addresses
   - Fund server wallet with real ETH

4. **Environment**:
   ```env
   NODE_ENV=production
   NEXT_PUBLIC_CHAIN_ID=8453
   NEXT_PUBLIC_RPC_URL="https://mainnet.base.org"
   BRIDGE_API_URL="https://api.bridge.xyz"
   ```

5. **Security**:
   - Rotate all API keys
   - Set up proper secrets management
   - Enable rate limiting
   - Configure monitoring/alerts

---

## Resources

- **Base Sepolia Faucet**: https://portal.cdp.coinbase.com/products/faucet
- **Bridge.xyz Docs**: https://docs.bridge.xyz
- **Coinbase Smart Wallet**: https://www.smartwallet.dev/
- **Foundry Book**: https://book.getfoundry.sh
- **Prisma Docs**: https://www.prisma.io/docs

---

## Support

If you run into issues:
1. Check the troubleshooting section above
2. Review the console/terminal for error messages
3. Check Bridge.xyz dashboard for webhook logs
4. Use Prisma Studio to inspect database state
