'use client';

import { useEffect } from 'react';
import Pusher from 'pusher-js';

let pusherInstance: Pusher | null = null;

function getPusher() {
  if (!pusherInstance && typeof window !== 'undefined') {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2';
    
    if (key) {
      pusherInstance = new Pusher(key, {
        cluster,
      });
    }
  }
  return pusherInstance;
}

export function usePusher(
  channelName: string,
  events: Record<string, (data: any) => void>
) {
  useEffect(() => {
    const pusher = getPusher();
    if (!pusher) return;

    const channel = pusher.subscribe(channelName);

    Object.entries(events).forEach(([eventName, handler]) => {
      channel.bind(eventName, handler);
    });

    return () => {
      Object.entries(events).forEach(([eventName, handler]) => {
        channel.unbind(eventName, handler);
      });
      pusher.unsubscribe(channelName);
    };
  }, [channelName, events]);
}
