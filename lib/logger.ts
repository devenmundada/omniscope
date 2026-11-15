/**
 * Server-side Logging Utility with Automatic Secret & PII Redaction.
 * Ensures credentials, database connection strings, JWT tokens, API keys,
 * and personal email addresses are never written to production logs.
 */

const REDACTION_PATTERNS = [
  // Database connection strings
  { pattern: /postgres(ql)?:\/\/[^\s"'`]+/gi, replacement: '[DATABASE_URL_REDACTED]' },
  // Bearer authentication tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  // JWT tokens (standard header.payload.sig)
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gi, replacement: '[REDACTED_JWT]' },
  // URL query parameter secrets
  { pattern: /([?&](?:apikey|key|secret|token|password|auth)=)[^&\s"'`]+/gi, replacement: '$1[REDACTED]' },
  // JSON key secret values
  { pattern: /("(?:password|secret|apiKey|api_key|token|accessToken|access_token|refreshToken|refresh_token)":\s*")[^"]+(")/gi, replacement: '$1[REDACTED]$2' },
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, replacement: '[EMAIL_REDACTED]' },
];

export function redactSecrets(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    let result = input;
    for (const { pattern, replacement } of REDACTION_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  if (input instanceof Error) {
    const sanitizedError = new Error(redactSecrets(input.message) as string);
    sanitizedError.name = input.name;
    if (input.stack) {
      sanitizedError.stack = redactSecrets(input.stack) as string;
    }
    return sanitizedError;
  }

  if (Array.isArray(input)) {
    return input.map(redactSecrets);
  }

  if (typeof input === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      if (/password|secret|token|apikey|key/i.test(key) && typeof val === 'string') {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = redactSecrets(val);
      }
    }
    return sanitizedObj;
  }

  return input;
}

export const logger = {
  info(message: string, ...args: unknown[]) {
    const sanitizedMsg = redactSecrets(message);
    const sanitizedArgs = args.map(redactSecrets);
    console.log(`[INFO] ${sanitizedMsg}`, ...sanitizedArgs);
  },

  warn(message: string, ...args: unknown[]) {
    const sanitizedMsg = redactSecrets(message);
    const sanitizedArgs = args.map(redactSecrets);
    console.warn(`[WARN] ${sanitizedMsg}`, ...sanitizedArgs);
  },

  error(message: string, ...args: unknown[]) {
    const sanitizedMsg = redactSecrets(message);
    const sanitizedArgs = args.map(redactSecrets);
    console.error(`[ERROR] ${sanitizedMsg}`, ...sanitizedArgs);
  },
};
