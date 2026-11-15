import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSafeRedirect } from '@/lib/supabase/safe-redirect';
import { resolveSafeOrigin } from '@/lib/auth/origin';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  const destination = getSafeRedirect(rawNext, '/');

  const origin = resolveSafeOrigin(request.headers, request.url);

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Failed to exchange code for session:', error.message);
        return NextResponse.redirect(
          `${origin}/auth/login?error=${encodeURIComponent(
            'Verification link expired or invalid. Please sign in or request a new link.'
          )}`
        );
      }
    } catch (err) {
      console.error('Error during auth callback session exchange:', err);
      return NextResponse.redirect(
        `${origin}/auth/login?error=${encodeURIComponent(
          'Verification failed. Please request a new verification email.'
        )}`
      );
    }
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
