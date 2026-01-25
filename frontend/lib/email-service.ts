/**
 * ============================================================================
 * EMAIL SERVICE - Resend Integration
 * ============================================================================
 *
 * Handles all email communications for secure wire instruction portal:
 * - Send secure wire instruction links to buyers
 * - Notify officers when buyers view instructions
 *
 * SECURITY:
 * - Never sends actual wire details in email
 * - Only sends time-limited secure links
 * - Uses branded templates for fraud prevention
 *
 * ============================================================================
 */

// Resend client - lazy loaded
let resendClient: any = null;

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface WireInstructionLinkParams {
  toEmail: string;
  buyerName: string;
  escrowId: string;
  propertyAddress: string;
  linkUrl: string;
  expiresAt: Date;
  officerName?: string;
  companyName?: string;
}

interface ViewNotificationParams {
  officerEmail: string;
  buyerName: string;
  escrowId: string;
  propertyAddress: string;
  viewedAt: Date;
  buyerPhone?: string;
}

/**
 * Get or initialize the Resend client
 */
function getResendClient() {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[Email] Resend API key not configured - emails will be simulated');
    return null;
  }

  try {
    const { Resend } = require('resend');
    resendClient = new Resend(apiKey);
    return resendClient;
  } catch (error) {
    console.error('[Email] Failed to initialize Resend client:', error);
    return null;
  }
}

/**
 * Email Service class for wire instruction communications
 */
export class EmailService {
  private fromAddress: string;
  private fromName: string;

  constructor() {
    this.fromAddress = process.env.EMAIL_FROM_ADDRESS || 'wiring@escrowpayi.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'EscrowPayi';
  }

  /**
   * Send wire instruction link email to buyer
   * IMPORTANT: This email does NOT contain actual wire details
   */
  async sendWireInstructionLink(params: WireInstructionLinkParams): Promise<EmailResult> {
    const {
      toEmail,
      buyerName,
      escrowId,
      propertyAddress,
      linkUrl,
      expiresAt,
      officerName = 'Your Escrow Officer',
      companyName = 'EscrowPayi',
    } = params;

    const expiresFormatted = expiresAt.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const subject = `Wire Instructions Ready - ${escrowId}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wire Instructions</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0066cc 0%, #004499 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Wire Instructions Ready</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">${companyName}</p>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="font-size: 16px; margin-top: 0;">Hello ${buyerName},</p>

    <p>Your wire instructions for the following property are ready:</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Escrow ID:</strong> ${escrowId}</p>
      <p style="margin: 0;"><strong>Property:</strong> ${propertyAddress}</p>
    </div>

    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-weight: 600; color: #856404;">
        ⚠️ Security Notice
      </p>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #856404;">
        For your protection, wire details are NOT included in this email.
        You must verify your identity via SMS to view them.
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${linkUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 15px 40px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
        View Wire Instructions
      </a>
    </div>

    <p style="font-size: 14px; color: #666; text-align: center;">
      This secure link expires on:<br>
      <strong>${expiresFormatted}</strong>
    </p>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px;">
      <p style="margin: 0 0 10px 0; font-weight: 600;">How it works:</p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #666;">
        <li style="margin-bottom: 8px;">Click the button above to access the secure portal</li>
        <li style="margin-bottom: 8px;">Enter the verification code sent to your phone</li>
        <li style="margin-bottom: 8px;">View and verify your wire instructions</li>
        <li>You'll receive an SMS confirmation with account details</li>
      </ol>
    </div>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

    <p style="font-size: 14px; color: #666;">
      If you did not request wire instructions or have any concerns, please contact
      ${officerName} immediately.
    </p>

    <p style="font-size: 14px; color: #666; margin-bottom: 0;">
      Best regards,<br>
      ${officerName}<br>
      ${companyName}
    </p>
  </div>

  <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 12px 12px; text-align: center; font-size: 12px; color: #666;">
    <p style="margin: 0 0 10px 0;">
      <strong>Never send funds based on email instructions alone.</strong>
    </p>
    <p style="margin: 0;">
      Always verify wire details through the secure portal and SMS confirmation.
    </p>
  </div>
</body>
</html>
    `.trim();

    const text = `
Wire Instructions Ready - ${escrowId}

Hello ${buyerName},

Your wire instructions for the following property are ready:

Escrow ID: ${escrowId}
Property: ${propertyAddress}

SECURITY NOTICE: Wire details are NOT included in this email. You must verify your identity via SMS to view them.

View your wire instructions here:
${linkUrl}

This secure link expires on: ${expiresFormatted}

How it works:
1. Click the link above to access the secure portal
2. Enter the verification code sent to your phone
3. View and verify your wire instructions
4. You'll receive an SMS confirmation with account details

If you did not request wire instructions or have any concerns, please contact ${officerName} immediately.

Best regards,
${officerName}
${companyName}

---
Never send funds based on email instructions alone.
Always verify wire details through the secure portal and SMS confirmation.
    `.trim();

    return this.sendEmail({
      to: toEmail,
      subject,
      html,
      text,
    });
  }

  /**
   * Notify officer when buyer views wire instructions
   */
  async sendViewNotification(params: ViewNotificationParams): Promise<EmailResult> {
    const {
      officerEmail,
      buyerName,
      escrowId,
      propertyAddress,
      viewedAt,
      buyerPhone,
    } = params;

    const viewedFormatted = viewedAt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const subject = `Wire Instructions Viewed - ${escrowId}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Wire Instructions Viewed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #28a745; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">✓ Wire Instructions Viewed</h1>
  </div>

  <div style="background: #ffffff; padding: 25px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin-top: 0;">The buyer has successfully verified their identity and viewed the wire instructions.</p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Escrow:</strong> ${escrowId}</p>
      <p style="margin: 0 0 8px 0;"><strong>Property:</strong> ${propertyAddress}</p>
      <p style="margin: 0 0 8px 0;"><strong>Buyer:</strong> ${buyerName}</p>
      ${buyerPhone ? `<p style="margin: 0 0 8px 0;"><strong>Phone:</strong> ${buyerPhone}</p>` : ''}
      <p style="margin: 0;"><strong>Viewed At:</strong> ${viewedFormatted}</p>
    </div>

    <p style="font-size: 14px; color: #666;">
      The buyer also received an SMS confirmation with the account's last 4 digits for verification.
    </p>
  </div>
</body>
</html>
    `.trim();

    const text = `
Wire Instructions Viewed - ${escrowId}

The buyer has successfully verified their identity and viewed the wire instructions.

Escrow: ${escrowId}
Property: ${propertyAddress}
Buyer: ${buyerName}
${buyerPhone ? `Phone: ${buyerPhone}` : ''}
Viewed At: ${viewedFormatted}

The buyer also received an SMS confirmation with the account's last 4 digits for verification.
    `.trim();

    return this.sendEmail({
      to: officerEmail,
      subject,
      html,
      text,
    });
  }

  /**
   * Send an email via Resend
   */
  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<EmailResult> {
    const client = getResendClient();

    // If no Resend client, simulate success for development
    if (!client) {
      console.log('[Email] SIMULATED email to', params.to);
      console.log('[Email] Subject:', params.subject);
      return {
        success: true,
        messageId: `sim_${Date.now()}`,
      };
    }

    try {
      const response = await client.emails.send({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      console.log(`[Email] Message sent: ${response.id} to ${params.to}`);

      return {
        success: true,
        messageId: response.id,
      };
    } catch (error: any) {
      console.error('[Email] Failed to send:', error.message);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const emailService = new EmailService();
