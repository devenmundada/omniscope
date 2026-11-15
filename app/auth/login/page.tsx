'use client';

import { useActionState, useState, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { signInAction, type AuthActionResult } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const resolvedParams = use(searchParams);
  const nextPath = resolvedParams.next || '/';
  const urlError = resolvedParams.error;

  const [state, formAction, isPending] = useActionState(signInAction, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center py-10 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md mb-2">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
            Welcome back to OmniScope
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your personal financial operating system
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 sm:p-8 shadow-sm">
          {urlError && !state?.error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{urlError}</span>
            </div>
          )}

          {state?.error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-medium text-foreground">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@domain.com"
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-medium text-foreground">
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="h-10 pr-10 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-10 gap-2 text-sm font-medium mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border/60 text-center">
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                href={nextPath !== '/' ? `/auth/sign-up?next=${encodeURIComponent(nextPath)}` : '/auth/sign-up'}
                className="font-medium text-primary hover:underline"
              >
                Create one now
              </Link>
            </p>
          </div>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-500" />
          <span>Bank-grade encryption & SEBI data privacy principles</span>
        </div>
      </div>
    </div>
  );
}
