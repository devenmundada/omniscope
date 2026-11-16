'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Lock, LogOut, LogIn, UserPlus, Loader2, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { signOutAction } from '@/app/auth/actions';
import { isSupabaseConfigured } from '@/lib/env';
import type { User } from '@supabase/supabase-js';

export function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = createClient();

    // Fetch initial user
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      router.refresh();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = () => {
    startTransition(async () => {
      await signOutAction();
    });
  };

  if (loading) {
    return (
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 animate-pulse">
          <div className="size-9 rounded-full bg-sidebar-accent" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-24 bg-sidebar-accent rounded" />
            <div className="h-2 w-16 bg-sidebar-accent rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Signed In state
  if (user) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      user.email?.split('@')[0] ||
      'Investor';

    const initials = fullName
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return (
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
            {initials || 'OS'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-0.5 px-2">
          <Link
            href="/profile"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 flex items-center gap-2"
          >
            <UserCog className="size-3.5" /> Financial Profile
          </Link>
          <Link
            href="/methodology"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 flex items-center gap-2"
          >
            <ShieldCheck className="size-3.5" /> How OmniScope works
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isPending}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors py-1.5 flex items-center gap-2 text-left w-full mt-1 border-t border-border/40 pt-2"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <LogOut className="size-3.5" />
            )}
            <span>Sign out</span>
          </button>
        </div>
      </div>
    );
  }

  // Signed Out / Guest state
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="px-2 py-1 mb-2">
        <p className="text-xs font-medium text-foreground">Welcome to OmniScope</p>
        <p className="text-[11px] text-muted-foreground">Sign in to sync your wealth</p>
      </div>

      <div className="flex flex-col gap-1.5 px-2">
        <Link
          href="/auth/login"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          <LogIn className="size-3.5" />
          <span>Sign in</span>
        </Link>
        <Link
          href="/auth/sign-up"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          <UserPlus className="size-3.5" />
          <span>Create account</span>
        </Link>
        <Link
          href="/methodology"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1 flex items-center gap-1.5 justify-center mt-1"
        >
          <Lock className="size-3" /> How it works
        </Link>
      </div>
    </div>
  );
}
