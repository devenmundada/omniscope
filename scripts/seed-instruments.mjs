import fs from 'fs';
import dotenv from 'dotenv';
import postgres from 'postgres';

const env = dotenv.parse(fs.readFileSync('.env.local'));
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.local');
  process.exit(1);
}

const sql = postgres(env.DATABASE_URL, { max: 1 });

const INSTRUMENTS_CATALOG = [
  // --- Indian Stocks ---
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd',
    isin: 'INE002A01018',
    assetClass: 'Indian Stocks',
    sector: 'Energy',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd',
    isin: 'INE040A01034',
    assetClass: 'Indian Stocks',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'INFY',
    name: 'Infosys Ltd',
    isin: 'INE009A01021',
    assetClass: 'Indian Stocks',
    sector: 'Information Technology',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Ltd',
    isin: 'INE467B01029',
    assetClass: 'Indian Stocks',
    sector: 'Information Technology',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'ITC',
    name: 'ITC Ltd',
    isin: 'INE154A01025',
    assetClass: 'Indian Stocks',
    sector: 'Consumer Staples',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'BAJFINANCE',
    name: 'Bajaj Finance Ltd',
    isin: 'INE296A01024',
    assetClass: 'Indian Stocks',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'TATAMOTORS',
    name: 'Tata Motors Ltd',
    isin: 'INE155A01022',
    assetClass: 'Indian Stocks',
    sector: 'Automobile',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'ICICIBANK',
    name: 'ICICI Bank Ltd',
    isin: 'INE090A01021',
    assetClass: 'Indian Stocks',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'LT',
    name: 'Larsen & Toubro Ltd',
    isin: 'INE018A01030',
    assetClass: 'Indian Stocks',
    sector: 'Industrials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    isin: 'INE062A01020',
    assetClass: 'Indian Stocks',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'BHARTIARTL',
    name: 'Bharti Airtel Ltd',
    isin: 'INE397D01024',
    assetClass: 'Indian Stocks',
    sector: 'Telecommunication',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'HINDUNILVR',
    name: 'Hindustan Unilever Ltd',
    isin: 'INE030A01027',
    assetClass: 'Indian Stocks',
    sector: 'Consumer Staples',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'KOTAKBANK',
    name: 'Kotak Mahindra Bank Ltd',
    isin: 'INE237A01028',
    assetClass: 'Indian Stocks',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'AXISBANK',
    name: 'Axis Bank Ltd',
    isin: 'INE238A01034',
    assetClass: 'Indian Stocks',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'TITAN',
    name: 'Titan Company Ltd',
    isin: 'INE280A01028',
    assetClass: 'Indian Stocks',
    sector: 'Consumer Discretionary',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },

  // --- Mutual Funds ---
  {
    symbol: 'PPFAS-FC',
    name: 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth',
    isin: 'INF879O01018',
    assetClass: 'Mutual Funds',
    sector: 'Flexi Cap',
    exchange: 'AMFI',
    amfiCode: '122639',
    marketCapCategory: 'Multi Cap',
  },
  {
    symbol: 'AXIS-BC',
    name: 'Axis Large Cap Fund (formerly Bluechip) - Direct Plan - Growth',
    isin: 'INF846K01164',
    assetClass: 'Mutual Funds',
    sector: 'Large Cap',
    exchange: 'AMFI',
    amfiCode: '120465',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'UTI-N50',
    name: 'UTI Nifty 50 Index Fund - Direct Plan - Growth',
    isin: 'INF789F01AU8',
    assetClass: 'Mutual Funds',
    sector: 'Index',
    exchange: 'AMFI',
    amfiCode: '120716',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'KOTAK-MC',
    name: 'Kotak Midcap Fund (formerly Emerging Equity) - Direct Plan - Growth',
    isin: 'INF174K01844',
    assetClass: 'Mutual Funds',
    sector: 'Mid Cap',
    exchange: 'AMFI',
    amfiCode: '119775',
    marketCapCategory: 'Mid Cap',
  },
  {
    symbol: 'MIRAE-LC',
    name: 'Mirae Asset Large Cap Fund - Direct Plan - Growth',
    isin: 'INF769K01151',
    assetClass: 'Mutual Funds',
    sector: 'Large Cap',
    exchange: 'AMFI',
    amfiCode: '118825',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'HDFC-MF',
    name: 'HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth',
    isin: 'INF179K01BE2',
    assetClass: 'Mutual Funds',
    sector: 'Mid Cap',
    exchange: 'AMFI',
    amfiCode: '118989',
    marketCapCategory: 'Mid Cap',
  },
  {
    symbol: 'SBI-SC',
    name: 'SBI Small Cap Fund - Direct Plan - Growth',
    isin: 'INF200K01T43',
    assetClass: 'Mutual Funds',
    sector: 'Small Cap',
    exchange: 'AMFI',
    amfiCode: '125497',
    marketCapCategory: 'Small Cap',
  },

  // --- ETFs ---
  {
    symbol: 'NIFTYBEES',
    name: 'Nippon India Nifty 50 BeES ETF',
    isin: 'INF204KB14I2',
    assetClass: 'ETFs',
    sector: 'Index',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'JUNIORBEES',
    name: 'Nippon India Nifty Next 50 ETF',
    isin: 'INF204KB14J0',
    assetClass: 'ETFs',
    sector: 'Index',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'BANKBEES',
    name: 'Nippon India Nifty Bank ETF',
    isin: 'INF204KB14L6',
    assetClass: 'ETFs',
    sector: 'Financials',
    exchange: 'NSE',
    marketCapCategory: 'Large Cap',
  },
  {
    symbol: 'GOLDBEES',
    name: 'Nippon India ETF Gold BeES',
    isin: 'INF204KA1L12',
    assetClass: 'ETFs',
    sector: 'Commodity',
    exchange: 'NSE',
  },

  // --- Gold ---
  {
    symbol: 'SGB23',
    name: 'Sovereign Gold Bond 2023-24 Series II',
    isin: 'IN0020230085',
    assetClass: 'Gold',
    sector: 'Commodity',
    exchange: 'NSE',
  },
  {
    symbol: 'SGB24',
    name: 'Sovereign Gold Bond 2023-24 Series IV',
    isin: 'IN0020230150',
    assetClass: 'Gold',
    sector: 'Commodity',
    exchange: 'NSE',
  },

  // --- Fixed Income ---
  {
    symbol: 'FD-7.1',
    name: 'HDFC Bank Fixed Deposit (7.1%)',
    isin: null,
    assetClass: 'Fixed Income',
    sector: 'Debt',
    exchange: 'OTHER',
  },
  {
    symbol: 'SBI-FD',
    name: 'State Bank of India Term Deposit',
    isin: null,
    assetClass: 'Fixed Income',
    sector: 'Debt',
    exchange: 'OTHER',
  },

  // --- International ---
  {
    symbol: 'MO-N100',
    name: 'Motilal Oswal Nasdaq 100 FoF - Direct Plan - Growth',
    isin: 'INF247L01792',
    assetClass: 'International',
    sector: 'US Technology',
    exchange: 'AMFI',
    amfiCode: '145552',
  },
];

async function seed() {
  console.log(`Seeding ${INSTRUMENTS_CATALOG.length} verified Indian instruments...`);
  let inserted = 0;
  let skipped = 0;

  for (const item of INSTRUMENTS_CATALOG) {
    try {
      const existing = await sql`
        SELECT id FROM public.instruments 
        WHERE symbol = ${item.symbol} 
           OR (isin IS NOT NULL AND isin = ${item.isin});
      `;

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await sql`
        INSERT INTO public.instruments (
          symbol, name, isin, asset_class, sector, exchange, amfi_code, market_cap_category
        ) VALUES (
          ${item.symbol},
          ${item.name},
          ${item.isin || null},
          ${item.assetClass},
          ${item.sector || null},
          ${item.exchange || 'NSE'},
          ${item.amfiCode || null},
          ${item.marketCapCategory || null}
        );
      `;
      inserted++;
    } catch (err) {
      console.error(`Failed to seed ${item.symbol}:`, err.message);
    }
  }

  console.log(`Seeding complete: ${inserted} inserted, ${skipped} skipped.`);
  const total = await sql`SELECT count(*)::int as count FROM public.instruments;`;
  console.log(`Current verified instruments count in DB: ${total[0].count}`);
  await sql.end();
}

seed();
