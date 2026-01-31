import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============================================================
// GET /api/escrow/[id]/activity
// Fetch activity log for a specific escrow
// ============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const escrowId = params.id;
    
    // Find escrow first
    const escrow = await prisma.escrow.findFirst({
      where: {
        OR: [
          { escrowId: escrowId },
          { id: escrowId },
        ],
      },
    });
    
    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      );
    }
    
    // Fetch activity logs
    const activities = await prisma.activityLog.findMany({
      where: {
        escrowId: escrow.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    // Format activities for display
    const formattedActivities = activities.map(activity => {
      const details = activity.details as any;
      
      // Generate human-readable description based on action
      let description = '';
      let icon = '📋';
      let category = 'General';
      
      switch (activity.action) {
        case 'ESCROW_CREATED':
          description = 'Escrow account created';
          icon = '🆕';
          category = 'Lifecycle';
          break;
        case 'PAYEE_ADDED':
          description = `Payee added: ${details?.payeeName || 'Unknown'}`;
          icon = '👤';
          category = 'Disbursements';
          break;
        case 'PAYEE_REMOVED':
          description = `Payee removed: ${details?.payeeName || 'Unknown'}`;
          icon = '❌';
          category = 'Disbursements';
          break;
        case 'PAYEE_UPDATED':
          description = `Payee updated: ${details?.payeeName || 'Unknown'}`;
          icon = '✏️';
          category = 'Disbursements';
          break;
        case 'FUNDS_RECEIVED':
          description = `Deposit received: $${details?.amount?.toLocaleString() || '0'}`;
          icon = '💰';
          category = 'Funding';
          break;
        case 'YIELD_ACCRUED':
          description = `Interest earned: $${details?.yieldAmount?.toLocaleString() || '0'}`;
          icon = '📈';
          category = 'Funding';
          break;
        case 'ESCROW_CLOSED':
          description = 'Escrow closed - all funds disbursed';
          icon = '🎉';
          category = 'Lifecycle';
          break;
        case 'WIRE_LINK_CREATED':
          description = 'Secure wire instructions link created';
          icon = '🔐';
          category = 'Security';
          break;
        case 'WIRE_LINK_ACCESSED':
          description = `Wire instructions accessed by ${details?.accessorPhone || 'buyer'}`;
          icon = '👁️';
          category = 'Security';
          break;
        case 'SIGNATURE_REQUESTED':
          description = 'Multisig approval requested';
          icon = '✍️';
          category = 'Approvals';
          break;
        case 'SIGNATURE_ADDED':
          description = `Approved by ${details?.signerRole || 'officer'}`;
          icon = '✅';
          category = 'Approvals';
          break;
        default:
          description = activity.action.replace(/_/g, ' ').toLowerCase();
          icon = '📋';
          category = 'General';
      }
      
      return {
        id: activity.id,
        action: activity.action,
        description,
        icon,
        category,
        details: details || {},
        timestamp: activity.createdAt,
        formattedTime: new Date(activity.createdAt).toLocaleString(),
        timeAgo: getTimeAgo(activity.createdAt),
        actorWallet: activity.actorWallet,
      };
    });
    
    // Group activities by date
    const groupedActivities = groupByDate(formattedActivities);
    
    return NextResponse.json({
      activities: formattedActivities,
      groupedByDate: groupedActivities,
      totalCount: activities.length,
    });
    
  } catch (error: any) {
    console.error('[GET_ACTIVITY] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity log' },
      { status: 500 }
    );
  }
}

// Helper function to format time ago
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
}

// Helper function to group activities by date
function groupByDate(activities: any[]) {
  const groups: { [key: string]: any[] } = {};
  
  activities.forEach(activity => {
    const dateKey = new Date(activity.timestamp).toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(activity);
  });
  
  return groups;
}