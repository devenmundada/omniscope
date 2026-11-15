import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/lib/db';
import { users, type User } from '@/lib/db/schema';
import { isSupabaseConfigured } from '@/lib/env';
import type { User as AuthUser } from '@supabase/supabase-js';

export interface AuthenticatedUserSession {
  authUser: AuthUser;
  profile: User;
}

/**
 * Returns the currently authenticated user and their synchronized public application profile.
 * Uses `supabase.auth.getUser()` to strictly validate the session token against the Supabase Auth server.
 * Returns null if the user is unauthenticated or if Supabase is not configured.
 */
export async function getCurrentUser(): Promise<AuthenticatedUserSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (error || !authUser || !authUser.email) {
      return null;
    }

    // Lookup profile in public.users using verified auth user id
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1);

    if (existing.length > 0) {
      return {
        authUser,
        profile: existing[0],
      };
    }

    // Self-healing provisioning fallback if database trigger has not run yet
    const name =
      (authUser.user_metadata?.full_name as string | undefined) ||
      (authUser.user_metadata?.name as string | undefined) ||
      authUser.email.split('@')[0];

    const [createdProfile] = await db
      .insert(users)
      .values({
        id: authUser.id,
        email: authUser.email,
        name,
        image: (authUser.user_metadata?.avatar_url as string | undefined) || null,
        emailVerified: authUser.email_confirmed_at ? new Date(authUser.email_confirmed_at) : null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: authUser.email,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      authUser,
      profile: createdProfile,
    };
  } catch (err) {
    console.error('Failed to resolve current user session:', err);
    return null;
  }
}

/**
 * Ensures the requesting context has a valid authenticated identity.
 * If unauthenticated, safely redirects to the sign-in page preserving the next destination.
 */
export async function requireUser(nextPath?: string): Promise<AuthenticatedUserSession> {
  const session = await getCurrentUser();
  if (!session) {
    const dest = nextPath ? `/auth/login?next=${encodeURIComponent(nextPath)}` : '/auth/login';
    redirect(dest);
  }
  return session;
}
