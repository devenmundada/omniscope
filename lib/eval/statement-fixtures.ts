/**
 * Synthetic investment statements with known answers, for measuring the AI Statement Reader.
 * Investors and folio numbers are fictional; securities and ISINs are real catalogue entries.
 */
import { textPdf } from './simple-pdf';
import type { TruthHolding } from './grading';

export interface StatementFixture {
  id: string;
  title: string;
  format: string;
  filename: string;
  mediaType: string;
  /** What makes this document hard. */
  challenge: string;
  bytes: () => Uint8Array;
  truth: TruthHolding[];
}

const pad = (s: string | number, n: number, right = false) => (right ? String(s).padStart(n) : String(s).padEnd(n));
const h = (name: string, isin: string | null, quantity: number, averageCost: number | null = null, totalCost: number | null = null): TruthHolding => ({
  name,
  isin,
  quantity,
  averageCost,
  totalCost,
});

// ---------- 1. Depository consolidated account statement (PDF) ----------
const casEquity = [
  h('Infosys Limited', 'INE009A01021', 120),
  h('Reliance Industries Limited', 'INE002A01018', 75),
  h('ICICI Bank Limited', 'INE090A01021', 210),
  h('Larsen & Toubro Limited', 'INE018A01030', 18),
  h('Nippon India ETF Nifty 50 BeES', 'INF204KB14I2', 400),
];
const casFunds = [
  h('Parag Parikh Flexi Cap Fund - Direct Plan - Growth', 'INF879O01027', 1532.418, null, 98500),
  h('UTI Nifty 50 Index Fund - Direct Plan - Growth', 'INF789F01XA0', 702.112, null, 101250.5),
];
const casLines = [
  'CONSOLIDATED ACCOUNT STATEMENT                    Statement for the period 01-Oct-2026 to 31-Oct-2026',
  'Depository: CDSL     Investor: ANANYA SAMPLE     PAN: XXXXX1234X     BO ID: XXXXXXXXXXXX5678',
  '',
  'SUMMARY OF HOLDINGS AS ON 31-Oct-2026',
  '',
  'EQUITY SHARES / ETFs (DEMAT)',
  `${pad('ISIN', 14)}${pad('Security Name', 34)}${pad('Curr. Bal', 12, true)}${pad('Free Bal', 12, true)}${pad('Mkt Price', 12, true)}${pad('Value (Rs)', 14, true)}`,
  ...[
    ['INE009A01021', 'INFOSYS LIMITED', 120, 1145.1],
    ['INE002A01018', 'RELIANCE INDUSTRIES LIMITED', 75, 1344.8],
    ['INE090A01021', 'ICICI BANK LIMITED', 210, 1310.2],
    ['INE018A01030', 'LARSEN & TOUBRO LIMITED', 18, 3920.0],
    ['INF204KB14I2', 'NIPPON INDIA ETF NIFTY 50 BEES', 400, 287.61],
  ].map(([isin, name, q, p]) => `${pad(isin, 14)}${pad(name, 34)}${pad(q, 12, true)}${pad(q, 12, true)}${pad(Number(p).toFixed(2), 12, true)}${pad((Number(q) * Number(p)).toFixed(2), 14, true)}`),
  '',
  'MUTUAL FUND UNITS (SOA)',
  `${pad('Scheme', 50)}${pad('Folio', 14)}${pad('Units', 12, true)}${pad('NAV', 10, true)}${pad('Cost Value', 12, true)}`,
  `${pad('Parag Parikh Flexi Cap Fund - Direct Plan - Growth', 50)}${pad('91827364/55', 14)}${pad('1532.418', 12, true)}${pad('94.2594', 10, true)}${pad('98500.00', 12, true)}`,
  `${pad('  ISIN: INF879O01027', 50)}`,
  `${pad('UTI Nifty 50 Index Fund - Direct Plan - Growth', 50)}${pad('55667788', 14)}${pad('702.112', 12, true)}${pad('177.1620', 10, true)}${pad('101250.50', 12, true)}`,
  `${pad('  ISIN: INF789F01XA0', 50)}`,
  '',
  'Note: Values are indicative. Please verify with your depository participant.',
];

// ---------- 2. Broker holdings export (CSV) ----------
// The export prints only tickers, so the correct "name as printed" is the ticker.
const brokerCsvTruth = [
  h('HDFCBANK', 'INE040A01034', 85, 1602.35),
  h('TCS', 'INE467B01029', 22, 3712.4),
  h('ITC', 'INE154A01025', 300, 431.15),
  h('BHARTIARTL', 'INE397D01024', 40, 1188.0),
  h('GOLDBEES', 'INF204KA1L12', 650, 61.92),
];
const brokerCsv = [
  'Instrument,ISIN,Qty.,Avg. cost,LTP,Cur. val,P&L,Net chg.,Day chg.',
  'HDFCBANK,INE040A01034,85,1602.35,816.50,69402.50,-66797.25,-49.04,-0.34',
  'TCS,INE467B01029,22,3712.40,2405.00,52910.00,-28762.80,-35.22,0.61',
  'ITC,INE154A01025,300,431.15,462.10,138630.00,9285.00,7.18,-0.18',
  'BHARTIARTL,INE397D01024,40,1188.00,1680.00,67200.00,19680.00,41.41,0.90',
  'GOLDBEES,INF204KA1L12,650,61.92,110.06,71539.00,31291.00,77.75,0.37',
].join('\n');

// ---------- 3. Mutual fund statement with a transaction history (PDF) ----------
const mfTruth = [
  h('Kotak Midcap Fund - Direct Plan - Growth', 'INF174K01LT0', 455.902, null, 52000),
  h('SBI Small Cap Fund - Direct Plan - Growth', 'INF200K01T51', 210.556, null, 36500),
  h('Mirae Asset Large Cap Fund - Direct Plan - Growth', 'INF769K01AX2', 389.04, null, 40000),
];
const mfLines = [
  'MUTUAL FUND STATEMENT OF ACCOUNT                         As on 15-Nov-2026',
  'Investor: R. SAMPLE           Email: r.sample@example.com',
  '',
  'PORTFOLIO SUMMARY',
  `${pad('Scheme Name', 52)}${pad('Units', 12, true)}${pad('Invested (Rs)', 15, true)}${pad('Current (Rs)', 15, true)}`,
  `${pad('Kotak Midcap Fund - Direct Plan - Growth (INF174K01LT0)', 52)}${pad('455.902', 12, true)}${pad('52,000.00', 15, true)}${pad('75,665.31', 15, true)}`,
  `${pad('SBI Small Cap Fund - Direct Plan - Growth (INF200K01T51)', 52)}${pad('210.556', 12, true)}${pad('36,500.00', 15, true)}${pad('41,203.77', 15, true)}`,
  `${pad('Mirae Asset Large Cap Fund - Direct Growth (INF769K01AX2)', 52)}${pad('389.040', 12, true)}${pad('40,000.00', 15, true)}${pad('47,850.11', 15, true)}`,
  '',
  'TRANSACTION HISTORY (last 6 months)',
  `${pad('Date', 13)}${pad('Scheme', 34)}${pad('Type', 12)}${pad('Amount', 12, true)}${pad('Units', 10, true)}`,
  `${pad('05-Jun-2026', 13)}${pad('Kotak Midcap Fund', 34)}${pad('SIP', 12)}${pad('5,000.00', 12, true)}${pad('31.204', 10, true)}`,
  `${pad('05-Jul-2026', 13)}${pad('Kotak Midcap Fund', 34)}${pad('SIP', 12)}${pad('5,000.00', 12, true)}${pad('30.877', 10, true)}`,
  `${pad('12-Aug-2026', 13)}${pad('SBI Small Cap Fund', 34)}${pad('Purchase', 12)}${pad('10,000.00', 12, true)}${pad('58.120', 10, true)}`,
  `${pad('20-Sep-2026', 13)}${pad('HDFC Mid-Cap Opportunities Fund', 34)}${pad('Redemption', 12)}${pad('-25,000.00', 12, true)}${pad('-120.450', 10, true)}`,
  `${pad('05-Oct-2026', 13)}${pad('Kotak Midcap Fund', 34)}${pad('SIP', 12)}${pad('5,000.00', 12, true)}${pad('29.950', 10, true)}`,
  '',
  'HDFC Mid-Cap Opportunities Fund: fully redeemed on 20-Sep-2026 (closing units 0.000).',
];

// ---------- 4. Broker holdings report with market value next to cost (PDF) ----------
const reportTruth = [
  h('State Bank of India', 'INE062A01020', 150, 612.4),
  h('Titan Company Ltd', 'INE280A01028', 12, 3105.75),
  h('Axis Bank Ltd', 'INE238A01034', 95, 1041.2),
  h('Nippon India Nifty Bank ETF', 'INF204KB14L6', 120, 488.9),
];
const reportLines = [
  'HOLDINGS REPORT                                   Client: SAMPLE TRADER        Date: 14-11-2026',
  '',
  `${pad('Symbol', 12)}${pad('Company', 30)}${pad('ISIN', 14)}${pad('Qty', 7, true)}${pad('Avg Price', 11, true)}${pad('Mkt Value', 12, true)}${pad('Unreal. P/L', 13, true)}`,
  `${pad('SBIN', 12)}${pad('State Bank of India', 30)}${pad('INE062A01020', 14)}${pad(150, 7, true)}${pad('612.40', 11, true)}${pad('122,280.00', 12, true)}${pad('30,420.00', 13, true)}`,
  `${pad('TITAN', 12)}${pad('Titan Company Ltd', 30)}${pad('INE280A01028', 14)}${pad(12, 7, true)}${pad('3,105.75', 11, true)}${pad('41,760.00', 12, true)}${pad('4,491.00', 13, true)}`,
  `${pad('AXISBANK', 12)}${pad('Axis Bank Ltd', 30)}${pad('INE238A01034', 14)}${pad(95, 7, true)}${pad('1,041.20', 11, true)}${pad('113,525.00', 12, true)}${pad('14,611.00', 13, true)}`,
  `${pad('BANKBEES', 12)}${pad('Nippon India Nifty Bank ETF', 30)}${pad('INF204KB14L6', 14)}${pad(120, 7, true)}${pad('488.90', 11, true)}${pad('62,976.00', 12, true)}${pad('4,308.00', 13, true)}`,
  '',
  `${pad('TOTAL', 63)}${pad('', 11)}${pad('340,541.00', 12, true)}${pad('53,830.00', 13, true)}`,
  '',
  'Brokerage and taxes for the day: Rs 0.00. Pledged quantity: nil.',
];

// ---------- 5. Informal email (plain text) ----------
const emailTruth = [
  h('Infosys Ltd', null, 30, 1520),
  h('Parag Parikh Flexi Cap Fund', null, 250.5, null, 20000),
  h('Sovereign Gold Bond 2023-24 Series II', 'IN0020230085', 10, 5923),
];
const email = `Subject: my investments, for the tax filing

Hi, as discussed here is what I hold right now.

I have 30 shares of Infosys that I bought at an average of Rs 1,520 each. On the mutual fund side I put
Rs 20,000 in total into the Parag Parikh Flexi Cap fund and the app shows 250.5 units. I also have 10 grams
(10 units) of the Sovereign Gold Bond 2023-24 Series II, ISIN IN0020230085, bought at the issue price of Rs 5,923.

I sold all my Tata Motors shares last year, so ignore those. My PAN is on the earlier mail.

Thanks!`;

// ---------- 6. Not an investment statement (PDF) ----------
const billLines = [
  'ELECTRICITY BILL                                   Consumer No: 000123456789',
  'Name: A. SAMPLE              Billing month: October 2026',
  '',
  `${pad('Previous reading', 30)}${pad('18,204', 12, true)}`,
  `${pad('Current reading', 30)}${pad('18,566', 12, true)}`,
  `${pad('Units consumed', 30)}${pad('362', 12, true)}`,
  `${pad('Energy charges', 30)}${pad('2,534.00', 12, true)}`,
  `${pad('Fixed charges', 30)}${pad('150.00', 12, true)}`,
  `${pad('Amount payable (Rs)', 30)}${pad('2,684.00', 12, true)}`,
  '',
  'Pay by 25-Nov-2026 to avoid a late fee.',
];

export const STATEMENT_FIXTURES: StatementFixture[] = [
  {
    id: 'cas',
    title: 'Depository CAS',
    format: 'PDF',
    filename: 'cas-oct-2026.pdf',
    mediaType: 'application/pdf',
    challenge: 'Two sections (demat shares and MF folios); market values printed but no share costs; ISIN on a separate line for funds.',
    bytes: () => textPdf(casLines, 7.5),
    truth: [...casEquity, ...casFunds],
  },
  {
    id: 'broker-csv',
    title: 'Broker holdings export',
    format: 'CSV',
    filename: 'holdings.csv',
    mediaType: 'text/csv',
    challenge: 'Ticker symbols instead of names; current value and P&L columns next to average cost.',
    bytes: () => new TextEncoder().encode(brokerCsv),
    truth: brokerCsvTruth,
  },
  {
    id: 'mf-statement',
    title: 'Mutual fund statement',
    format: 'PDF',
    filename: 'mf-statement.pdf',
    mediaType: 'application/pdf',
    challenge: 'A transaction history (including a fully redeemed fund) that must not be counted as holdings; Indian digit grouping.',
    bytes: () => textPdf(mfLines, 7.5),
    truth: mfTruth,
  },
  {
    id: 'broker-report',
    title: 'Broker holdings report',
    format: 'PDF',
    filename: 'holdings-report.pdf',
    mediaType: 'application/pdf',
    challenge: 'Market value and unrealised P/L beside the average price; a totals row that is not a holding.',
    bytes: () => textPdf(reportLines, 7.5),
    truth: reportTruth,
  },
  {
    id: 'email',
    title: 'Informal email',
    format: 'Text',
    filename: 'email.txt',
    mediaType: 'text/plain',
    challenge: 'Holdings described in sentences; one sold position to ignore; one cost given as a total instead of per unit.',
    bytes: () => new TextEncoder().encode(email),
    truth: emailTruth,
  },
  {
    id: 'not-statement',
    title: 'Electricity bill',
    format: 'PDF',
    filename: 'electricity-bill.pdf',
    mediaType: 'application/pdf',
    challenge: 'Not an investment statement at all: the right answer is no holdings.',
    bytes: () => textPdf(billLines, 8.5),
    truth: [],
  },
];
