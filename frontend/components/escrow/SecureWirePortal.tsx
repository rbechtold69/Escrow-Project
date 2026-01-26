'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  Shield,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  RefreshCw,
  Phone,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

interface SecureLink {
  id: string;
  token: string;
  status: string;
  expiresAt: string;
  sentAt: string;
  accessedAt: string | null;
  verifiedAt: string | null;
  viewedAt: string | null;
  sentByName: string | null;
  verificationAttempts: number;
  accessLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    ipAddress: string | null;
  }>;
}

interface SecureWirePortalProps {
  escrowId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SENT: {
    label: 'Link Sent',
    color: 'bg-blue-100 text-blue-700',
    icon: <Send className="h-4 w-4" />,
  },
  ACCESSED: {
    label: 'Link Accessed',
    color: 'bg-yellow-100 text-yellow-700',
    icon: <Eye className="h-4 w-4" />,
  },
  VERIFIED: {
    label: 'Verified',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  VIEWED: {
    label: 'Instructions Viewed',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  EXPIRED: {
    label: 'Expired',
    color: 'bg-gray-100 text-gray-600',
    icon: <Clock className="h-4 w-4" />,
  },
  REVOKED: {
    label: 'Revoked',
    color: 'bg-red-100 text-red-700',
    icon: <XCircle className="h-4 w-4" />,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function SecureWirePortal({
  escrowId,
  buyerName,
  buyerEmail,
  buyerPhone,
}: SecureWirePortalProps) {
  const { address } = useAccount();
  const { toast } = useToast();

  const [links, setLinks] = useState<SecureLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoLinkUrl, setDemoLinkUrl] = useState<string | null>(null);

  // Get the active link (most recent non-expired, non-revoked)
  const activeLink = links.find(
    link => !['EXPIRED', 'REVOKED'].includes(link.status) &&
            new Date(link.expiresAt) > new Date()
  );

  // ══════════════════════════════════════════════════════════════════════════
  // FETCH LINKS
  // ══════════════════════════════════════════════════════════════════════════

  const fetchLinks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/escrow/${escrowId}/wire-links`);

      if (!response.ok) {
        // API might not exist yet or escrow has no links
        setLinks([]);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setLinks(data.links || []);
      }
    } catch (err) {
      console.error('Failed to fetch wire links:', err);
      // Don't show error - links might just not exist yet
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, [escrowId]);

  // ══════════════════════════════════════════════════════════════════════════
  // SEND WIRE INSTRUCTIONS
  // ══════════════════════════════════════════════════════════════════════════

  const handleSendInstructions = async () => {
    if (!address) {
      toast({
        title: 'Not connected',
        description: 'Please connect your wallet to send wire instructions.',
        variant: 'destructive',
      });
      return;
    }

    if (!buyerPhone) {
      toast({
        title: 'Phone Required',
        description: 'Buyer phone number is required for secure wire instructions. Please update the escrow details.',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/wire-instructions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId,
          sentByWallet: address,
          sentByName: 'Escrow Officer', // Could get from user profile
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to send wire instructions');
      }

      if (data.demoMode && data.linkUrl) {
        setDemoLinkUrl(data.linkUrl);
        toast({
          title: 'Demo: Wire Instructions Link Generated',
          description: 'Link shown below (email simulated in demo mode)',
        });
      } else {
        toast({
          title: 'Wire Instructions Sent',
          description: `Secure link emailed to ${buyerEmail}`,
        });
      }

      // Refresh links
      await fetchLinks();
    } catch (err: any) {
      setError(err.message || 'Failed to send wire instructions');
      toast({
        title: 'Error',
        description: err.message || 'Failed to send wire instructions',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // REVOKE LINK
  // ══════════════════════════════════════════════════════════════════════════

  const handleRevokeLink = async (token: string) => {
    if (!address) return;

    setIsRevoking(true);

    try {
      const response = await fetch(`/api/wire-instructions/${token}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revokedByWallet: address,
          reason: 'Revoked by officer',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to revoke link');
      }

      toast({
        title: 'Link Revoked',
        description: 'The secure link has been revoked.',
      });

      await fetchLinks();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to revoke link',
        variant: 'destructive',
      });
    } finally {
      setIsRevoking(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-blue-600" />
          Secure Wire Portal
        </CardTitle>
        <CardDescription>
          Send verified wire instructions to the buyer
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Buyer Info */}
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-500">Buyer</p>
              <p className="font-medium text-gray-900">{buyerName}</p>
              <p className="text-gray-600">{buyerEmail}</p>
            </div>
            {buyerPhone ? (
              <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded text-xs">
                <Phone className="h-3 w-3" />
                <span>Verified</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded text-xs">
                <AlertTriangle className="h-3 w-3" />
                <span>No phone</span>
              </div>
            )}
          </div>
        </div>

        {/* No Phone Warning */}
        {!buyerPhone && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              A phone number is required for secure wire instructions.
              Please update the escrow with the buyer's phone number.
            </AlertDescription>
          </Alert>
        )}

        {/* Active Link Status */}
        {activeLink && (
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">Active Link</h4>
              <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[activeLink.status]?.color || 'bg-gray-100'}`}>
                {STATUS_CONFIG[activeLink.status]?.icon}
                {STATUS_CONFIG[activeLink.status]?.label || activeLink.status}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Sent</span>
                <span className="text-gray-900">
                  {new Date(activeLink.sentAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {activeLink.accessedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Accessed</span>
                  <span className="text-gray-900">
                    {new Date(activeLink.accessedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}

              {activeLink.viewedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Viewed</span>
                  <span className="text-green-600 font-medium">
                    {new Date(activeLink.viewedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-500">Expires</span>
                <span className="text-gray-900">
                  {new Date(activeLink.expiresAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {/* Revoke Button */}
            {!['EXPIRED', 'REVOKED'].includes(activeLink.status) && (
              <div className="mt-3 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevokeLink(activeLink.token)}
                  disabled={isRevoking}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {isRevoking ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1" />
                  )}
                  Revoke Link
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Demo Mode Link */}
        {demoLinkUrl && (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded font-medium">DEMO MODE</span>
              <span className="text-sm text-blue-700">Buyer would receive this link via email</span>
            </div>
            <a
              href={demoLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline break-all flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {demoLinkUrl}
            </a>
            <p className="text-xs text-blue-600 mt-2">
              Click to test the buyer verification flow
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Send Button */}
        <Button
          onClick={handleSendInstructions}
          disabled={isSending || !buyerPhone}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isSending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : activeLink ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Resend Wire Instructions
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send Wire Instructions
            </>
          )}
        </Button>

        {/* How it Works */}
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          <p className="font-medium text-gray-700 mb-2">How Secure Wire Portal Works:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Buyer receives email with secure link (no wire details)</li>
            <li>Buyer clicks link and receives SMS verification code</li>
            <li>After verification, wire details are shown</li>
            <li>Buyer receives SMS confirmation with account last 4</li>
          </ol>
        </div>

        {/* Link History */}
        {links.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showHistory ? 'Hide' : 'Show'} Link History ({links.length})
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="border rounded p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${STATUS_CONFIG[link.status]?.color || 'bg-gray-100'}`}>
                        {STATUS_CONFIG[link.status]?.icon}
                        {STATUS_CONFIG[link.status]?.label || link.status}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {new Date(link.sentAt).toLocaleDateString()}
                      </span>
                    </div>
                    {link.viewedAt && (
                      <p className="mt-1 text-green-600 text-xs">
                        Viewed: {new Date(link.viewedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
