/**
 * ============================================================================
 * SMS SERVICE - Twilio Integration
 * ============================================================================
 *
 * Handles all SMS communications for secure wire instruction portal:
 * - Send verification codes for identity confirmation
 * - Send out-of-band account confirmation (last 4 digits)
 *
 * SECURITY:
 * - Codes are 6-digit random numbers using crypto.randomInt()
 * - Phone numbers validated in E.164 format
 * - All SMS activity logged for audit
 *
 * ============================================================================
 */

import { randomInt } from 'crypto';

// Twilio client - lazy loaded to handle missing credentials gracefully
let twilioClient: any = null;

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Get or initialize the Twilio client
 */
function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('[SMS] Twilio credentials not configured - SMS will be simulated');
    return null;
  }

  try {
    // Dynamic import to avoid build errors if twilio isn't installed
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    return twilioClient;
  } catch (error) {
    console.error('[SMS] Failed to initialize Twilio client:', error);
    return null;
  }
}

/**
 * SMS Service class for wire instruction verification
 */
export class SMSService {
  private fromNumber: string;

  constructor() {
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
  }

  /**
   * Send a 6-digit verification code to the buyer
   */
  async sendVerificationCode(
    phone: string,
    code: string,
    escrowId: string
  ): Promise<SMSResult> {
    const formattedPhone = SMSService.validatePhoneNumber(phone);
    if (!formattedPhone.valid || !formattedPhone.formatted) {
      return { success: false, error: 'Invalid phone number format' };
    }

    const message = `Your EscrowPayi verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share this code with anyone.\n\nRef: ${escrowId}`;

    return this.sendSMS(formattedPhone.formatted, message);
  }

  /**
   * Send out-of-band account confirmation with last 4 digits
   * This is sent AFTER verification, when instructions are viewed
   */
  async sendAccountConfirmation(
    phone: string,
    accountLast4: string,
    bankName: string,
    escrowId: string
  ): Promise<SMSResult> {
    const formattedPhone = SMSService.validatePhoneNumber(phone);
    if (!formattedPhone.valid || !formattedPhone.formatted) {
      return { success: false, error: 'Invalid phone number format' };
    }

    const message = `WIRE CONFIRMATION - EscrowPayi\n\nYou just viewed wire instructions for ${escrowId}.\n\nVerify the account ends in: ${accountLast4}\nBank: ${bankName}\n\nIf you did NOT request this, call us immediately.`;

    return this.sendSMS(formattedPhone.formatted, message);
  }

  /**
   * Send an SMS message via Twilio
   */
  private async sendSMS(to: string, body: string): Promise<SMSResult> {
    const client = getTwilioClient();

    // If no Twilio client, simulate success for development
    if (!client) {
      console.log('[SMS] SIMULATED message to', to);
      console.log('[SMS] Message:', body);
      return {
        success: true,
        messageId: `sim_${Date.now()}`,
      };
    }

    if (!this.fromNumber) {
      return { success: false, error: 'Twilio phone number not configured' };
    }

    try {
      const message = await client.messages.create({
        body,
        from: this.fromNumber,
        to,
      });

      console.log(`[SMS] Message sent: ${message.sid} to ${to}`);

      return {
        success: true,
        messageId: message.sid,
      };
    } catch (error: any) {
      console.error('[SMS] Failed to send:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to send SMS',
      };
    }
  }

  /**
   * Validate and format a phone number to E.164 format
   * Accepts: (555) 123-4567, 555-123-4567, 5551234567, +15551234567
   * Returns: +15551234567
   */
  static validatePhoneNumber(phone: string): { valid: boolean; formatted?: string } {
    if (!phone) {
      return { valid: false };
    }

    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // If starts with +, keep it
    if (cleaned.startsWith('+')) {
      // Already in international format
      if (cleaned.length === 12 && cleaned.startsWith('+1')) {
        return { valid: true, formatted: cleaned };
      }
      // Other international formats - validate length
      if (cleaned.length >= 10 && cleaned.length <= 15) {
        return { valid: true, formatted: cleaned };
      }
      return { valid: false };
    }

    // Remove any leading 1 for US numbers
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = cleaned.substring(1);
    }

    // US number: should be 10 digits
    if (cleaned.length === 10) {
      return { valid: true, formatted: `+1${cleaned}` };
    }

    return { valid: false };
  }

  /**
   * Generate a cryptographically secure 6-digit verification code
   */
  static generateVerificationCode(): string {
    // Generate random number between 100000 and 999999
    const code = randomInt(100000, 1000000);
    return code.toString();
  }
}

/**
 * Singleton instance for convenience
 */
export const smsService = new SMSService();
