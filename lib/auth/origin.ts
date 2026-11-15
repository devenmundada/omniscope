/**
 * Production-Safe Application Origin & Hostname Resolver.
 * Defends against Host Header Poisoning, Password-Reset Poisoning,
 * and malicious open redirects by strictly validating origins.
 */

const LOCALHOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
const VERCEL_DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i;

/**
 * Checks whether a given hostname or host:port string is an authorized host.
 */
export function isAllowedHost(host: string, configuredAppUrl?: string | null): boolean {
  if (!host || typeof host !== 'string') return false;

  const cleanHost = host.trim().toLowerCase();
  // Normalize by stripping default web ports (:80, :443)
  const normalizedHost = cleanHost.replace(/:(?:80|443)$/, '');

  // 1. Localhost development
  if (LOCALHOST_PATTERN.test(cleanHost) || LOCALHOST_PATTERN.test(normalizedHost)) {
    return true;
  }

  // 2. Canonical configured production domain (from APP_URL)
  if (configuredAppUrl) {
    try {
      const parsed = new URL(configuredAppUrl.startsWith('http') ? configuredAppUrl : `https://${configuredAppUrl}`);
      const parsedNormalized = parsed.host.toLowerCase().replace(/:(?:80|443)$/, '');
      if (parsedNormalized === normalizedHost || parsed.host.toLowerCase() === cleanHost) {
        return true;
      }
    } catch {
      // Ignore invalid URL parse
    }
  }

  // 3. Optional comma-separated ALLOWED_HOSTS environment variable
  const envAllowed = process.env.ALLOWED_HOSTS;
  if (envAllowed) {
    const list = envAllowed.split(',').map((h) => h.trim().toLowerCase().replace(/:(?:80|443)$/, ''));
    if (list.includes(normalizedHost) || list.includes(cleanHost)) {
      return true;
    }
  }

  // 4. Vercel deployment and preview subdomains (*.vercel.app)
  // Ensure strict regex: must be a subdomain of vercel.app, never attacker.com.vercel.app.attacker.com
  if (VERCEL_DOMAIN_PATTERN.test(normalizedHost)) {
    return true;
  }

  return false;
}

export interface HeaderReader {
  get(name: string): string | null;
}

export function getCanonicalAppUrl(): string | null {
  const urlStr = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!urlStr || typeof urlStr !== 'string') return null;
  const clean = urlStr.trim();
  try {
    const parsed = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the canonical public application origin.
 * In production:
 * - Strictly enforces canonical APP_URL (or NEXT_PUBLIC_APP_URL).
 * - Always uses validated canonical origin for authentication and recovery links.
 * - Rejects untrusted headers WITHOUT falling back to localhost.
 * In local development:
 * - Dynamically supports localhost development and preview testing.
 * - Safely defaults to http://localhost:3000 when untrusted hosts are rejected.
 */
export function resolveSafeOrigin(
  headerReader?: HeaderReader | null,
  requestUrl?: string | null
): string {
  const isProd = process.env.NODE_ENV === 'production';
  const canonicalUrl = getCanonicalAppUrl();

  // 1. Production Mode: Require and enforce canonical origin
  if (isProd) {
    if (canonicalUrl) {
      // When canonical APP_URL is configured, it is authoritative.
      // Forged client headers (e.g. X-Forwarded-Host: evil.com) are ignored,
      // and we strictly return the validated production canonical origin.
      return canonicalUrl;
    }

    // In production without APP_URL: allow ONLY verified deployment domains (e.g. *.vercel.app)
    if (headerReader) {
      const forwardedHost = headerReader.get('x-forwarded-host');
      const directHost = headerReader.get('host');
      const candidateHost = forwardedHost || directHost;

      if (candidateHost && isAllowedHost(candidateHost, null)) {
        const proto = headerReader.get('x-forwarded-proto') || 'https';
        return `${proto}://${candidateHost.trim().replace(/:(?:80|443)$/, '')}`;
      }
    }

    if (requestUrl) {
      try {
        const parsed = new URL(requestUrl);
        if (isAllowedHost(parsed.host, null)) {
          return parsed.origin;
        }
      } catch {
        // Ignore invalid URL
      }
    }

    // Refuse to fall back to localhost in production
    throw new Error(
      'Production configuration error: A valid canonical APP_URL is required in production environments. Refusing to fall back to localhost.'
    );
  }

  // 2. Development Mode: Dynamic Host Inspection with Strict Whitelist
  if (headerReader) {
    const forwardedHost = headerReader.get('x-forwarded-host');
    const directHost = headerReader.get('host');
    const candidateHost = forwardedHost || directHost;

    if (candidateHost && isAllowedHost(candidateHost, canonicalUrl)) {
      const forwardedProto = headerReader.get('x-forwarded-proto');
      const isLocal = LOCALHOST_PATTERN.test(candidateHost.trim());
      const proto = forwardedProto || (isLocal ? 'http' : 'https');
      return `${proto}://${candidateHost.trim()}`;
    }
  }

  // 3. Fallback from Request URL in Development
  if (requestUrl) {
    try {
      const parsed = new URL(requestUrl);
      if (isAllowedHost(parsed.host, canonicalUrl)) {
        return parsed.origin;
      }
    } catch {
      // Ignore invalid URL
    }
  }

  // 4. If canonical URL was configured in development, use it
  if (canonicalUrl) {
    return canonicalUrl;
  }

  // 5. Development Safe Fallback
  return 'http://localhost:3000';
}
