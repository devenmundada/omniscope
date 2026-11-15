'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { resetPasswordAction } from '@/app/auth/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export default function ResetPasswordPage() {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  return (
    <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center py-10 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md mb-2">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
            Create new password
          </h1>
          <p className="text-sm text-muted-foreground">
            Please choose a strong password to secure your financial workspace
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-6 sm:p-8 shadow-sm">
          {state?.error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {state?.success ? (
            <div className="space-y-4 text-center py-2">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {state.message}
              </p>
              <div className="pt-2">
                <Link
                  href="/"
                  className={cn(buttonVariants(), 'w-full h-10 gap-2')}
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-medium text-foreground">
                  New password (min. 8 characters)
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
                    placeholder="Enter new password"
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
                  Confirm new password
                </label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
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
                    <span>Updating password...</span>
                  </>
                ) : (
                  <>
                    <span>Update password</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
