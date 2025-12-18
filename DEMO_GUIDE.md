# EscrowBase Demo Guide

This guide will help you present EscrowBase to potential escrow office customers.

## Quick Start

1. **Start the app**: 
   ```bash
   cd frontend
   npm run dev
   ```

2. **Open**: http://localhost:3000

3. **Sign In**: Click "Sign In" to connect with Coinbase Smart Wallet (uses passkey/biometric)

---

## Demo Flow (Step-by-Step)

### Step 1: Create a New Escrow

1. Click **"New Escrow"** in the top navigation
2. Fill in property details:
   - **Address**: 123 Oak Lane
   - **City**: Beverly Hills
   - **State**: CA
   - **ZIP**: 90210
   - **Purchase Price**: $1,250,000
3. Click **"Create Escrow"**
4. You'll see wiring instructions generated - these would be given to the buyer

**Talking Point**: *"In production, these wiring instructions connect to a real virtual bank account through our banking partner, Bridge.xyz. When the buyer wires funds, they're automatically deposited and start earning yield."*

---

### Step 2: View the Escrow Dashboard

After creating the escrow, you'll be taken to the detail page showing:
- **Escrow Progress** - Visual timeline
- **Demo Mode Controls** - Purple panel for testing
- **Wiring Instructions** - For the buyer
- **Treasury Yield Card** - Shows earnings potential

---

### Step 3: Simulate a Deposit (Demo Mode)

1. In the **Demo Mode Controls** panel (purple):
   - The deposit amount defaults to the purchase price
   - Click **"Simulate"** next to "Simulate Wire Deposit"
2. The status changes from "Awaiting Funds" to "Funds Received"

**Talking Point**: *"In production, this happens automatically when the buyer's wire transfer arrives. The funds are immediately converted to USDM, a dollar-backed token that earns 5% APY from US Treasury investments."*

---

### Step 4: Simulate Yield Accrual

1. In the **Demo Mode Controls** panel:
   - Set days to simulate (e.g., 30, 60, or 90)
   - Click **"Simulate"** next to "Simulate Treasury Yield"
2. Watch the yield amount grow in the green Treasury Yield card

**Talking Point**: *"A typical 60-day escrow on a $1M property earns about $8,200 in interest. That's money that currently goes to banks - we give it back to buyers as a closing cost credit."*

### Yield Calculation Example:
| Purchase Price | Days | APY | Yield Earned |
|----------------|------|-----|--------------|
| $500,000 | 30 | 5% | $2,054 |
| $1,000,000 | 45 | 5% | $6,164 |
| $1,500,000 | 60 | 5% | $12,329 |
| $2,000,000 | 90 | 5% | $24,657 |

---

### Step 5: Add Payees

1. Click the **"Disbursements"** tab
2. Click **"Add Payee"** button
3. Add parties for disbursement:

**Example Payees:**
| Type | Name | Amount | Method |
|------|------|--------|--------|
| Seller | John Smith | $1,150,000 | Wire |
| Listing Agent | ABC Realty | 3% ($37,500) | Wire |
| Buyer's Agent | XYZ Brokers | 2.5% ($31,250) | Wire |
| Title Insurance | First American | $3,500 | ACH |

4. For each, enter:
   - First/Last Name
   - Payee Type
   - Payment method (Wire, ACH, or Check)
   - Amount (fixed or percentage)
   - Bank details (routing number, account number)

**Talking Point**: *"Bank account numbers are never stored in our system. They're immediately tokenized through our banking partner's secure vault. Even if our database were breached, attackers couldn't steal any bank information."*

---

### Step 6: Close the Escrow

1. Once payees are added and funds received, click **"Close Escrow"**
2. Review the summary:
   - Total to payees
   - Buyer yield rebate
   - Platform fee (0.5% of yield)
3. Click **"Initiate Close"**

**Talking Point**: *"The buyer receives the yield earned during escrow as a credit toward closing costs. On a typical transaction, that could be $5,000-$15,000 they didn't expect to save."*

---

## Key Selling Points

### 1. **Invisible Blockchain Technology**
- Users never see crypto terminology
- Authentication uses familiar passkeys (Face ID, Touch ID)
- All complexity is hidden behind a normal fintech interface

### 2. **Zero PII Security**
- We never store bank account numbers
- All sensitive data is tokenized
- SOC 2 compliant banking partner

### 3. **Yield Generation**
- 5% APY on escrow funds (vs 0% at traditional escrow)
- Backed by US Treasury investments
- Buyer gets yield as closing cost credit

### 4. **Transparency**
- Real-time status updates
- Complete audit trail
- Both parties can track progress

---

## FAQ for Demo

**Q: Is this using real money?**
A: No, this is a test environment. No real funds are moved. In production, we integrate with Bridge.xyz for real banking.

**Q: How does the yield work?**
A: Funds are automatically converted to USDM, a stablecoin backed by US Treasury bonds earning ~5% APY. The yield compounds daily.

**Q: Who gets the yield?**
A: The buyer receives it as a closing cost credit (minus 0.5% platform fee). This incentivizes buyers to choose escrow companies using our platform.

**Q: Is this legally compliant?**
A: Yes. We operate as a technology provider to licensed escrow companies. The escrow company remains the licensed entity; we provide the infrastructure.

**Q: What about blockchain volatility?**
A: USDM is pegged 1:1 to USD. There's no exposure to crypto volatility. The blockchain is used purely for security and transparency.

---

## Technical Notes for Demo

- **Mock Mode**: All banking operations use simulated responses
- **Database**: Connected to Supabase PostgreSQL
- **Blockchain**: Base Sepolia testnet (not mainnet)
- **No real funds**: Everything is testnet/sandbox

---

## Troubleshooting

**Page shows "Please sign in"**
- Click "Sign In" in the top-right
- If using a new browser, you'll create a new passkey

**API errors**
- Check that the dev server is running (`npm run dev`)
- Verify database connection in `.env.local`

**Demo controls not appearing**
- Demo controls only show in development mode
- Ensure `NODE_ENV=development` or set `NEXT_PUBLIC_DEMO_MODE=true`

---

*Last updated: December 2024*



