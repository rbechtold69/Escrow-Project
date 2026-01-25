/**
 * ============================================================================
 * SECURE WIRE LINK SERVICE
 * ============================================================================
 *
 * Core service for managing secure wire instruction links:
 * - Generate secure, time-limited tokens
 * - Send verification emails and SMS codes
 * - Verify buyer identity before revealing wire details
 * - Send out-of-band confirmations
 * - Full audit logging
 *
 * SECURITY FEATURES:
 * - UUID v4 tokens (128 bits of entropy)
 * - SHA-256 hashed verification codes
 * - Rate limiting (5 attempts max)
 * - Link expiration (default 72 hours)
 * - Full audit trail
 *
 * ============================================================================
 */

import { randomUUID, createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { SMSService, smsService } from '@/lib/sms-service';
import { emailService } from '@/lib/email-service';
import { getBridgeClient, formatWiringInstructions } from '@/lib/bridge-client';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateLinkParams {
  escrowId: string;
  sentByWallet: string;
  sentByName?: string;
}

export interface CreateLinkResult {
  success: boolean;
  linkId?: string;
  token?: string;
  expiresAt?: Date;
  error?: string;
}

export interface LinkStatus {
  success: boolean;
  link?: {
    id: string;
    token: string;
    status: string;
    expiresAt: Date;
    isExpired: boolean;
    accessedAt: Date | null;
    verifiedAt: Date | null;
    viewedAt: Date | null;
    attemptsRemaining: number;
  };
  escrow?: {
    id: string;
    escrowId: string;
    propertyAddress: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string | null;
  };
  error?: string;
}

export interface VerifyCodeResult {
  success: boolean;
  verified?: boolean;
  attemptsRemaining?: number;
  locked?: boolean;
  error?: string;
}

export interface WireInstructions {
  bankName: string;
  bankAddress: string;
  routingNumber: string;
  accountNumber: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  reference: string;
  swiftCode?: string;
  accountLast4: string;
}

export interface GetInstructionsResult {
  success: boolean;
  instructions?: WireInstructions;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  linkExpirationHours: parseInt(process.env.WIRE_LINK_EXPIRATION_HOURS || '72', 10),
  codeExpiryMinutes: parseInt(process.env.VERIFICATION_CODE_EXPIRY_MINUTES || '10', 10),
  maxVerificationAttempts: parseInt(process.env.MAX_VERIFICATION_ATTEMPTS || '5', 10),
  maxCodeResends: 3,
  codeResendWindowMinutes: 15,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Hash a verification code using SHA-256
 */
function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Log an action to the audit trail
 */
async function logAction(
  linkId: string,
  action: string,
  ipAddress?: string,
  userAgent?: string,
  details?: Record<string, any>
) {
  try {
    await prisma.wireLinkAccessLog.create({
      data: {
        linkId,
        action: action as any, // Prisma enum
        ipAddress,
        userAgent,
        details: details || undefined,
      },
    });
  } catch (error) {
    console.error('[SecureLinkService] Failed to log action:', error);
  }
}

// ============================================================================
// SECURE LINK SERVICE CLASS
// ============================================================================

export class SecureLinkService {
  /**
   * Create a new secure wire instruction link
   * - Generates unique token
   * - Sends email to buyer
   * - Logs the action
   */
  async createLink(params: CreateLinkParams): Promise<CreateLinkResult> {
    const { escrowId, sentByWallet, sentByName } = params;

    try {
      // 1. Fetch the escrow
      const escrow = await prisma.escrow.findFirst({
        where: { escrowId },
        include: { createdBy: true },
      });

      if (!escrow) {
        return { success: false, error: 'Escrow not found' };
      }

      if (!escrow.buyerPhone) {
        return { success: false, error: 'Buyer phone number is required for secure wire links' };
      }

      // 2. Revoke any existing active links for this escrow
      await prisma.secureWireLink.updateMany({
        where: {
          escrowId: escrow.id,
          status: { in: ['SENT', 'ACCESSED', 'VERIFIED'] },
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByWallet: sentByWallet,
          revokedReason: 'New link generated',
        },
      });

      // 3. Generate secure token and expiration
      const token = randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + CONFIG.linkExpirationHours);

      // 4. Create the link in database
      const link = await prisma.secureWireLink.create({
        data: {
          token,
          status: 'SENT',
          expiresAt,
          escrowId: escrow.id,
          sentByWallet,
          sentByName,
        },
      });

      // 5. Log the action
      await logAction(link.id, 'LINK_CREATED', undefined, undefined, {
        escrowId: escrow.escrowId,
        buyerEmail: escrow.buyerEmail,
        expiresAt: expiresAt.toISOString(),
      });

      // 6. Send email to buyer
      const baseUrl = process.env.WIRE_PORTAL_BASE_URL || 'http://localhost:3000/verify-wire';
      const linkUrl = `${baseUrl}/${token}`;

      const emailResult = await emailService.sendWireInstructionLink({
        toEmail: escrow.buyerEmail,
        buyerName: `${escrow.buyerFirstName} ${escrow.buyerLastName}`,
        escrowId: escrow.escrowId,
        propertyAddress: `${escrow.propertyAddress}, ${escrow.city}, ${escrow.state} ${escrow.zipCode}`,
        linkUrl,
        expiresAt,
        officerName: sentByName || 'Your Escrow Officer',
      });

      if (!emailResult.success) {
        console.error('[SecureLinkService] Failed to send email:', emailResult.error);
        // Don't fail the whole operation - link is still valid
      }

      return {
        success: true,
        linkId: link.id,
        token,
        expiresAt,
      };
    } catch (error: any) {
      console.error('[SecureLinkService] createLink error:', error);
      return { success: false, error: error.message || 'Failed to create link' };
    }
  }

  /**
   * Get link status and escrow info by token
   * Used for the buyer verification page
   */
  async getLink(token: string, ipAddress?: string, userAgent?: string): Promise<LinkStatus> {
    try {
      const link = await prisma.secureWireLink.findUnique({
        where: { token },
        include: {
          escrow: true,
        },
      });

      if (!link) {
        return { success: false, error: 'Link not found' };
      }

      const now = new Date();
      const isExpired = now > link.expiresAt;

      // Check if link is expired or revoked
      if (link.status === 'REVOKED') {
        return { success: false, error: 'This link has been revoked' };
      }

      if (isExpired && link.status !== 'EXPIRED') {
        // Update status to expired
        await prisma.secureWireLink.update({
          where: { id: link.id },
          data: { status: 'EXPIRED' },
        });
        await logAction(link.id, 'LINK_EXPIRED', ipAddress, userAgent);
        return { success: false, error: 'This link has expired' };
      }

      // If first access, update status and log
      if (link.status === 'SENT' && !link.accessedAt) {
        await prisma.secureWireLink.update({
          where: { id: link.id },
          data: {
            status: 'ACCESSED',
            accessedAt: now,
          },
        });
        await logAction(link.id, 'LINK_ACCESSED', ipAddress, userAgent);
      }

      const attemptsRemaining = CONFIG.maxVerificationAttempts - link.verificationAttempts;

      return {
        success: true,
        link: {
          id: link.id,
          token: link.token,
          status: link.status,
          expiresAt: link.expiresAt,
          isExpired,
          accessedAt: link.accessedAt,
          verifiedAt: link.verifiedAt,
          viewedAt: link.viewedAt,
          attemptsRemaining: Math.max(0, attemptsRemaining),
        },
        escrow: {
          id: link.escrow.id,
          escrowId: link.escrow.escrowId,
          propertyAddress: `${link.escrow.propertyAddress}, ${link.escrow.city}, ${link.escrow.state} ${link.escrow.zipCode}`,
          buyerName: `${link.escrow.buyerFirstName} ${link.escrow.buyerLastName}`,
          buyerEmail: link.escrow.buyerEmail,
          buyerPhone: link.escrow.buyerPhone,
        },
      };
    } catch (error: any) {
      console.error('[SecureLinkService] getLink error:', error);
      return { success: false, error: error.message || 'Failed to get link' };
    }
  }

  /**
   * Request a verification code
   * Generates and sends SMS verification code
   */
  async requestVerificationCode(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; expiresAt?: Date; error?: string }> {
    try {
      const linkStatus = await this.getLink(token, ipAddress, userAgent);
      if (!linkStatus.success || !linkStatus.link || !linkStatus.escrow) {
        return { success: false, error: linkStatus.error || 'Invalid link' };
      }

      const { link, escrow } = linkStatus;

      // Check if locked out
      if (link.attemptsRemaining <= 0) {
        await logAction(link.id, 'CODE_LOCKED', ipAddress, userAgent);
        return { success: false, error: 'Too many verification attempts. Please contact your escrow officer.' };
      }

      if (!escrow.buyerPhone) {
        return { success: false, error: 'No phone number on file' };
      }

      // Generate verification code
      const code = SMSService.generateVerificationCode();
      const codeHash = hashCode(code);
      const codeExpiresAt = new Date();
      codeExpiresAt.setMinutes(codeExpiresAt.getMinutes() + CONFIG.codeExpiryMinutes);

      // Store hashed code
      await prisma.secureWireLink.update({
        where: { token },
        data: {
          verificationCodeHash: codeHash,
          verificationCodeExpiresAt: codeExpiresAt,
        },
      });

      // Send SMS
      const smsResult = await smsService.sendVerificationCode(
        escrow.buyerPhone,
        code,
        escrow.escrowId
      );

      if (!smsResult.success) {
        return { success: false, error: 'Failed to send verification code. Please try again.' };
      }

      await logAction(link.id, 'CODE_REQUESTED', ipAddress, userAgent, {
        phoneLastFour: escrow.buyerPhone.slice(-4),
      });

      return {
        success: true,
        expiresAt: codeExpiresAt,
      };
    } catch (error: any) {
      console.error('[SecureLinkService] requestVerificationCode error:', error);
      return { success: false, error: error.message || 'Failed to send verification code' };
    }
  }

  /**
   * Verify an SMS code
   * Rate limited to prevent brute force
   */
  async verifyCode(
    token: string,
    code: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<VerifyCodeResult> {
    try {
      const link = await prisma.secureWireLink.findUnique({
        where: { token },
      });

      if (!link) {
        return { success: false, error: 'Link not found' };
      }

      // Check if locked
      if (link.verificationAttempts >= CONFIG.maxVerificationAttempts) {
        return { success: false, verified: false, locked: true, attemptsRemaining: 0 };
      }

      // Check if code exists and hasn't expired
      if (!link.verificationCodeHash || !link.verificationCodeExpiresAt) {
        return { success: false, error: 'Please request a new verification code' };
      }

      if (new Date() > link.verificationCodeExpiresAt) {
        return { success: false, error: 'Verification code has expired. Please request a new one.' };
      }

      // Verify the code
      const codeHash = hashCode(code);
      const isValid = codeHash === link.verificationCodeHash;

      // Increment attempts
      const newAttempts = link.verificationAttempts + 1;
      const attemptsRemaining = CONFIG.maxVerificationAttempts - newAttempts;

      if (isValid) {
        // Success! Update link status
        await prisma.secureWireLink.update({
          where: { token },
          data: {
            status: 'VERIFIED',
            verifiedAt: new Date(),
            verificationAttempts: newAttempts,
            verificationCodeHash: null, // Clear the code
            verificationCodeExpiresAt: null,
          },
        });

        await logAction(link.id, 'CODE_VERIFIED', ipAddress, userAgent);

        return { success: true, verified: true, attemptsRemaining };
      } else {
        // Failed attempt
        await prisma.secureWireLink.update({
          where: { token },
          data: {
            verificationAttempts: newAttempts,
          },
        });

        const isNowLocked = attemptsRemaining <= 0;
        await logAction(link.id, isNowLocked ? 'CODE_LOCKED' : 'CODE_FAILED', ipAddress, userAgent, {
          attemptsRemaining,
        });

        return {
          success: true,
          verified: false,
          attemptsRemaining,
          locked: isNowLocked,
        };
      }
    } catch (error: any) {
      console.error('[SecureLinkService] verifyCode error:', error);
      return { success: false, error: error.message || 'Verification failed' };
    }
  }

  /**
   * Get wire instructions (only after verification)
   * Also sends out-of-band SMS confirmation
   */
  async getWireInstructions(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<GetInstructionsResult> {
    try {
      const link = await prisma.secureWireLink.findUnique({
        where: { token },
        include: { escrow: true },
      });

      if (!link) {
        return { success: false, error: 'Link not found' };
      }

      // Must be verified
      if (link.status !== 'VERIFIED' && link.status !== 'VIEWED') {
        return { success: false, error: 'Verification required' };
      }

      // Check expiration
      if (new Date() > link.expiresAt) {
        return { success: false, error: 'Link has expired' };
      }

      // Get wire instructions from Bridge or use demo data
      let instructions: WireInstructions;

      if (link.escrow.bridgeVirtualAccountId) {
        try {
          const bridge = getBridgeClient();
          // In production, we'd fetch the virtual account details from Bridge
          // For now, we'll construct from stored data
          instructions = {
            bankName: 'Lead Bank',
            bankAddress: '1801 Main St., Kansas City, MO 64108',
            routingNumber: '101019644',
            accountNumber: `${link.escrow.bridgeVirtualAccountId}`,
            beneficiaryName: `EscrowPayi FBO ${link.escrow.buyerFirstName} ${link.escrow.buyerLastName}`,
            beneficiaryAddress: `${link.escrow.propertyAddress}, ${link.escrow.city}, ${link.escrow.state} ${link.escrow.zipCode}`,
            reference: link.escrow.escrowId,
            swiftCode: 'LEABOREA',
            accountLast4: link.escrow.bridgeVirtualAccountId.slice(-4),
          };
        } catch (error) {
          console.error('[SecureLinkService] Bridge fetch error, using demo data');
          instructions = this.getDemoInstructions(link.escrow);
        }
      } else {
        instructions = this.getDemoInstructions(link.escrow);
      }

      // Mark as viewed and log
      const isFirstView = link.status !== 'VIEWED';

      await prisma.secureWireLink.update({
        where: { token },
        data: {
          status: 'VIEWED',
          viewedAt: isFirstView ? new Date() : link.viewedAt,
        },
      });

      await logAction(link.id, 'INSTRUCTIONS_VIEWED', ipAddress, userAgent);

      // Send out-of-band SMS confirmation on first view
      if (isFirstView && link.escrow.buyerPhone) {
        const smsResult = await smsService.sendAccountConfirmation(
          link.escrow.buyerPhone,
          instructions.accountLast4,
          instructions.bankName,
          link.escrow.escrowId
        );

        if (smsResult.success) {
          await logAction(link.id, 'CONFIRMATION_SENT', ipAddress, userAgent, {
            accountLast4: instructions.accountLast4,
          });
        }

        // Notify the escrow officer
        const officer = await prisma.user.findUnique({
          where: { id: link.escrow.createdById },
        });

        if (officer?.email) {
          await emailService.sendViewNotification({
            officerEmail: officer.email,
            buyerName: `${link.escrow.buyerFirstName} ${link.escrow.buyerLastName}`,
            escrowId: link.escrow.escrowId,
            propertyAddress: `${link.escrow.propertyAddress}, ${link.escrow.city}, ${link.escrow.state} ${link.escrow.zipCode}`,
            viewedAt: new Date(),
            buyerPhone: link.escrow.buyerPhone || undefined,
          });
        }
      }

      return { success: true, instructions };
    } catch (error: any) {
      console.error('[SecureLinkService] getWireInstructions error:', error);
      return { success: false, error: error.message || 'Failed to get instructions' };
    }
  }

  /**
   * Get demo wire instructions for development/testing
   */
  private getDemoInstructions(escrow: any): WireInstructions {
    const demoAccountNumber = `DEMO-${escrow.escrowId.replace('ESC-', '')}`;
    return {
      bankName: 'Lead Bank (Demo Mode)',
      bankAddress: '1801 Main St., Kansas City, MO 64108',
      routingNumber: '101019644',
      accountNumber: demoAccountNumber,
      beneficiaryName: `EscrowPayi FBO ${escrow.buyerFirstName} ${escrow.buyerLastName}`,
      beneficiaryAddress: `${escrow.propertyAddress}, ${escrow.city}, ${escrow.state} ${escrow.zipCode}`,
      reference: escrow.escrowId,
      swiftCode: 'LEABOREA',
      accountLast4: demoAccountNumber.slice(-4),
    };
  }

  /**
   * Revoke a link (officer action)
   */
  async revokeLink(
    token: string,
    revokedByWallet: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const link = await prisma.secureWireLink.findUnique({
        where: { token },
      });

      if (!link) {
        return { success: false, error: 'Link not found' };
      }

      if (link.status === 'REVOKED' || link.status === 'EXPIRED') {
        return { success: false, error: 'Link is already inactive' };
      }

      await prisma.secureWireLink.update({
        where: { token },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByWallet,
          revokedReason: reason || 'Revoked by officer',
        },
      });

      await logAction(link.id, 'LINK_REVOKED', undefined, undefined, {
        revokedBy: revokedByWallet,
        reason,
      });

      return { success: true };
    } catch (error: any) {
      console.error('[SecureLinkService] revokeLink error:', error);
      return { success: false, error: error.message || 'Failed to revoke link' };
    }
  }

  /**
   * Get all links for an escrow (for dashboard)
   */
  async getLinksForEscrow(escrowId: string) {
    try {
      const escrow = await prisma.escrow.findFirst({
        where: { escrowId },
      });

      if (!escrow) {
        return { success: false, error: 'Escrow not found' };
      }

      const links = await prisma.secureWireLink.findMany({
        where: { escrowId: escrow.id },
        orderBy: { sentAt: 'desc' },
        include: {
          accessLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      return { success: true, links };
    } catch (error: any) {
      console.error('[SecureLinkService] getLinksForEscrow error:', error);
      return { success: false, error: error.message || 'Failed to get links' };
    }
  }
}

/**
 * Singleton instance
 */
export const secureLinkService = new SecureLinkService();
