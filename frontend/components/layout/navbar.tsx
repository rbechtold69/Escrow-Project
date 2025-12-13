'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Building2, LogOut, ChevronDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Navbar() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  // Prevent hydration mismatch by only rendering wallet state after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleConnect = () => {
    const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWalletSDK');
    if (coinbaseConnector) {
      connect({ connector: coinbaseConnector });
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">EscrowBase</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-6">
            <Link 
              href="/" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Dashboard
            </Link>
            <Link 
              href="/escrow/new" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              New Escrow
            </Link>
            <Link 
              href="/settings" 
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Settings
            </Link>
          </div>

          {/* Account Connection */}
          <div className="flex items-center gap-4">
            {!mounted ? (
              // Placeholder while mounting to prevent hydration mismatch
              <div className="h-10 w-24 bg-gray-100 animate-pulse rounded-md" />
            ) : isConnected && address ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm">My Account</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">Signed In</p>
                    <p className="text-xs text-gray-500 mt-1">Account active</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <User className="h-4 w-4 mr-2" />
                      Account Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => disconnect()}
                    className="text-red-600 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                onClick={handleConnect}
                disabled={isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isPending ? 'Signing in...' : 'Sign In'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
