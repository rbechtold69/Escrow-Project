-- ============================================================================
-- MIGRATION: Add Bridge.xyz Wallet-as-a-Service Fields
-- ============================================================================
-- 
-- PURPOSE: Enable compliant, non-commingling escrow architecture
-- 
-- COMPLIANCE FIELDS:
-- - bridgeCustomerId: Bridge Customer for KYC
-- - bridgeWalletId: Segregated custodial wallet per deal
-- - bridgeWalletAddress: On-chain address for the segregated wallet
-- - bridgeVirtualAccountId: Virtual account for wire deposits
--
-- ============================================================================

-- Add Bridge Customer ID (represents the Buyer)
ALTER TABLE "Escrow" ADD COLUMN IF NOT EXISTS "bridgeCustomerId" TEXT;

-- Add Segregated Wallet ID (CRITICAL for non-commingling)
ALTER TABLE "Escrow" ADD COLUMN IF NOT EXISTS "bridgeWalletId" TEXT;

-- Add Wallet Address (on-chain address for the segregated wallet)
ALTER TABLE "Escrow" ADD COLUMN IF NOT EXISTS "bridgeWalletAddress" TEXT;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "Escrow_bridgeCustomerId_idx" ON "Escrow"("bridgeCustomerId");
CREATE INDEX IF NOT EXISTS "Escrow_bridgeWalletId_idx" ON "Escrow"("bridgeWalletId");
CREATE INDEX IF NOT EXISTS "Escrow_bridgeVirtualAccountId_idx" ON "Escrow"("bridgeVirtualAccountId");

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify the migration:
-- 
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'Escrow' 
-- AND column_name LIKE 'bridge%';
--
-- Expected output:
-- bridgeCustomerId       | text
-- bridgeWalletId         | text
-- bridgeWalletAddress    | text
-- bridgeVirtualAccountId | text
-- ============================================================================
