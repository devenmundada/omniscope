'use client';

import { useActionState, useState, use } from 'react';
import Link from 'next/link';
import { Sparkles, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { signUpAction, type AuthActionResult } from '@/app/auth/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const resolvedParams = use(searchParams);
  const nextPath = resolvedParams.next || '/';

  const [state, formAction, isPending] = useActionState(signUpAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // If email confirmation is required by Supabase Auth
  if (state?.requiresEmailVerification) {
    return (
      <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center py-10 px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <Mail className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
            Check your email
          </h1>
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 text-left space-y-4 shadow-sm">
            <p className="text-sm text-foreground leading-relaxed">
              We&apos;ve sent an activation link to{' '}
              <strong className="text-foreground font-medium">{state.email}</strong>.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Click the link in the email to verify your address and unlock your personal OmniScope
              financial workspace. If you don&apos;t see it within a minute, check your spam or promotions folder.
            </p>
            <div className="pt-2">
              <Link
                href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
                className={cn(buttonVariants(), 'w-full h-10 gap-2')}
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center py-10 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md mb-2">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
            Start Your Financial Journey
          </h1>
          <p className="text-sm text-muted-foreground">
            Create your private OmniScope account to track, analyze, and grow your wealth
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 sm:p-8 shadow-sm">
          {state?.error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />

            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs font-medium text-foreground">
                Full name
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                placeholder="Rohan Sharma"
                className="h-10 text-sm"
              />
            </div>

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
                placeholder="rohan@example.com"
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-foreground">
                Password (min. 8 characters)
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
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

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-xs font-medium text-foreground">
                Confirm password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="h-10 text-sm"
              />
              {password && confirmPassword && password !== confirmPassword && (
                <p className="text-[11px] text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isPending || (Boolean(password && confirmPassword) && password !== confirmPassword)}
              className="w-full h-10 gap-2 text-sm font-medium mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border/60 text-center">
            <p className="text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link
                href={nextPath !== '/' ? `/auth/login?next=${encodeURIComponent(nextPath)}` : '/auth/login'}
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Security pledge */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-500" />
          <span>Zero third-party data tracking & local Indian isolation</span>
        </div>
      </div>
    </div>
  );
}
