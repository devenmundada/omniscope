import { z } from 'zod';

/**
 * OmniScope Environment Variable Schema & Validation Engine.
 * Enforces strict separation:
 * - Public variables MUST use NEXT_PUBLIC_* and MUST NOT contain secrets.
 * - Server credentials (DATABASE_URL, CRON_SECRET, MARKET_DATA_API_KEY) MUST remain server-side.
 * - Never introduces fallback credentials or fake production tokens.
 */

export function getSupabaseUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  if (!rawUrl) return '';

  if (rawUrl.includes('supabase.com/dashboard/project/')) {
    const match = rawUrl.match(/project\/([a-z0-9_-]+)/i);
    if (match && match[1]) {
      return `https://${match[1]}.supabase.co`;
    }
  }

  let cleaned = rawUrl.replace(/\/+$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned;
}

export function getSupabaseKey(): string {
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  let cleaned = rawKey.trim();
  cleaned = cleaned.replace(/^[=\s"']+/, '');
  cleaned = cleaned.replace(/["'\s]+$/, '');
  return cleaned;
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return false;
  return !url.includes('placeholder.supabase.co') && key !== 'placeholder-anon-key' && key.length >= 10;
}

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  MARKET_DATA_API_KEY: z.string().min(1).optional(),
  APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export interface ProductionEnvValidationResult {
  isValid: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  securityViolations: string[];
  warnings: string[];
}

/**
 * Validates the live environment configuration for production safety.
 * Never prints secret values; only reports variable names.
 */
export function validateProductionEnv(): ProductionEnvValidationResult {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const securityViolations: string[] = [];
  const warnings: string[] = [];

  // 1. Mandatory Database Connection
  if (!process.env.DATABASE_URL) {
    missingRequired.push('DATABASE_URL');
  } else if (
    !process.env.DATABASE_URL.startsWith('postgres://') &&
    !process.env.DATABASE_URL.startsWith('postgresql://')
  ) {
    securityViolations.push('DATABASE_URL must be a valid postgresql:// or postgres:// URI');
  }

  // 2. Mandatory Supabase Client Credentials
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missingRequired.push('NEXT_PUBLIC_SUPABASE_URL');
  } else if (!process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://')) {
    warnings.push('NEXT_PUBLIC_SUPABASE_URL should use HTTPS in production');
  }

  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    missingRequired.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  } else if (supabaseKey === 'placeholder-anon-key' || supabaseKey.length < 10) {
    securityViolations.push('Supabase key is using a placeholder token');
  }

  // 3. Canonical Application Origin (Mandatory in Production)
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!appUrl) {
    if (isProduction) {
      missingRequired.push('APP_URL (canonical production origin is mandatory in production)');
    } else {
      missingRecommended.push('APP_URL (canonical origin, defaults to localhost:3000 in development)');
    }
  } else {
    try {
      const parsed = new URL(appUrl.startsWith('http') ? appUrl : `https://${appUrl}`);
      if (isProduction && parsed.protocol !== 'https:') {
        securityViolations.push('APP_URL must use HTTPS protocol in production');
      }
    } catch {
      securityViolations.push('APP_URL must be a valid absolute URL (e.g. https://<project>.vercel.app)');
    }
  }

  // 4. Recommended Production Variables
  if (!process.env.CRON_SECRET) {
    missingRecommended.push('CRON_SECRET (required for authenticated market-data sync cron endpoints)');
  }

  if (!process.env.MARKET_DATA_API_KEY) {
    warnings.push('MARKET_DATA_API_KEY is unconfigured. Twelve Data live EOD quotes will be unavailable; AMFI daily NAVs remain active.');
  }

  // 5. Critical Security Checks: Ensure secrets are NEVER prefixed with NEXT_PUBLIC_
  const sensitiveNames = ['DATABASE_URL', 'CRON_SECRET', 'MARKET_DATA_API_KEY', 'SERVICE_ROLE_KEY', 'SECRET_KEY'];
  for (const name of sensitiveNames) {
    if (process.env[`NEXT_PUBLIC_${name}`]) {
      securityViolations.push(
        `Critical Security Violation: NEXT_PUBLIC_${name} detected! Secrets must NEVER use the NEXT_PUBLIC_ prefix.`
      );
    }
  }

  const isValid = missingRequired.length === 0 && securityViolations.length === 0;

  return {
    isValid,
    missingRequired,
    missingRecommended,
    securityViolations,
    warnings,
  };
}

const parsedEnv = baseEnvSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  MARKET_DATA_API_KEY: process.env.MARKET_DATA_API_KEY,
  APP_URL: process.env.APP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export const env = parsedEnv.success
  ? parsedEnv.data
  : {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      CRON_SECRET: process.env.CRON_SECRET,
      MARKET_DATA_API_KEY: process.env.MARKET_DATA_API_KEY,
      APP_URL: process.env.APP_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    };
