'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { getSafeRedirect } from '@/lib/supabase/safe-redirect';

import { resolveSafeOrigin } from '@/lib/auth/origin';

export interface AuthActionResult {
  success?: boolean;
  error?: string;
  message?: string;
  requiresEmailVerification?: boolean;
  email?: string;
}

function formatAuthError(error: unknown): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const errObj = error as { message?: string; name?: string; status?: number };
  const message = errObj.message || String(error);

  // Catch HTML responses or JSON parsing errors from misconfigured endpoints
  if (
    message.includes('Unexpected token') ||
    message.includes('is not valid JSON') ||
    errObj.name === 'AuthRetryableFetchError'
  ) {
    return 'Authentication connection error. Please verify that your NEXT_PUBLIC_SUPABASE_URL in .env.local points to your Project API URL (https://<project-ref>.supabase.co) and not a dashboard link.';
  }

  // Catch Invalid API key errors
  if (message.includes('Invalid API key') || errObj.status === 401) {
    return 'Invalid Supabase API key. Please check your NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or anon key in .env.local.';
  }

  // Common user-friendly Auth error mappings
  if (message.includes('Invalid login credentials')) {
    return 'Incorrect email or password. Please verify your details.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Your email has not been verified yet. Please check your inbox for the confirmation link.';
  }
  if (message.includes('User already registered')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (message.includes('Password should be at least')) {
    return 'Password is too weak. Please use at least 8 characters.';
  }

  return message;
}

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  return resolveSafeOrigin(headerList);
}

export async function signInAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        'Supabase authentication is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env.local file.',
    };
  }

  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;
  const next = formData.get('next') as string;

  if (!email || !password) {
    return { error: 'Please enter both your email address and password.' };
  }

  let destination: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: formatAuthError(error) };
    }

    destination = getSafeRedirect(next, '/');
  } catch (err) {
    return { error: formatAuthError(err) };
  }

  if (destination) {
    redirect(destination);
  }

  return { success: true };
}

export async function signUpAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        'Supabase authentication is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env.local file.',
    };
  }

  const name = (formData.get('name') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const next = formData.get('next') as string;

  if (!name || name.length < 2) {
    return { error: 'Please enter your full name (minimum 2 characters).' };
  }

  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' };
  }

  if (!password || password.length < 8) {
    return { error: 'Password must be at least 8 characters long.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match. Please re-enter carefully.' };
  }

  let destination: string | null = null;
  try {
    const origin = await getOrigin();
    const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(getSafeRedirect(next, '/'))}`;

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          name,
        },
        emailRedirectTo: callbackUrl,
      },
    });

    if (error) {
      return { error: formatAuthError(error) };
    }

    // If email confirmation is required, Supabase returns a user without an active session
    if (data.user && !data.session) {
      return {
        success: true,
        requiresEmailVerification: true,
        email,
        message:
          'Registration successful! We have sent a verification link to your email. Please click the link to activate your OmniScope account.',
      };
    }

    // If email confirmation is disabled in Supabase, the user is signed in directly
    destination = getSafeRedirect(next, '/');
  } catch (err) {
    return { error: formatAuthError(err) };
  }

  if (destination) {
    redirect(destination);
  }

  return { success: true };
}

export async function forgotPasswordAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        'Supabase authentication is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env.local file.',
    };
  }

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { error: 'Please enter a valid email address.' };
  }

  try {
    const origin = await getOrigin();
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}`;

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return { error: formatAuthError(error) };
    }

    return {
      success: true,
      email,
      message: 'If an account exists with this email, a password recovery link has been sent.',
    };
  } catch (err) {
    return { error: formatAuthError(err) };
  }
}

export async function resetPasswordAction(
  _prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        'Supabase authentication is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env.local file.',
    };
  }

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || password.length < 8) {
    return { error: 'New password must be at least 8 characters long.' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      return { error: formatAuthError(error) };
    }

    return {
      success: true,
      message: 'Your password has been successfully reset. You may now continue to your workspace.',
    };
  } catch (err) {
    return { error: formatAuthError(err) };
  }
}

export async function signOutAction(): Promise<void> {
  try {
    if (isSupabaseConfigured()) {
      const supabase = await createClient();
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.error('Error during signOut:', err);
  }
  redirect('/auth/login');
}
