/**
 * Validates and sanitizes a redirect destination URL to prevent open redirect vulnerabilities.
 * Strictly enforces same-origin relative paths starting with a single '/' and rejects:
 * - Protocol-relative attempts (e.g. '//attacker.com')
 * - Backslash manipulation (e.g. '\\attacker.com' or '/\\attacker.com')
 * - URL-encoded slashes/backslashes (e.g. '%5c', '%2f%2f')
 * - Protocol schemes (e.g. 'http:', 'https:', 'javascript:', 'data:')
 * - Newline or CRLF injection attempts
 */
export function getSafeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();

  // Reject empty string or strings containing control characters (CR, LF, null)
  if (!trimmed || /[\r\n\t\0]/.test(trimmed)) {
    return fallback;
  }

  // Must begin with a single slash and not a double slash or backslash
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject backslashes in raw or URL-encoded form
  if (trimmed.includes('\\') || /%5c/i.test(trimmed)) {
    return fallback;
  }

  // Reject URL-encoded double slash
  if (/%2f%2f/i.test(trimmed)) {
    return fallback;
  }

  // Reject any explicit protocol scheme
  if (trimmed.includes('://') || /^[a-z0-9+.-]+:/i.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
