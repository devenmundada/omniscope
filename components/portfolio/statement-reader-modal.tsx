'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { executeCsvImportAction } from '@/app/portfolio/actions';
import type { ReviewRow } from '@/lib/ai/statement-match';
import { AlertCircle, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud, Download } from 'lucide-react';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Extraction {
  statementType: string;
  statementDate: string | null;
  investorFirstName: string | null;
  rows: ReviewRow[];
  modelId: string;
}

type EditableRow = ReviewRow & { include: boolean };

const clean = (s: string) => s.replace(/[",\n\r]/g, ' ').trim();

export function StatementReaderModal({ open, onOpenChange }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Omit<Extraction, 'rows'> | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const [isImporting, startImport] = useTransition();

  const reset = () => {
    setFileName(null);
    setError(null);
    setMeta(null);
    setRows([]);
    setDone(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    setReading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/statement', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the statement.');
      const data = json as Extraction;
      setMeta({
        statementType: data.statementType,
        statementDate: data.statementDate,
        investorFirstName: data.investorFirstName,
        modelId: data.modelId,
      });
      setRows(data.rows.map((r) => ({ ...r, include: !!r.matched && r.averageCost != null })));
      if (data.rows.length === 0) setError('No holdings were found in this document.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the statement.');
    } finally {
      setReading(false);
    }
  };

  const update = (key: string, patch: Partial<EditableRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.include && r.matched && r.averageCost != null && r.averageCost > 0 && r.quantity > 0);

  const doImport = () => {
    if (selected.length === 0) return;
    const header = 'account_name,symbol,isin,quantity,average_buy_price,purchase_date,notes';
    const lines = selected.map((r) =>
      [
        clean(r.accountName),
        r.matched!.symbol,
        r.matched!.isin ?? '',
        r.quantity,
        r.averageCost,
        r.purchaseDate ?? '',
        'Imported by AI Statement Reader',
      ].join(',')
    );
    startImport(async () => {
      const res = await executeCsvImportAction([header, ...lines].join('\n'));
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(res.importedCount ?? selected.length);
      router.refresh();
    });
  };

  const totalInvested = selected.reduce((s, r) => s + r.quantity * (r.averageCost ?? 0), 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> AI Statement Reader
          </DialogTitle>
          <DialogDescription>
            Upload a broker holdings statement or a mutual fund CAS (PDF, CSV or image). Gemini reads the holdings,
            matches them to verified securities, and you review every row before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {done != null ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" />
            <p className="font-medium">Imported {done} holdings.</p>
            <p className="text-sm text-muted-foreground">Prices, X-Ray, Health Score and goal probabilities have been refreshed.</p>
            <Button type="button" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-lg border border-dashed border-border p-6 text-center cursor-pointer hover:bg-muted/40"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.csv,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
              {reading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm">Reading {fileName}…</p>
                  <p className="text-xs text-muted-foreground">Extracting holdings and matching ISINs. This takes 5–20 seconds.</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">{fileName ?? 'Click to choose a statement'}</p>
                  <p className="text-xs text-muted-foreground">PDF, CSV, TXT, PNG or JPG · up to 4 MB · password-protected PDFs must be unlocked first</p>
                </div>
              )}
            </div>
            <a
              href="/samples/sample-broker-statement.pdf"
              download
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Download className="size-3.5" /> Download a sample statement to try
            </a>

            {error && (
              <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                <AlertCircle className="size-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {meta && rows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><FileText className="size-3.5" /> {meta.statementType}</span>
                  {meta.statementDate && <span>As of {meta.statementDate}</span>}
                  <span>{rows.length} holdings found · {rows.filter((r) => r.matched).length} matched</span>
                  <span>Model: {meta.modelId}</span>
                </div>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="p-2"><span className="sr-only">Include</span></th>
                        <th className="p-2">Extracted security</th>
                        <th className="p-2">Matched to</th>
                        <th className="p-2 text-right">Quantity</th>
                        <th className="p-2 text-right">Avg cost (₹)</th>
                        <th className="p-2">First bought</th>
                        <th className="p-2">Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className={cn('border-t border-border', !r.matched && 'opacity-60')}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              aria-label={`Include ${r.extractedName}`}
                              checked={r.include}
                              disabled={!r.matched}
                              onChange={(e) => update(r.key, { include: e.target.checked })}
                            />
                          </td>
                          <td className="p-2 max-w-[200px]">{r.extractedName}</td>
                          <td className="p-2">
                            {r.matched ? (
                              <div>
                                <span className="font-medium">{r.matched.symbol}</span>
                                <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">{r.matchMethod}</span>
                                <div className="text-muted-foreground">{r.matched.assetClass}</div>
                              </div>
                            ) : (
                              <span className="text-amber-800 dark:text-amber-300">Not in verified catalogue</span>
                            )}
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              aria-label="Quantity"
                              className="w-20 rounded border border-border bg-background px-1 py-0.5 text-right"
                              value={r.quantity}
                              onChange={(e) => update(r.key, { quantity: Number(e.target.value) })}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              aria-label="Average cost"
                              placeholder="required"
                              className={cn(
                                'w-24 rounded border bg-background px-1 py-0.5 text-right',
                                r.averageCost == null ? 'border-amber-500' : 'border-border'
                              )}
                              value={r.averageCost ?? ''}
                              onChange={(e) =>
                                update(r.key, {
                                  averageCost: e.target.value === '' ? null : Number(e.target.value),
                                  include: !!r.matched && e.target.value !== '',
                                })
                              }
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="date"
                              aria-label="First purchase date"
                              className="rounded border border-border bg-background px-1 py-0.5"
                              value={r.purchaseDate ?? ''}
                              onChange={(e) => update(r.key, { purchaseDate: e.target.value || null })}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              aria-label="Account name"
                              className="w-32 rounded border border-border bg-background px-1 py-0.5"
                              value={r.accountName}
                              onChange={(e) => update(r.key, { accountName: e.target.value })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  The import is all-or-nothing and goes through the same validation as CSV import. Holdings that are not
                  in the verified catalogue are skipped. Always check numbers against your statement.
                </p>
              </>
            )}
          </div>
        )}

        {done == null && rows.length > 0 && (
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.length} selected · {formatINR(totalInvested)} invested
            </span>
            <Button type="button" onClick={doImport} disabled={selected.length === 0 || isImporting}>
              {isImporting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Import {selected.length} holdings
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
