'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect } from 'wagmi';
import { 
  Plus, 
  Search, 
  Building2, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Shield,
  Zap,
  Users,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type EscrowStatus = 'CREATED' | 'FUNDS_RECEIVED' | 'READY_TO_CLOSE' | 'CLOSED' | 'CANCELLED';

interface Escrow {
  id: string;
  propertyAddress: string;
  purchasePrice: number;
  status: EscrowStatus;
  createdAt: string;
  safeAddress: string;
  currentBalance?: number;
  payeeCount: number;
}

const statusConfig: Record<EscrowStatus, { label: string; color: string; icon: React.ElementType }> = {
  CREATED: { label: 'Awaiting Funds', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  FUNDS_RECEIVED: { label: 'Funded', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  READY_TO_CLOSE: { label: 'Ready to Close', color: 'bg-blue-100 text-blue-800', icon: AlertCircle },
  CLOSED: { label: 'Closed', color: 'bg-gray-100 text-gray-800', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const [mounted, setMounted] = useState(false);
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    totalEscrows: 0,
    activeEscrows: 0,
    totalValue: 0,
    pendingClose: 0,
  });

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isConnected && address) {
      fetchEscrows();
    } else if (mounted && !isConnected) {
      setIsLoading(false);
    }
  }, [mounted, isConnected, address]);

  const fetchEscrows = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/escrow/list');
      if (response.ok) {
        const data = await response.json();
        setEscrows(data.escrows);
        
        // Calculate stats
        const active = data.escrows.filter((e: Escrow) => 
          e.status !== 'CLOSED' && e.status !== 'CANCELLED'
        );
        const totalValue = data.escrows.reduce((sum: number, e: Escrow) => sum + e.purchasePrice, 0);
        const pending = data.escrows.filter((e: Escrow) => e.status === 'READY_TO_CLOSE');
        
        setStats({
          totalEscrows: data.escrows.length,
          activeEscrows: active.length,
          totalValue,
          pendingClose: pending.length,
        });
      }
    } catch (error) {
      console.error('Failed to fetch escrows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEscrows = escrows.filter(escrow =>
    escrow.propertyAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
    escrow.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleSignIn = () => {
    const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWalletSDK');
    if (coinbaseConnector) {
      connect({ connector: coinbaseConnector });
    }
  };

  // Show loading state until mounted
  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48 mx-auto" />
          <div className="h-4 bg-gray-200 rounded w-64 mx-auto" />
        </div>
      </div>
    );
  }

  // ====================================================
  // LANDING PAGE - Show when NOT logged in
  // ====================================================
  if (!isConnected) {
    return (
      <div className="min-h-[80vh] flex flex-col">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-12">
          {/* Large Logo with Company Name */}
          <div className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src="/logo.png" 
              alt="EscrowPayi - Modern Real Estate Escrow" 
              className="h-48 md:h-64 lg:h-72 w-auto mx-auto"
            />
          </div>

          <Badge className="mb-6 bg-cyan-100 text-cyan-700 hover:bg-cyan-100">
            <Zap className="h-3 w-3 mr-1" />
            Instant Digital Settlement
          </Badge>
          
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-4 max-w-2xl">
            Real Estate Escrow <span className="text-[#00b4d8]">Reimagined</span>
          </h2>
          
          <p className="text-lg text-gray-600 max-w-2xl mb-10">
            Secure, transparent escrow management with instant settlement. 
            Close faster, reduce wire fraud, and keep all parties informed in real-time.
          </p>

          {/* Auth Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <Button 
              size="lg" 
              onClick={handleSignIn}
              disabled={isPending}
              className="bg-[#0a1a3a] hover:bg-[#0d2347] text-lg px-10 py-6 shadow-lg"
            >
              {isPending ? 'Connecting...' : 'Sign In'}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={handleSignIn}
              disabled={isPending}
              className="text-lg px-10 py-6 border-2 border-[#00b4d8] text-[#00b4d8] hover:bg-[#00b4d8] hover:text-white shadow-lg"
            >
              Create Account
            </Button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
            <Card className="text-left border-t-4 border-t-[#00b4d8]">
              <CardHeader className="pb-3">
                <div className="p-2 bg-cyan-100 rounded-lg w-fit mb-2">
                  <Zap className="h-5 w-5 text-cyan-600" />
                </div>
                <CardTitle className="text-lg">Instant Settlement</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm">
                  Close in minutes, not days. Digital disbursements 
                  eliminate wire delays and reduce fraud risk.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left border-t-4 border-t-[#0a1a3a]">
              <CardHeader className="pb-3">
                <div className="p-2 bg-blue-100 rounded-lg w-fit mb-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-lg">Bank-Grade Security</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm">
                  We never store bank account numbers. Multi-approval 
                  security ensures no single point of failure.
                </p>
              </CardContent>
            </Card>

            <Card className="text-left border-t-4 border-t-[#00b4d8]">
              <CardHeader className="pb-3">
                <div className="p-2 bg-purple-100 rounded-lg w-fit mb-2">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle className="text-lg">Complete Transparency</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 text-sm">
                  Real-time status updates for all parties. Track funds, 
                  payees, and disbursements from anywhere.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="border-t py-8 text-center text-gray-500 text-sm">
          <p>Trusted by escrow professionals across the country</p>
          <div className="flex justify-center items-center gap-8 mt-4 text-gray-400">
            <span>🔒 Bank-Grade Security</span>
            <span>⚡ Instant Settlement</span>
            <span>👁️ Full Transparency</span>
          </div>
        </div>
      </div>
    );
  }

  // ====================================================
  // DASHBOARD - Show when logged in
  // ====================================================
  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Escrows</CardDescription>
            <CardTitle className="text-3xl">{stats.totalEscrows}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Escrows</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.activeEscrows}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Value</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(stats.totalValue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Close</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.pendingClose}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by property address or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Link href="/escrow/new">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            New Escrow
          </Button>
        </Link>
      </div>

      {/* Escrow List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Escrows</CardTitle>
          <CardDescription>
            Manage all your property escrows in one place
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-20 bg-gray-100 rounded-lg" />
                </div>
              ))}
            </div>
          ) : filteredEscrows.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No escrows found</h3>
              <p className="text-gray-600 mb-4">
                {searchQuery 
                  ? "No escrows match your search criteria" 
                  : "Get started by creating your first escrow"}
              </p>
              {!searchQuery && (
                <Link href="/escrow/new">
                  <Button>Create Escrow</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filteredEscrows.map((escrow) => {
                const StatusIcon = statusConfig[escrow.status].icon;
                return (
                  <Link 
                    key={escrow.id} 
                    href={`/escrow/${escrow.id}`}
                    className="block py-4 hover:bg-gray-50 -mx-6 px-6 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {escrow.propertyAddress}
                          </h4>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3.5 w-3.5" />
                              {formatCurrency(escrow.purchasePrice)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDate(escrow.createdAt)}
                            </span>
                            <span>{escrow.payeeCount} payees</span>
                          </div>
                        </div>
                      </div>
                      <Badge className={statusConfig[escrow.status].color}>
                        <StatusIcon className="h-3.5 w-3.5 mr-1" />
                        {statusConfig[escrow.status].label}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
