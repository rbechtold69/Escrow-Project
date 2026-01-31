'use client';

import React, { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Activity {
  id: string;
  action: string;
  description: string;
  icon: string;
  category: string;
  details: Record<string, any>;
  timestamp: string;
  formattedTime: string;
  timeAgo: string;
  actorWallet?: string;
}

interface ActivityLogProps {
  escrowId: string;
}

export function ActivityLog({ escrowId }: ActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/escrow/${escrowId}/activity`);
      if (!res.ok) throw new Error('Failed to fetch activities');
      const data = await res.json();
      setActivities(data.activities || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [escrowId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchActivities}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Activity Log</CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchActivities}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg">
                  {activity.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">{activity.timeAgo}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {activity.category}
                    </span>
                  </div>
                  {activity.actorWallet && (
                    <p className="text-xs text-slate-400 mt-1 font-mono truncate">
                      by {activity.actorWallet.slice(0, 6)}...{activity.actorWallet.slice(-4)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
