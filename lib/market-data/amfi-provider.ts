import type { MarketQuote } from './types';
import type { Instrument } from '@/lib/db/schema';

const AMFI_NAV_URL = 'https://www.amfiindia.com/spages/NAVAll.txt';
const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parses an AMFI date string (e.g., '15-Oct-2026') into a UTC Date object.
 */
export function parseAmfiDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const monthStr = parts[1].toLowerCase().slice(0, 3);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(year) || !(monthStr in MONTH_MAP)) {
    return null;
  }

  const month = MONTH_MAP[monthStr];
  // Construct date at UTC midnight
  const date = new Date(Date.UTC(year, month, day, 18, 0, 0)); // AMFI published around 23:30 IST (18:00 UTC)
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Fetches and parses official daily NAVs from AMFI India.
 */
export async function fetchAmfiNavs(
  targetInstruments: Instrument[],
  options: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<{ quotes: MarketQuote[]; errors: string[]; totalAmfiRecords: number }> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetries = options.maxRetries ?? 2;

  // Build lookup index by amfiCode and by isin
  const codeMap = new Map<string, Instrument>();
  const isinMap = new Map<string, Instrument>();

  for (const inst of targetInstruments) {
    if (inst.amfiCode) {
      codeMap.set(inst.amfiCode.trim(), inst);
    }
    if (inst.isin) {
      isinMap.set(inst.isin.trim().toUpperCase(), inst);
    }
  }

  let textData = '';
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(AMFI_NAV_URL, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Omniscope-Financial/1.0 (Retail Investor Portfolio Valuation Engine)',
          Accept: 'text/plain',
        },
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`AMFI server responded with HTTP status ${response.status}`);
      }

      textData = await response.text();
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt <= maxRetries) {
        // Exponential backoff
        await new Promise((res) => setTimeout(res, attempt * 1000));
      }
    }
  }

  if (!textData) {
    throw new Error(
      `Failed to retrieve AMFI NAV feed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown network error'}`
    );
  }

  const lines = textData.split(/\r?\n/);
  const quotes: MarketQuote[] = [];
  const errors: string[] = [];
  const matchedInstrumentIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.includes(';')) continue;

    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 5) continue;

    const schemeCode = parts[0];
    const isinGrowth = parts[1]?.toUpperCase();
    const isinDiv = parts[2]?.toUpperCase();

    // Check if this scheme matches any of our target instruments
    const matchedInst =
      codeMap.get(schemeCode) ||
      (isinGrowth && isinMap.get(isinGrowth)) ||
      (isinDiv && isinMap.get(isinDiv));

    if (!matchedInst) continue;
    if (matchedInstrumentIds.has(matchedInst.id)) continue; // Already matched latest

    // AMFI line format:
    // Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
    // In all variations, Date is the last part, Net Asset Value is the second to last part.
    const rawNav = parts[parts.length - 2];
    const rawDate = parts[parts.length - 1];

    const nav = parseFloat(rawNav);
    if (isNaN(nav) || nav <= 0) {
      errors.push(`Invalid NAV "${rawNav}" for scheme ${matchedInst.symbol} (${schemeCode}) on line ${i + 1}`);
      continue;
    }

    const priceTimestamp = parseAmfiDate(rawDate) || new Date();

    quotes.push({
      instrumentId: matchedInst.id,
      symbol: matchedInst.symbol,
      price: nav,
      currency: matchedInst.currency || 'INR',
      priceTimestamp,
      source: 'AMFI',
      priceType: 'NAV',
      isRealtime: false,
      metadata: {
        amfiSchemeCode: schemeCode,
        amfiSchemeName: parts[3],
        asOfDateString: rawDate,
        isin: isinGrowth !== '-' ? isinGrowth : matchedInst.isin,
      },
    });

    matchedInstrumentIds.add(matchedInst.id);
  }

  return {
    quotes,
    errors,
    totalAmfiRecords: lines.length,
  };
}
