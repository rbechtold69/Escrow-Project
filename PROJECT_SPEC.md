# EscrowBase - Complete Project Specification

## Overview

EscrowBase is a modern real estate escrow platform that uses blockchain technology (invisibly to users) to provide secure, yield-generating escrow accounts. The platform abstracts away all crypto/web3 complexity - users see a normal fintech app.

---

## Core Architecture Decisions

### 1. Invisible Web3 (Critical Design Principle)
- **NO crypto jargon** in the UI - no "wallet", "blockchain", "connect wallet", etc.
- Users see: "Sign In", "Create Account", "My Account", "Sign Out"
- Authentication uses **Coinbase Smart Wallet** with passkeys (biometric auth)
- Wallet creation happens invisibly during account signup

### 2. Zero PII Security Architecture
- **We NEVER store sensitive bank data** (account numbers, routing numbers, SSNs)
- Bank details are tokenized via **Bridge.xyz** API
- We only store Bridge's token IDs (e.g., `ext_acct_abc123`)
- If our database is breached, attackers get nothing useful

### 3. Yield Generation via USDM
- Deposits are converted from **USDC → USDM** (Mountain Protocol stablecoin)
- USDM earns ~5% APY via US Treasury backing (rebasing token)
- On escrow close, USDM → USDC, yield goes to buyer as closing cost credit
- Swap uses **Aerodrome DEX** with `stable = true` for 1:1 pegged assets

### 4. Smart Contract Architecture
- **EscrowVault.sol**: Main contract holding funds, handles swaps
- Uses Aerodrome Router for USDC ↔ USDM swaps
- Emits `EscrowClosed` event for payout orchestration

---

## Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui** components
- **wagmi v2** + **viem** for blockchain interaction
- **Coinbase Wallet SDK** for Smart Wallet auth

### Backend
- **Next.js API Routes** (serverless)
- **Prisma ORM** with PostgreSQL
- **Bridge.xyz API** for banking (tokenization, wire transfers)

### Blockchain (Base Network)
- **Base Mainnet** (production) / **Base Sepolia** (testnet)
- **Solidity** smart contracts
- **Foundry** for contract development

### Key Addresses (Base Mainnet)
```
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
USDM: 0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C
Aerodrome Router: 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
Aerodrome Factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da
```

---

## Database Schema (Prisma)

### Core Models

```prisma
model User {
  id            String    @id @default(cuid())
  walletAddress String    @unique  // Coinbase Smart Wallet address
  displayName   String?
  email         String?
  role          UserRole  @default(ESCROW_OFFICER)
  createdAt     DateTime  @default(now())
  escrows       Escrow[]
}

model Escrow {
  id                     String       @id @default(cuid())
  escrowId               String       @unique  // e.g., "ESC-2024-001847"
  propertyAddress        String
  city                   String
  state                  String
  zipCode                String
  purchasePrice          Decimal
  buyerFirstName         String
  buyerLastName          String
  buyerEmail             String
  bridgeVirtualAccountId String?      // Bridge.xyz token (NOT bank details!)
  vaultAddress           String?      // Smart contract address
  safeAddress            String?      // Gnosis Safe multisig
  status                 EscrowStatus @default(CREATED)
  initialDeposit         Decimal?
  currentBalance         Decimal?
  accruedYield           Decimal?
  createdAt              DateTime     @default(now())
  closedAt               DateTime?
  createdBy              User         @relation(fields: [createdById], references: [id])
  createdById            String
  payees                 Payee[]
}

model Payee {
  id                  String        @id @default(cuid())
  firstName           String
  lastName            String
  email               String?
  payeeType           PayeeType     // SELLER, BUYER_AGENT, TITLE_INSURANCE, etc.
  bridgeBeneficiaryId String        // Bridge.xyz token (NOT bank details!)
  bankName            String?       // Display only (public info)
  accountLast4        String?       // Last 4 digits for verification UI
  paymentMethod       PaymentMethod // WIRE, ACH, CHECK
  amount              Decimal?
  status              PayeeStatus   @default(PENDING)
  escrow              Escrow        @relation(fields: [escrowId], references: [id])
  escrowId            String
}

enum EscrowStatus {
  CREATED
  DEPOSIT_PENDING
  FUNDS_RECEIVED
  READY_TO_CLOSE
  CLOSING
  CLOSED
  CANCELLED
}

enum PayeeType {
  BUYER, SELLER, BUYER_AGENT, LISTING_AGENT, BUYER_LENDER,
  ESCROW_COMPANY, TITLE_INSURANCE, MORTGAGE_PAYOFF, HOA, OTHER
  // ... full list in schema.prisma
}

enum PaymentMethod {
  WIRE, ACH, INTERNATIONAL, CHECK
}
```

---

## API Routes

### Authentication
- `POST /api/register` - Create new user (triggers Smart Wallet creation)
- `POST /api/auth/verify` - Verify passkey authentication

### Escrow Management
- `POST /api/escrow/create` - Create new escrow (currently mock mode)
- `GET /api/escrow/list` - List user's escrows
- `POST /api/escrow/close` - Close escrow and trigger payouts

### Payees
- `POST /api/payees/add` - Add payee with bank details (tokenized via Bridge)

### Webhooks
- `POST /api/webhooks/bridge` - Handle Bridge.xyz deposit notifications
- `POST /api/webhooks/escrow-closed` - Handle on-chain EscrowClosed events

---

## User Flows

### 1. Sign Up Flow
```
User clicks "Create Account"
  → Enter name + email
  → Passkey prompt (Face ID / Touch ID / Windows Hello)
  → Backend creates Coinbase Smart Wallet (invisible to user)
  → User lands on Dashboard
```

### 2. Create Escrow Flow
```
Escrow officer clicks "New Escrow"
  → Enter property details (address, price)
  → System creates:
      - Smart contract vault
      - Bridge.xyz virtual bank account
  → Display wiring instructions for buyer
  → Buyer wires funds to virtual account
  → Bridge converts to USDC, deposits to vault
  → Vault swaps USDC → USDM (earns yield)
```

### 3. Add Payee Flow
```
Officer clicks "Add Payee"
  → Enter name, type, amount
  → Enter bank details (routing #, account #)
  → Bank details sent to Bridge.xyz API
  → Bridge returns token (ext_acct_xxx)
  → We store ONLY the token, discard bank details
  → UI shows: "Chase Bank ****1234" (safe to display)
```

### 4. Close Escrow Flow
```
Officer clicks "Close Escrow"
  → Smart contract swaps USDM → USDC
  → Calculates yield earned
  → Distributes principal to payees
  → Sends yield to buyer (minus 0.5% platform fee)
  → Emits EscrowClosed event
  → Webhook triggers Bridge.xyz wire transfers
```

---

## Current State (What's Built)

### ✅ Completed
- Next.js project structure with App Router
- Tailwind CSS + shadcn/ui component library
- Coinbase Smart Wallet integration (wagmi v2)
- Basic authentication flow
- Dashboard with escrow list (mock data)
- New Escrow form with validation
- Prisma schema with zero-PII design
- Bridge.xyz service (real + mock mode)
- Mock mode for testing without Bridge credentials
- Database connection (Supabase PostgreSQL)

### 🔧 Partially Complete
- Create Escrow API (simplified mock version working)
- Payee management (UI exists, API needs work)

### ❌ Not Yet Built
- Smart contract deployment
- Real Bridge.xyz integration (requires business account)
- Escrow close flow
- Payout orchestration
- PDF generation for wiring instructions
- Email notifications

---

## Environment Variables

```env
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# Blockchain
NEXT_PUBLIC_CHAIN_ID=84532  # Base Sepolia (testnet)
NEXT_PUBLIC_RPC_URL="https://sepolia.base.org"

# Bridge.xyz (set to mock for testing)
BRIDGE_USE_MOCK="true"
BRIDGE_API_KEY=""
BRIDGE_API_SECRET=""

# Contract addresses (empty until deployed)
NEXT_PUBLIC_ESCROW_FACTORY_ADDRESS=""
NEXT_PUBLIC_MOCK_USDC_ADDRESS=""
NEXT_PUBLIC_MOCK_USDM_ADDRESS=""
```

---

## File Structure

```
escrowbase/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── escrow/
│   │   │   ├── create/route.ts
│   │   │   ├── list/route.ts
│   │   │   └── close/route.ts
│   │   ├── payees/
│   │   ├── register/
│   │   └── webhooks/
│   ├── escrow/
│   │   ├── [id]/page.tsx
│   │   └── new/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── auth/
│   ├── escrow/
│   ├── layout/
│   │   └── navbar.tsx
│   ├── providers.tsx
│   └── ui/  (shadcn components)
├── lib/
│   ├── bridge-mock.ts
│   ├── bridge-service.ts
│   ├── prisma.ts
│   └── web3-config.ts
├── prisma/
│   └── schema.prisma
├── hooks/
├── types/
├── package.json
└── .env.local
```

---

## UI/UX Guidelines

### Language Rules
- ❌ "Connect Wallet" → ✅ "Sign In"
- ❌ "Wallet Address" → ✅ "Account ID" (or hide entirely)
- ❌ "Blockchain" → ✅ "Secure ledger" (or don't mention)
- ❌ "Smart Contract" → ✅ "Escrow Account"
- ❌ "Transaction" → ✅ "Transfer"
- ❌ "Gas fees" → Never mention (abstracted away)

### Design System
- Primary color: Blue (`bg-blue-600`)
- Clean, professional fintech aesthetic
- Mobile-responsive (though desktop-first)
- Minimal use of blockchain/crypto imagery

---

## Smart Contract (Solidity)

### EscrowVault.sol Key Features

```solidity
// Aerodrome Router interface with stable swap
interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;      // TRUE for USDC/USDM (pegged assets)
        address factory;
    }
    
    function swapExactTokensForTokens(...) external returns (uint256[] memory);
}

// Deposit: USDC → USDM
function deposit(uint256 amount) external {
    USDC.transferFrom(msg.sender, address(this), amount);
    _swapUSDCtoUSDM(amount);  // Uses stable = true
}

// Close: USDM → USDC, distribute
function closeEscrow() external onlyOwner {
    uint256 usdmBalance = USDM.balanceOf(address(this));
    uint256 usdcReceived = _swapUSDMtoUSDC(usdmBalance);
    
    uint256 yield = usdcReceived - initialDeposit;
    uint256 platformFee = (yield * 50) / 10000;  // 0.5%
    uint256 buyerRebate = yield - platformFee;
    
    // Distribute to payees...
    emit EscrowClosed(escrowId, payees, amounts, yield, buyerRebate);
}
```

---

## Testing Setup

### Current Test Environment
- Database: Supabase (PostgreSQL)
- Blockchain: Base Sepolia testnet
- Bridge: Mock mode (BRIDGE_USE_MOCK="true")
- Wallet: MetaMask with Base Sepolia network

### Test Wallet
```
Address: 0x636580a1e0311cc03aed8162c7eaaf2aa36ed91c
Network: Base Sepolia (Chain ID: 84532)
Test ETH: ~0.001 ETH from Coinbase faucet
```

---

## Next Steps (Priority Order)

1. **Fix Create Escrow flow** - Ensure form → API → success page works
2. **Implement Payee management** - Add/edit/remove payees with bank tokenization
3. **Deploy test contracts** - MockUSDC, MockUSDM, TestEscrowVault to Base Sepolia
4. **Real deposit flow** - Connect Bridge virtual accounts to vault
5. **Close escrow flow** - USDM→USDC swap, yield calculation, payouts
6. **Production Bridge integration** - Requires Bridge.xyz business account

---

## Important Notes for Continuation

1. **Mock Mode is Active**: The app currently runs in mock mode for Bridge.xyz. Real banking integration requires contacting support@bridge.xyz for business onboarding.

2. **Prisma Client**: After any schema changes, run `npx prisma generate` and `npx prisma db push`.

3. **Session Pooler**: Use Supabase's Session Pooler URL (port 5432) not Transaction Pooler (6543) for Prisma.

4. **Smart Contracts Not Deployed**: The contract code exists but hasn't been deployed. Current testing uses mock data.

5. **No Real Money**: Everything is testnet/sandbox. No real funds are at risk.

---

## Repository Setup for GitHub

```bash
cd ~/projects/escrowbase-test
git init
git add .
git commit -m "Initial commit - EscrowBase platform"
git remote add origin https://github.com/YOUR_USERNAME/escrowbase.git
git branch -M main
git push -u origin main
```

---

*This specification was generated from a development session on December 12-13, 2024.*
