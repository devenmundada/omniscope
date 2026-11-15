'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Sparkles, Loader2, AlertCircle, ArrowRight, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { forgotPasswordAction } from '@/app/auth/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, null);

  return (
    <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center py-10 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md mb-2">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-serif">
            Reset your password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your registered email and we&apos;ll send you instructions to recover your account
          </p>
        </div>

        {/* Card */}
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
              <p className="text-xs text-muted-foreground">
                Please check your inbox and click the reset link within 1 hour.
              </p>
              <div className="pt-2">
                <Link
                  href="/auth/login"
                  className={cn(buttonVariants({ variant: 'outline' }), 'w-full h-10 gap-2')}
                >
                  <ArrowLeft className="size-4" />
                  <span>Back to sign in</span>
                </Link>
              </div>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
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

              <Button
                type="submit"
                disabled={isPending}
                className="w-full h-10 gap-2 text-sm font-medium mt-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>Sending reset link...</span>
                  </>
                ) : (
                  <>
                    <span>Send recovery link</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>

              <div className="pt-4 text-center">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Return to sign in</span>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
