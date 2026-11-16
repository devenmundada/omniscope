import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, getSupabaseUrl, getSupabaseKey } from './config';
import { getSafeRedirect } from './safe-redirect';

// Protected personal financial workspace paths
const PROTECTED_PREFIXES = [
  '/portfolio',
  '/x-ray',
  '/risk',
  '/health',
  '/goals',
  '/mentor',
  '/dna',
  '/journey',
  '/future',
  '/profile',
  '/api/chat',
];

// Auth paths where an already logged-in user should be redirected to dashboard
const AUTH_ROUTES = ['/auth/login', '/auth/sign-up', '/auth/forgot-password'];

export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // If Supabase is not configured yet, allow navigation while notifying
  if (!isSupabaseConfigured()) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseKey();

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    // IMPORTANT: Avoid using getSession() on server side; getUser() securely revalidates with Auth server
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch (err) {
    console.error('Session update warning in proxy:', err instanceof Error ? err.message : err);
  }

  const isProtectedPath = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Unauthenticated user attempting to access a protected workspace route
  if (!user && isProtectedPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    const target = `${pathname}${search}`;
    redirectUrl.searchParams.set('next', getSafeRedirect(target, '/'));
    return NextResponse.redirect(redirectUrl);
  }

  // Authenticated user attempting to access sign-in or sign-up pages
  if (user && isAuthRoute) {
    const rawNext = request.nextUrl.searchParams.get('next');
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = getSafeRedirect(rawNext, '/');
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
