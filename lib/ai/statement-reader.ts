import 'server-only';
import { generateText, Output } from 'ai';
import { withModelFallback } from './model';
import { getInstrumentsCatalog } from '@/lib/db/portfolio';
import { statementSchema, matchToCatalogue } from './statement-match';

export { statementSchema, matchToCatalogue } from './statement-match';
export type { ExtractedStatement, ReviewRow } from './statement-match';

const INSTRUCTIONS = `You are a meticulous data-extraction engine for Indian investment statements (consolidated account statements, broker holdings reports, mutual fund statements).
Extract every holding that the investor CURRENTLY holds (closing balance), one entry per security per account/folio.
Rules:
- Copy names, ISINs and numbers exactly as printed. Do not guess values that are not printed; use null.
- quantity = closing units/shares. averageCost = average purchase price per unit if printed. totalCost = total cost/invested value if printed (not market value).
- Ignore transactions lists, market values, charges, addresses, PAN, phone numbers and account numbers. Never output PAN or account numbers.
- If the document is not an investment statement, return an empty holdings array.`;

export async function extractStatement(file: { bytes: Uint8Array; mediaType: string; filename: string }) {
  const isText = file.mediaType.startsWith('text/') || file.filename.toLowerCase().endsWith('.csv');
  const content = isText
    ? [{ type: 'text' as const, text: `${INSTRUCTIONS}\n\nDocument (${file.filename}):\n${new TextDecoder().decode(file.bytes).slice(0, 60000)}` }]
    : [
        { type: 'text' as const, text: INSTRUCTIONS },
        { type: 'file' as const, data: file.bytes, mediaType: file.mediaType, filename: file.filename },
      ];

  const { output, modelId } = await withModelFallback(async (model, id) => {
    const res = await generateText({
      model,
      output: Output.object({ schema: statementSchema }),
      messages: [{ role: 'user', content }],
    });
    return { output: res.output, modelId: id };
  });
  if (!output) throw new Error('The AI could not read any holdings from this document.');

  const catalogue = await getInstrumentsCatalog();
  const rows = matchToCatalogue(output, catalogue);
  return {
    statementType: output.statementType,
    statementDate: output.statementDate,
    investorFirstName: output.investorFirstName,
    rows,
    modelId,
  };
}
