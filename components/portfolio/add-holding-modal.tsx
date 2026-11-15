'use client';

import { useState, useTransition } from 'react';
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
import { Input } from '@/components/ui/input';
import { addHoldingAction, createAccountAction } from '@/app/portfolio/actions';
import type { Account, Instrument } from '@/lib/db/schema';
import { Plus, Loader2, AlertCircle, CheckCircle2, ShieldCheck, Search } from 'lucide-react';
import { formatINR } from '@/lib/format';

interface AddHoldingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  instruments: Instrument[];
}

export function AddHoldingModal({
  open,
  onOpenChange,
  accounts,
  instruments,
}: AddHoldingModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [units, setUnits] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [notes, setNotes] = useState('');

  // New account creation inline toggle
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('demat');
  const [accountError, setAccountError] = useState<string | null>(null);

  const filteredInstruments = instruments.filter((inst) => {
    const q = searchQuery.toLowerCase();
    return (
      inst.symbol.toLowerCase().includes(q) ||
      inst.name.toLowerCase().includes(q) ||
      (inst.isin && inst.isin.toLowerCase().includes(q))
    );
  });

  const selectedInstrument = instruments.find((i) => i.id === selectedInstrumentId);

  const unitsNum = parseFloat(units) || 0;
  const avgPriceNum = parseFloat(avgPrice) || 0;
  const totalCost = unitsNum * avgPriceNum;

  const handleCreateAccount = () => {
    if (!newAccountName.trim()) {
      setAccountError('Please enter an account name.');
      return;
    }
    setAccountError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('institutionName', newAccountName.trim());
      formData.set('accountType', newAccountType);
      const res = await createAccountAction(formData);
      if (res.error) {
        setAccountError(res.error);
      } else if (res.account) {
        setSelectedAccountId(res.account.id);
        setCreatingAccount(false);
        setNewAccountName('');
        router.refresh();
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedAccountId) {
      setError('Please select or create an account.');
      return;
    }

    if (!selectedInstrumentId) {
      setError('Please select a verified security from the catalogue.');
      return;
    }

    if (unitsNum <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }

    if (avgPriceNum < 0) {
      setError('Average acquisition cost cannot be negative.');
      return;
    }

    const formData = new FormData();
    formData.set('accountId', selectedAccountId);
    formData.set('instrumentId', selectedInstrumentId);
    formData.set('units', String(unitsNum));
    formData.set('averageAcquisitionCost', String(avgPriceNum));
    if (notes) formData.set('notes', notes);

    startTransition(async () => {
      const res = await addHoldingAction(null, formData);
      if (res.error) {
        setError(res.error);
      } else {
        onOpenChange(false);
        // Reset form
        setSelectedInstrumentId('');
        setUnits('');
        setAvgPrice('');
        setNotes('');
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-serif">Add Portfolio Holding</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Record a position in your verified portfolio. Stored securely and scoped to your account.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Account Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Portfolio Account
              </label>
              <button
                type="button"
                onClick={() => setCreatingAccount(!creatingAccount)}
                className="text-xs text-primary hover:underline"
              >
                {creatingAccount ? 'Choose existing account' : '+ New account'}
              </button>
            </div>

            {creatingAccount ? (
              <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
                <Input
                  placeholder="e.g. Zerodha Demat, Groww, CAMS"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="demat">Demat</option>
                    <option value="brokerage">Brokerage</option>
                    <option value="bank">Bank</option>
                    <option value="manual">Manual / Offline</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateAccount}
                    disabled={isPending}
                    className="h-7 text-xs"
                  >
                    {isPending ? <Loader2 className="size-3 animate-spin" /> : 'Create'}
                  </Button>
                </div>
                {accountError && <p className="text-[11px] text-destructive">{accountError}</p>}
              </div>
            ) : (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.institutionName} ({acc.accountType})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Instrument Search & Selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
              Security / Instrument
            </label>
            <div className="relative mb-2">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by symbol, company, or ISIN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>

            <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {filteredInstruments.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  No verified security matches &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredInstruments.map((inst) => {
                  const isSelected = selectedInstrumentId === inst.id;
                  return (
                    <button
                      type="button"
                      key={inst.id}
                      onClick={() => setSelectedInstrumentId(inst.id)}
                      className={`w-full flex items-center justify-between p-2.5 text-left text-xs transition-colors ${
                        isSelected ? 'bg-primary/10 font-semibold' : 'hover:bg-accent/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">{inst.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                            {inst.assetClass}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                          {inst.name}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 className="size-4 text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
            {selectedInstrument && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="size-3" /> Selected: {selectedInstrument.symbol} (
                {selectedInstrument.name})
              </p>
            )}
          </div>

          {/* Quantity & Buy Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="units" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Quantity (Units)
              </label>
              <Input
                id="units"
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="e.g. 10 or 15.420"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="avgPrice" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Avg Buy Price (₹)
              </label>
              <Input
                id="avgPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 2450.50"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Cost Basis Calculation Preview */}
          {totalCost > 0 && (
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Calculated Cost Basis:</span>
              <span className="font-semibold text-foreground tnum">{formatINR(totalCost)}</span>
            </div>
          )}

          {/* Optional Notes */}
          <div>
            <label htmlFor="notes" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">
              Notes (Optional)
            </label>
            <Input
              id="notes"
              placeholder="e.g. SIP installment or Long-term core"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                'Save Holding'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
