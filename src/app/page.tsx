'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkoutOutboxStore } from '@/stores/workoutOutboxStore';

export default function HomePage() {
  const router = useRouter();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    (async () => {
      let supabase;
      try {
        supabase = createClient();
      } catch {
        // Supabase not configured — fall back to login
        router.replace('/login');
        return;
      }

      // Already signed in? Go straight to dashboard.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.replace('/dashboard');
        return;
      }

      // Auto-start demo mode
      try {
        const res = await fetch('/api/demo', { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          router.replace('/login');
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (error) {
          router.replace('/login');
          return;
        }

        useWorkoutOutboxStore.getState().clear();
        router.replace('/dashboard');
      } catch {
        router.replace('/login');
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">reps</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    </div>
  );
}
