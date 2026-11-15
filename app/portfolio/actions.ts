'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import {
  getUserHoldings,
  getUserAccounts,
  getInstrumentsCatalog,
  calculatePortfolioSummary,
  addOrUpdateHolding,
  deleteHolding,
  createAccount,
  ensureDefaultAccount,
  validateCsvRows,
  executeTransactionalCsvImport,
  type UserHoldingView,
  type PortfolioSummaryStats,
  type CsvImportValidationResult,
} from '@/lib/db/portfolio';
import type { Account, Instrument } from '@/lib/db/schema';
import { syncAllMarketPrices } from '@/lib/market-data/sync-service';
import { z } from 'zod';

export interface PortfolioDataResult {
  success?: boolean;
  error?: string;
  holdings?: UserHoldingView[];
  accounts?: Account[];
  instruments?: Instrument[];
  summary?: PortfolioSummaryStats;
  userEmail?: string;
}

export interface HoldingActionResult {
  success?: boolean;
  error?: string;
  holding?: UserHoldingView;
}

export interface CsvPreviewResult {
  success?: boolean;
  error?: string;
  totalRows?: number;
  validCount?: number;
  invalidCount?: number;
  validRows?: Array<{
    accountName: string;
    symbol: string;
    name: string;
    quantity: number;
    averageBuyPrice: number;
    investedAmount: number;
    assetClass: string;
  }>;
  errors?: Array<{ rowNumber: number; message: string }>;
}

export interface CsvImportExecutionResult {
  success?: boolean;
  error?: string;
  importedCount?: number;
}

/**
 * Parses raw CSV text into an array of objects based on header row.
 */
function parseCsv(csvText: string): Array<Record<string, string>> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_-]+/g, '_'));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every((v) => v === '')) continue; // Skip blank lines

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Server action to fetch all portfolio holdings, accounts, and catalog items for the current user.
 */
export async function getPortfolioDataAction(): Promise<PortfolioDataResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to view your portfolio data.' };
    }

    // Ensure user has at least one account configured
    await ensureDefaultAccount(authUser.id);

    const [holdingsList, accountsList, instrumentsList] = await Promise.all([
      getUserHoldings(authUser.id),
      getUserAccounts(authUser.id),
      getInstrumentsCatalog(),
    ]);

    const summary = calculatePortfolioSummary(holdingsList);

    return {
      success: true,
      holdings: holdingsList,
      accounts: accountsList,
      instruments: instrumentsList,
      summary,
      userEmail: authUser.email,
    };
  } catch (err) {
    console.error('Error in getPortfolioDataAction:', err);
    return { error: err instanceof Error ? err.message : 'Failed to load portfolio data.' };
  }
}

/**
 * Server action to add or update a single holding.
 */
export async function addHoldingAction(
  _prevState: HoldingActionResult | null,
  formData: FormData
): Promise<HoldingActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to add holdings.' };
    }

    const accountId = formData.get('accountId') as string;
    const instrumentId = formData.get('instrumentId') as string;
    const units = parseFloat(formData.get('units') as string);
    const averageAcquisitionCost = parseFloat(formData.get('averageAcquisitionCost') as string);
    const notes = (formData.get('notes') as string)?.trim() || undefined;
    const purchaseDateRaw = (formData.get('purchaseDate') as string)?.trim();
    let purchaseDate: Date | null = null;
    if (purchaseDateRaw) {
      const t = Date.parse(purchaseDateRaw);
      if (Number.isNaN(t) || t > Date.now()) {
        return { error: 'Purchase date must be a valid date that is not in the future.' };
      }
      purchaseDate = new Date(t);
    }

    if (!accountId) {
      return { error: 'Please select an account.' };
    }

    if (!instrumentId) {
      return { error: 'Please select a verified security.' };
    }

    if (isNaN(units) || units <= 0) {
      return { error: 'Quantity must be a positive number greater than zero.' };
    }

    if (isNaN(averageAcquisitionCost) || averageAcquisitionCost < 0) {
      return { error: 'Average buy price must be a valid non-negative number.' };
    }

    const holding = await addOrUpdateHolding(authUser.id, {
      accountId,
      instrumentId,
      units,
      averageAcquisitionCost,
      notes,
      purchaseDate,
    });

    revalidatePath('/portfolio');
    revalidatePath('/x-ray');
    revalidatePath('/health');
    revalidatePath('/');

    return { success: true, holding };
  } catch (err) {
    console.error('Error adding holding:', err);
    return { error: err instanceof Error ? err.message : 'Failed to add holding.' };
  }
}

/**
 * Server action to delete a holding.
 */
export async function deleteHoldingAction(holdingId: string): Promise<{ success?: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to delete holdings.' };
    }

    if (!holdingId) {
      return { error: 'Holding ID is required.' };
    }

    const deleted = await deleteHolding(authUser.id, holdingId);
    if (!deleted) {
      return { error: 'Holding could not be found or you do not have permission to delete it.' };
    }

    revalidatePath('/portfolio');
    revalidatePath('/x-ray');
    revalidatePath('/');

    return { success: true };
  } catch (err) {
    console.error('Error deleting holding:', err);
    return { error: err instanceof Error ? err.message : 'Failed to delete holding.' };
  }
}

/**
 * Server action to create a portfolio account.
 */
export async function createAccountAction(formData: FormData): Promise<{ success?: boolean; error?: string; account?: Account }> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to manage accounts.' };
    }

    const institutionName = (formData.get('institutionName') as string)?.trim();
    const accountType = (formData.get('accountType') as string)?.trim().toLowerCase() || 'demat';
    const accountIdentifierMasked = (formData.get('accountIdentifierMasked') as string)?.trim() || undefined;

    if (!institutionName || institutionName.length < 2) {
      return { error: 'Institution or broker name is required (minimum 2 characters).' };
    }

    const allowedTypes = ['brokerage', 'demat', 'bank', 'epf', 'ppf', 'nps', 'manual'];
    if (!allowedTypes.includes(accountType)) {
      return { error: `Invalid account type. Allowed: ${allowedTypes.join(', ')}` };
    }

    const account = await createAccount(authUser.id, {
      institutionName,
      accountType,
      accountIdentifierMasked,
    });

    revalidatePath('/portfolio');

    return { success: true, account };
  } catch (err) {
    console.error('Error creating account:', err);
    return { error: err instanceof Error ? err.message : 'Failed to create account.' };
  }
}

/**
 * Previews and validates a CSV portfolio file before committing.
 */
export async function previewCsvAction(csvContent: string): Promise<CsvPreviewResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to import holdings.' };
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return { error: 'CSV file is empty.' };
    }

    if (csvContent.length > 2 * 1024 * 1024) {
      return { error: 'CSV file exceeds maximum allowable size of 2MB.' };
    }

    const rows = parseCsv(csvContent);
    if (rows.length === 0) {
      return {
        error:
          'No valid rows found in CSV. Please verify that headers match the template: account_name, symbol, quantity, average_buy_price',
      };
    }

    if (rows.length > 500) {
      return { error: 'CSV exceeds maximum allowable limit of 500 rows per batch.' };
    }

    const { validRows, errors } = await validateCsvRows(rows);

    return {
      success: true,
      totalRows: rows.length,
      validCount: validRows.length,
      invalidCount: errors.length,
      validRows: validRows.map((r) => ({
        accountName: r.accountName,
        symbol: r.symbol,
        name: r.instrument.name,
        quantity: r.quantity,
        averageBuyPrice: r.average_buy_price,
        investedAmount: r.quantity * r.average_buy_price,
        assetClass: r.instrument.assetClass,
      })),
      errors,
    };
  } catch (err) {
    console.error('Error previewing CSV:', err);
    return { error: err instanceof Error ? err.message : 'Failed to parse CSV.' };
  }
}

/**
 * Executes a transactional CSV import for the authenticated user.
 */
export async function executeCsvImportAction(csvContent: string): Promise<CsvImportExecutionResult> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to import holdings.' };
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return { error: 'CSV file is empty.' };
    }

    if (csvContent.length > 2 * 1024 * 1024) {
      return { error: 'CSV file exceeds maximum allowable size of 2MB.' };
    }

    const rows = parseCsv(csvContent);
    const { validRows, errors } = await validateCsvRows(rows);

    if (errors.length > 0) {
      return {
        error: `Import aborted: ${errors.length} validation errors found. Please correct all errors before importing. First error on row ${errors[0].rowNumber}: ${errors[0].message}`,
      };
    }

    if (validRows.length === 0) {
      return { error: 'No valid rows to import.' };
    }

    const { importedCount } = await executeTransactionalCsvImport(authUser.id, validRows);

    revalidatePath('/portfolio');
    revalidatePath('/x-ray');
    revalidatePath('/health');
    revalidatePath('/');

    return { success: true, importedCount };
  } catch (err) {
    console.error('Error executing CSV import:', err);
    return { error: err instanceof Error ? err.message : 'Database transaction failed during CSV import.' };
  }
}

/**
 * Server action to synchronize market prices across official AMFI and equity feeds.
 */
export async function syncMarketPricesAction(): Promise<{
  success?: boolean;
  error?: string;
  updatedCount?: number;
  syncedAt?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { error: 'Authentication is not configured.' };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return { error: 'You must be signed in to synchronize market data.' };
    }

    const result = await syncAllMarketPrices();

    revalidatePath('/portfolio');
    revalidatePath('/x-ray');
    revalidatePath('/health');
    revalidatePath('/');

    return {
      success: true,
      updatedCount: result.updatedCount,
      syncedAt: result.syncedAt.toISOString(),
    };
  } catch (err) {
    console.error('Error in syncMarketPricesAction:', err);
    return { error: err instanceof Error ? err.message : 'Market price synchronization failed.' };
  }
}
