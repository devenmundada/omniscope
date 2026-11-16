import 'server-only';
import { eq, and, sql, ilike, or } from 'drizzle-orm';
import { db } from './index';
import { accounts, holdings, instruments, marketPrices, users } from './schema';
import type { Account, Instrument, HoldingEntity } from './schema';
import { checkPriceStaleness } from '@/lib/market-data/sync-service';

export interface UserHoldingView {
  id: string;
  userId: string;
  accountId: string;
  accountName: string;
  accountType: string;
  instrumentId: string;
  symbol: string;
  name: string;
  isin: string | null;
  assetClass: string;
  sector: string | null;
  exchange: string | null;
  units: number;
  averageAcquisitionCost: number;
  investedAmount: number;
  // Live / EOD Market Valuation fields
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
  priceTimestamp: Date | null;
  priceSource: string | null;
  priceType: string | null;
  dayChangePct: number | null;
  /** Unverified reference price (catalogue fixture). Shown for context only; never used for valuation. */
  referencePrice: number | null;
  isPriceStale: boolean;
  priceStatusLabel: string;
  marketCapCategory: string | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  firstPurchasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioSummaryStats {
  totalInvested: number;
  /** Cost basis of the holdings that have a verified price. Gain and gain % are measured against this. */
  pricedInvested: number;
  totalCurrentValue: number | null;
  /** Verified value minus the cost of the same priced holdings. Unpriced holdings are left out, not counted as losses. */
  totalUnrealizedGain: number | null;
  totalUnrealizedGainPct: number | null;
  holdingCount: number;
  pricedHoldingCount: number;
  unpricedHoldingCount: number;
  accountCount: number;
  assetClassBreakdown: Record<string, { invested: number; current: number | null }>;
  isFullyPriced: boolean;
  hasAnyPricedHoldings: boolean;
  latestPriceTimestamp: Date | null;
}

export interface AddHoldingInput {
  accountId: string;
  instrumentId: string;
  units: number;
  averageAcquisitionCost: number;
  notes?: string;
  /** Optional first purchase date (used for XIRR). */
  purchaseDate?: Date | null;
}

export interface CreateAccountInput {
  institutionName: string;
  accountType: string;
  accountIdentifierMasked?: string;
}

/**
 * Returns all portfolio accounts owned by the authenticated user.
 */
export async function getUserAccounts(userId: string): Promise<Account[]> {
  return await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(accounts.institutionName);
}

/**
 * Creates a new account strictly scoped to the authenticated user.
 */
export async function createAccount(
  userId: string,
  input: CreateAccountInput
): Promise<Account> {
  const [created] = await db
    .insert(accounts)
    .values({
      userId,
      institutionName: input.institutionName.trim(),
      accountType: input.accountType.trim().toLowerCase(),
      accountIdentifierMasked: input.accountIdentifierMasked?.trim() || null,
      connectionStatus: 'manual',
    })
    .returning();

  return created;
}

/**
 * Ensures the user has at least one default account. If none exists, creates a "Primary Demat" account.
 */
export async function ensureDefaultAccount(userId: string): Promise<Account> {
  const existing = await getUserAccounts(userId);
  if (existing.length > 0) {
    return existing[0];
  }

  return await createAccount(userId, {
    institutionName: 'Primary Demat',
    accountType: 'demat',
    accountIdentifierMasked: '••••1001',
  });
}

/**
 * Returns verified instruments from the catalogue.
 */
export async function getInstrumentsCatalog(): Promise<Instrument[]> {
  return await db
    .select()
    .from(instruments)
    .orderBy(instruments.assetClass, instruments.symbol);
}

/**
 * Searches instruments by symbol, name, or ISIN.
 */
export async function searchInstruments(query: string): Promise<Instrument[]> {
  const term = `%${query.trim()}%`;
  return await db
    .select()
    .from(instruments)
    .where(
      or(
        ilike(instruments.symbol, term),
        ilike(instruments.name, term),
        ilike(instruments.isin, term)
      )
    )
    .limit(20);
}

/**
 * Resolves an instrument by symbol or ISIN.
 */
export async function findInstrumentBySymbolOrIsin(identifier: string): Promise<Instrument | null> {
  const cleaned = identifier.trim().toUpperCase();
  const [found] = await db
    .select()
    .from(instruments)
    .where(
      or(
        sql`upper(${instruments.symbol}) = ${cleaned}`,
        sql`upper(${instruments.isin}) = ${cleaned}`
      )
    )
    .limit(1);

  return found || null;
}

/**
 * Fetches all holdings for the user, joined with accounts, instruments, and verified market prices.
 * Strictly filtered by `holdings.userId = userId`.
 */
export async function getUserHoldings(userId: string): Promise<UserHoldingView[]> {
  const rows = await db
    .select({
      holding: holdings,
      account: accounts,
      instrument: instruments,
      marketPrice: marketPrices,
    })
    .from(holdings)
    .innerJoin(
      accounts,
      and(eq(holdings.accountId, accounts.id), eq(accounts.userId, userId))
    )
    .innerJoin(instruments, eq(holdings.instrumentId, instruments.id))
    .leftJoin(marketPrices, eq(holdings.instrumentId, marketPrices.instrumentId))
    .where(eq(holdings.userId, userId))
    .orderBy(instruments.assetClass, instruments.symbol);

  return rows.map(({ holding, account, instrument, marketPrice }) => {
    const units = Number(holding.units);
    const avgCost = Number(holding.averageAcquisitionCost || 0);
    const investedAmount = units * avgCost;

    let currentPrice: number | null = null;
    let currentValue: number | null = null;
    let unrealizedGain: number | null = null;
    let unrealizedGainPct: number | null = null;
    let priceTimestamp: Date | null = null;
    let priceSource: string | null = null;
    let priceType: string | null = null;
    let dayChangePct: number | null = null;
    let referencePrice: number | null = null;
    let isPriceStale = false;
    let priceStatusLabel = 'Awaiting Market Feed';

    const isUnverifiedReference =
      marketPrice != null &&
      (marketPrice.priceType === 'UNVERIFIED_REFERENCE' ||
        ['STATIC_REFERENCE_FIXTURE', 'STATIC_TEST_FIXTURE'].includes((marketPrice.source || '').toUpperCase()));

    if (marketPrice && marketPrice.price != null && isUnverifiedReference) {
      // Single valuation policy shared by Portfolio, X-Ray, Health and AI features:
      // unverified catalogue fixtures are displayed for context but never valued.
      referencePrice = Number(marketPrice.price);
      priceTimestamp = marketPrice.priceTimestamp;
      priceSource = marketPrice.source;
      priceType = marketPrice.priceType;
      priceStatusLabel = 'Awaiting Verified Feed';
    } else if (marketPrice && marketPrice.price != null) {
      currentPrice = Number(marketPrice.price);
      currentValue = units * currentPrice;
      unrealizedGain = currentValue - investedAmount;
      unrealizedGainPct = investedAmount > 0 ? (unrealizedGain / investedAmount) * 100 : 0;
      priceTimestamp = marketPrice.priceTimestamp;
      priceSource = marketPrice.source;
      priceType = marketPrice.priceType;
      dayChangePct = marketPrice.dayChangePct != null ? Number(marketPrice.dayChangePct) : null;

      const staleness = checkPriceStaleness(
        marketPrice.priceTimestamp,
        instrument.assetClass,
        marketPrice.source
      );
      isPriceStale = staleness.isStale;
      priceStatusLabel = staleness.displayStatus;
    }

    return {
      id: holding.id,
      userId: holding.userId,
      accountId: account.id,
      accountName: account.institutionName,
      accountType: account.accountType,
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      name: instrument.name,
      isin: instrument.isin,
      assetClass: instrument.assetClass,
      sector: instrument.sector,
      exchange: instrument.exchange,
      units,
      averageAcquisitionCost: avgCost,
      investedAmount,
      currentPrice,
      currentValue,
      unrealizedGain,
      unrealizedGainPct,
      priceTimestamp,
      priceSource,
      priceType,
      dayChangePct,
      referencePrice,
      isPriceStale,
      priceStatusLabel,
      marketCapCategory: instrument.marketCapCategory,
      metadata: (instrument.metadata as Record<string, unknown>) || null,
      notes: holding.notes,
      firstPurchasedAt: holding.firstPurchasedAt,
      createdAt: holding.createdAt,
      updatedAt: holding.updatedAt,
    };
  });
}

/**
 * Calculates portfolio summary statistics based on persisted holdings and verified prices.
 */
export function calculatePortfolioSummary(holdingsList: UserHoldingView[]): PortfolioSummaryStats {
  let totalInvested = 0;
  let pricedInvested = 0;
  let sumCurrentValue = 0;
  let pricedHoldingCount = 0;
  let latestTimestamp: Date | null = null;

  const accountsSet = new Set<string>();
  const assetClassBreakdown: Record<string, { invested: number; current: number | null }> = {};

  for (const h of holdingsList) {
    totalInvested += h.investedAmount;
    accountsSet.add(h.accountId);

    if (!assetClassBreakdown[h.assetClass]) {
      assetClassBreakdown[h.assetClass] = { invested: 0, current: null };
    }
    assetClassBreakdown[h.assetClass].invested += h.investedAmount;

    if (h.currentValue != null) {
      pricedHoldingCount++;
      pricedInvested += h.investedAmount;
      sumCurrentValue += h.currentValue;
      assetClassBreakdown[h.assetClass].current =
        (assetClassBreakdown[h.assetClass].current || 0) + h.currentValue;

      if (h.priceTimestamp) {
        if (!latestTimestamp || h.priceTimestamp > latestTimestamp) {
          latestTimestamp = h.priceTimestamp;
        }
      }
    }
  }

  const hasAnyPricedHoldings = pricedHoldingCount > 0;
  const isFullyPriced = holdingsList.length > 0 && pricedHoldingCount === holdingsList.length;

  let totalCurrentValue: number | null = null;
  let totalUnrealizedGain: number | null = null;
  let totalUnrealizedGainPct: number | null = null;

  if (hasAnyPricedHoldings) {
    totalCurrentValue = sumCurrentValue;
    // Compare like with like: an unpriced holding has no value yet, so its cost must not count as a loss.
    totalUnrealizedGain = totalCurrentValue - pricedInvested;
    totalUnrealizedGainPct = pricedInvested > 0 ? (totalUnrealizedGain / pricedInvested) * 100 : 0;
  }

  return {
    totalInvested,
    pricedInvested,
    totalCurrentValue,
    totalUnrealizedGain,
    totalUnrealizedGainPct,
    holdingCount: holdingsList.length,
    pricedHoldingCount,
    unpricedHoldingCount: holdingsList.length - pricedHoldingCount,
    accountCount: accountsSet.size,
    assetClassBreakdown,
    isFullyPriced,
    hasAnyPricedHoldings,
    latestPriceTimestamp: latestTimestamp,
  };
}

/**
 * Adds or updates a holding. Verifies that the account belongs to the user,
 * that the instrument exists in the catalog, and enforces numerical precision.
 */
export async function addOrUpdateHolding(
  userId: string,
  input: AddHoldingInput
): Promise<UserHoldingView> {
  if (input.units <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  if (input.averageAcquisitionCost < 0) {
    throw new Error('Average acquisition cost cannot be negative.');
  }

  // 1. Verify account ownership
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new Error('Selected account does not belong to your profile.');
  }

  // 2. Verify instrument existence in catalog
  const [instrument] = await db
    .select()
    .from(instruments)
    .where(eq(instruments.id, input.instrumentId))
    .limit(1);

  if (!instrument) {
    throw new Error('Selected instrument does not exist in the catalogue.');
  }

  const unitsStr = input.units.toFixed(4);
  const avgCostStr = input.averageAcquisitionCost.toFixed(2);

  // 3. Upsert holding (check for existing holding for this user, account, and instrument)
  const [existing] = await db
    .select()
    .from(holdings)
    .where(
      and(
        eq(holdings.userId, userId),
        eq(holdings.accountId, input.accountId),
        eq(holdings.instrumentId, input.instrumentId)
      )
    )
    .limit(1);

  let holdingId: string;

  if (existing) {
    const [updated] = await db
      .update(holdings)
      .set({
        units: unitsStr,
        averageAcquisitionCost: avgCostStr,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        firstPurchasedAt: input.purchaseDate ?? existing.firstPurchasedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)))
      .returning();
    holdingId = updated.id;
  } else {
    const [created] = await db
      .insert(holdings)
      .values({
        userId,
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        units: unitsStr,
        averageAcquisitionCost: avgCostStr,
        notes: input.notes?.trim() || null,
        firstPurchasedAt: input.purchaseDate ?? null,
      })
      .returning();
    holdingId = created.id;
  }

  const allHoldings = await getUserHoldings(userId);
  const result = allHoldings.find((h) => h.id === holdingId);
  if (!result) {
    throw new Error('Holding saved but failed to retrieve record.');
  }

  return result;
}

/**
 * Deletes a holding with strict multi-tenant user ownership verification.
 */
export async function deleteHolding(userId: string, holdingId: string): Promise<boolean> {
  const deleted = await db
    .delete(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.userId, userId)))
    .returning();

  return deleted.length > 0;
}

/**
 * Represents a parsed row from a portfolio CSV upload.
 */
export interface CsvHoldingRow {
  account_name: string;
  account_type?: string;
  symbol: string;
  isin?: string;
  quantity: number;
  average_buy_price: number;
  notes?: string;
  purchase_date?: string;
}

export interface CsvImportValidationResult {
  validRows: Array<CsvHoldingRow & { instrument: Instrument; accountName: string; accountType: string }>;
  errors: Array<{ rowNumber: number; message: string }>;
}

/**
 * Validates CSV holding rows against the schema and instrument catalogue.
 */
export async function validateCsvRows(
  rows: Array<Record<string, string>>
): Promise<CsvImportValidationResult> {
  const validRows: CsvImportValidationResult['validRows'] = [];
  const errors: CsvImportValidationResult['errors'] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1;
    const r = rows[i];

    const accountName = (r.account_name || r.account || '').trim();
    if (!accountName) {
      errors.push({ rowNumber, message: 'Account name is required (e.g. "Zerodha Demat").' });
      continue;
    }

    const symbolOrIsin = (r.symbol || r.isin || '').trim();
    if (!symbolOrIsin) {
      errors.push({ rowNumber, message: 'Either symbol or ISIN is required.' });
      continue;
    }

    const qtyRaw = r.quantity || r.units || r.qty;
    const quantity = parseFloat(qtyRaw);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({ rowNumber, message: `Invalid quantity "${qtyRaw}". Must be a positive number.` });
      continue;
    }

    const priceRaw = r.average_buy_price || r.avg_price || r.buy_price || r.price;
    const average_buy_price = parseFloat(priceRaw);
    if (isNaN(average_buy_price) || average_buy_price < 0) {
      errors.push({ rowNumber, message: `Invalid average buy price "${priceRaw}". Must be a non-negative number.` });
      continue;
    }

    // Resolve instrument
    const instrument = await findInstrumentBySymbolOrIsin(symbolOrIsin);
    if (!instrument) {
      errors.push({
        rowNumber,
        message: `Security "${symbolOrIsin}" not found in verified OmniScope catalogue. Please use supported symbols (e.g. RELIANCE, HDFCBANK, PPFAS-FC, NIFTYBEES, SGB23).`,
      });
      continue;
    }

    const accountType = (r.account_type || r.type || 'demat').trim().toLowerCase();

    const dateRaw = (r.purchase_date || r.buy_date || r.date || '').trim();
    let purchase_date: string | undefined;
    if (dateRaw) {
      const t = Date.parse(dateRaw);
      if (Number.isNaN(t) || t > Date.now()) {
        errors.push({ rowNumber, message: `Invalid purchase date "${dateRaw}". Use YYYY-MM-DD and a date not in the future.` });
        continue;
      }
      purchase_date = new Date(t).toISOString().slice(0, 10);
    }

    validRows.push({
      account_name: accountName,
      account_type: accountType,
      symbol: instrument.symbol,
      isin: instrument.isin || undefined,
      quantity,
      average_buy_price,
      notes: r.notes?.trim() || undefined,
      purchase_date,
      instrument,
      accountName,
      accountType,
    });
  }

  return { validRows, errors };
}

/**
 * Executes a transactional CSV portfolio import.
 * If any row fails during insertion or validation, the entire transaction rolls back.
 */
export async function executeTransactionalCsvImport(
  userId: string,
  validatedRows: CsvImportValidationResult['validRows']
): Promise<{ importedCount: number }> {
  return await db.transaction(async (tx) => {
    // 1. Fetch user's existing accounts within the transaction
    const existingAccounts = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const accountMap = new Map<string, string>();
    for (const acc of existingAccounts) {
      accountMap.set(acc.institutionName.toLowerCase(), acc.id);
    }

    // 2. Ensure each referenced account exists for this user
    for (const row of validatedRows) {
      const lowerName = row.accountName.toLowerCase();
      if (!accountMap.has(lowerName)) {
        const [newAcc] = await tx
          .insert(accounts)
          .values({
            userId,
            institutionName: row.accountName,
            accountType: row.accountType || 'demat',
            connectionStatus: 'manual',
          })
          .returning();
        accountMap.set(lowerName, newAcc.id);
      }
    }

    // 3. Upsert holdings
    let count = 0;
    for (const row of validatedRows) {
      const accountId = accountMap.get(row.accountName.toLowerCase());
      if (!accountId) {
        throw new Error(`Failed to resolve account for "${row.accountName}"`);
      }

      const unitsStr = row.quantity.toFixed(4);
      const avgCostStr = row.average_buy_price.toFixed(2);

      // Check existing holding
      const [existing] = await tx
        .select()
        .from(holdings)
        .where(
          and(
            eq(holdings.userId, userId),
            eq(holdings.accountId, accountId),
            eq(holdings.instrumentId, row.instrument.id)
          )
        )
        .limit(1);

      if (existing) {
        await tx
          .update(holdings)
          .set({
            units: unitsStr,
            averageAcquisitionCost: avgCostStr,
            notes: row.notes || existing.notes,
            firstPurchasedAt: row.purchase_date ? new Date(row.purchase_date) : existing.firstPurchasedAt,
            updatedAt: new Date(),
          })
          .where(and(eq(holdings.id, existing.id), eq(holdings.userId, userId)));
      } else {
        await tx.insert(holdings).values({
          userId,
          accountId,
          instrumentId: row.instrument.id,
          units: unitsStr,
          averageAcquisitionCost: avgCostStr,
          notes: row.notes || null,
          firstPurchasedAt: row.purchase_date ? new Date(row.purchase_date) : null,
        });
      }

      count++;
    }

    return { importedCount: count };
  });
}
