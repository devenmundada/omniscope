'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  previewCsvAction,
  executeCsvImportAction,
  type CsvPreviewResult,
} from '@/app/portfolio/actions';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { formatINR } from '@/lib/format';

interface CsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_CSV_TEMPLATE = `account_name,symbol,isin,quantity,average_buy_price,purchase_date,notes
Zerodha Demat,RELIANCE,INE002A01018,50,1180.50,2023-06-15,Long-term core
Zerodha Demat,HDFCBANK,INE040A01034,40,1520.00,2023-09-01,Banking allocation
Groww MF,PPFAS-FC,INF879O01027,450.25,58.20,2023-04-10,Monthly SIP
Groww MF,UTI-N50,INF789F01XA0,200.00,118.40,2023-04-10,Index allocation
Zerodha Demat,NIFTYBEES,INF204KB14I2,100,218.00,2024-01-05,ETF allocation
Zerodha Demat,SGB23,IN0020230085,25,5920.00,2023-09-20,Sovereign Gold Bond`;

export function CsvImportModal({ open, onOpenChange }: CsvImportModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<CsvPreviewResult | null>(null);
  const [importResult, setImportResult] = useState<{ success?: boolean; count?: number; error?: string } | null>(null);

  const [isPreviewing, startPreview] = useTransition();
  const [isImporting, startImport] = useTransition();

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'omniscope_portfolio_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setImportResult({ error: 'Please upload a valid .csv file.' });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      validateAndPreview(text);
    };
    reader.readAsText(file);
  };

  const validateAndPreview = (content: string) => {
    setImportResult(null);
    startPreview(async () => {
      const res = await previewCsvAction(content);
      setPreviewData(res);
    });
  };

  const handleExecuteImport = () => {
    if (!csvText) return;

    startImport(async () => {
      const res = await executeCsvImportAction(csvText);
      if (res.error) {
        setImportResult({ error: res.error });
      } else {
        setImportResult({ success: true, count: res.importedCount });
        router.refresh();
      }
    });
  };

  const handleReset = () => {
    setCsvText('');
    setFileName(null);
    setPreviewData(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              <DialogTitle className="text-xl font-serif">Import Portfolio via CSV</DialogTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="text-xs h-8 gap-1.5"
            >
              <Download className="size-3.5" /> Download Template
            </Button>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Upload your portfolio spreadsheet. Verified transactionally — if any row is invalid, the entire import rolls back safely.
          </DialogDescription>
        </DialogHeader>

        {importResult?.error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Import Failed</p>
              <p className="mt-0.5">{importResult.error}</p>
            </div>
          </div>
        )}

        {importResult?.success && (
          <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/10 p-4 text-xs text-success">
            <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Portfolio Imported Successfully</p>
              <p className="mt-0.5">
                {importResult.count} holdings were transactionally committed to your profile.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  handleReset();
                }}
                className="mt-3 text-xs h-7"
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {!importResult?.success && (
          <div className="space-y-4 py-2">
            {/* Step 1: Upload / Drop area */}
            {!previewData && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer bg-muted/20"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <UploadCloud className="size-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Click to select CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supported format: <code>account_name, symbol, isin, quantity, average_buy_price</code> (optional: <code>purchase_date</code>, <code>notes</code>)
                </p>
                {fileName && (
                  <p className="text-xs font-semibold text-primary mt-2">
                    Selected file: {fileName}
                  </p>
                )}
              </div>
            )}

            {/* Loading Indicator */}
            {isPreviewing && (
              <div className="flex items-center justify-center p-8 text-xs text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Validating CSV rows against securities catalogue...
              </div>
            )}

            {/* Step 2: Pre-Import Preview & Validation Result */}
            {previewData && !isPreviewing && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border text-xs">
                  <div>
                    <span className="text-muted-foreground">Total Rows: </span>
                    <strong className="text-foreground">{previewData.totalRows}</strong>
                    <span className="mx-2 text-border">|</span>
                    <span className="text-emerald-500 font-medium">Valid: {previewData.validCount}</span>
                    <span className="mx-2 text-border">|</span>
                    <span className={`${previewData.invalidCount ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      Errors: {previewData.invalidCount}
                    </span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="h-7 text-xs gap-1">
                    <RotateCcw className="size-3" /> Upload Another
                  </Button>
                </div>

                {/* Validation Errors List */}
                {previewData.errors && previewData.errors.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5 max-h-36 overflow-y-auto">
                    <div className="flex items-center gap-1.5 text-destructive font-semibold text-xs mb-1">
                      <AlertTriangle className="size-3.5" />
                      <span>{previewData.errors.length} Row Validation Issues (Fix required before import):</span>
                    </div>
                    {previewData.errors.map((err) => (
                      <p key={err.rowNumber} className="text-[11px] text-destructive leading-tight">
                        • <strong>Row {err.rowNumber}:</strong> {err.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Valid Rows Preview Table */}
                {previewData.validRows && previewData.validRows.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Ready to Import ({previewData.validRows.length} positions)
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border text-xs">
                      {previewData.validRows.map((r, idx) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-accent/40">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{r.symbol}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                                {r.assetClass}
                              </span>
                              <span className="text-[11px] text-muted-foreground">({r.accountName})</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">{r.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-foreground tnum">{formatINR(r.investedAmount)}</p>
                            <p className="text-[11px] text-muted-foreground tnum">
                              {r.quantity} units @ ₹{r.averageBuyPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {previewData && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleExecuteImport}
                  disabled={isImporting || (previewData.invalidCount !== undefined && previewData.invalidCount > 0)}
                  className="shadow-sm"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      Committing Transaction...
                    </>
                  ) : (
                    `Commit ${previewData.validCount || 0} Holdings`
                  )}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
