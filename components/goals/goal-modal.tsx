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
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveGoalAction } from '@/app/goals/actions';
import type { GoalEntity } from '@/lib/db/schema/goals';
import { Loader2, AlertCircle, Home, GraduationCap, Palmtree, Car, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';

interface GoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalToEdit?: GoalEntity | null;
  onSuccess?: () => void;
}

const icons = [
  { id: 'palm', label: 'Retirement / Freedom', icon: Palmtree },
  { id: 'home', label: 'Home / Real Estate', icon: Home },
  { id: 'graduation', label: 'Education / Upskilling', icon: GraduationCap },
  { id: 'car', label: 'Vehicle / Travel', icon: Car },
  { id: 'shield', label: 'Protection / Emergency', icon: ShieldCheck },
] as const;

const categories = [
  { id: 'RETIREMENT', label: 'Retirement / Freedom' },
  { id: 'HOUSING', label: 'Housing / Real Estate' },
  { id: 'EDUCATION', label: 'Higher Education' },
  { id: 'VEHICLE', label: 'Vehicle' },
  { id: 'EMERGENCY', label: 'Emergency Fund' },
  { id: 'OTHER', label: 'Other Goal' },
] as const;

export function GoalModal({
  open,
  onOpenChange,
  goalToEdit,
  onSuccess,
}: GoalModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {goalToEdit ? 'Edit Financial Goal' : 'Create Financial Goal'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Define your milestone target and monthly SIP commitment to calculate compounding projections.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <GoalForm
            key={goalToEdit?.id ?? 'create-new-goal'}
            goalToEdit={goalToEdit}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({
  goalToEdit,
  onClose,
  onSuccess,
}: {
  goalToEdit?: GoalEntity | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const meta = (goalToEdit?.metadata || {}) as { assumedCagrPct?: number; assumedInflationPct?: number };

  const initialTargetDate = goalToEdit?.targetDate
    ? (goalToEdit.targetDate instanceof Date
        ? goalToEdit.targetDate.toISOString().split('T')[0]
        : String(goalToEdit.targetDate).split('T')[0])
    : '';

  // Form states initialized directly from goalToEdit
  const [name, setName] = useState(goalToEdit?.name ?? '');
  const [icon, setIcon] = useState<string>(goalToEdit?.icon ?? 'palm');
  const [category, setCategory] = useState<string>(goalToEdit?.category ?? 'RETIREMENT');
  const [targetAmount, setTargetAmount] = useState(goalToEdit?.targetAmount ?? '');
  const [currentAllocated, setCurrentAllocated] = useState(goalToEdit?.currentAllocatedAmount ?? '0');
  const [monthlyContribution, setMonthlyContribution] = useState(goalToEdit?.monthlyContribution ?? '');
  const [targetYear, setTargetYear] = useState(String(goalToEdit?.targetYear ?? currentYear + 10));
  const [targetDate, setTargetDate] = useState(initialTargetDate);
  const [notes, setNotes] = useState(goalToEdit?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [assumedCagrPct, setAssumedCagrPct] = useState(
    meta.assumedCagrPct !== undefined ? String(meta.assumedCagrPct) : '10.0'
  );
  const [assumedInflationPct, setAssumedInflationPct] = useState(
    meta.assumedInflationPct !== undefined ? String(meta.assumedInflationPct) : '6.0'
  );

  const handleDateChange = (val: string) => {
    setTargetDate(val);
    if (val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        setTargetYear(String(parsed.getUTCFullYear()));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a goal name.');
      return;
    }
    const target = parseFloat(targetAmount);
    if (isNaN(target) || target <= 0) {
      setError('Target amount must be a positive number.');
      return;
    }
    const year = parseInt(targetYear, 10);
    if (isNaN(year) || year < 1990 || year > currentYear + 100) {
      setError('Please provide a valid calendar target year.');
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      if (goalToEdit?.id) {
        formData.set('id', goalToEdit.id);
      }
      formData.set('name', name.trim());
      formData.set('icon', icon);
      formData.set('category', category);
      formData.set('targetAmount', targetAmount);
      formData.set('currentAllocatedAmount', currentAllocated || '0');
      formData.set('monthlyContribution', monthlyContribution || '0');
      formData.set('targetYear', targetYear);
      formData.set('targetDate', targetDate || '');
      formData.set('notes', notes.trim());
      formData.set('assumedCagrPct', assumedCagrPct || '10.0');
      formData.set('assumedInflationPct', assumedInflationPct || '6.0');

      const res = await saveGoalAction(formData);
      if (res.error) {
        setError(res.error);
      } else {
        onClose();
        router.refresh();
        if (onSuccess) onSuccess();
      }
    });
  };

  return (
    <>
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-xs text-danger mb-2">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Goal Name */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Goal Name *
          </label>
          <Input
            type="text"
            placeholder="e.g. Financial Freedom, Home Down Payment"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-card border-border"
          />
        </div>

        {/* Icon Selector */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Select Icon
          </label>
          <div className="grid grid-cols-5 gap-2">
            {icons.map((item) => {
              const IconComponent = item.icon;
              const isSelected = icon === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIcon(item.id)}
                  className={cn(
                    'flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                      : 'border-border bg-card/50 text-muted-foreground hover:bg-card hover:text-foreground'
                  )}
                  title={item.label}
                >
                  <IconComponent className="size-5 mb-1" />
                  <span className="text-[10px] truncate max-w-full font-medium">{item.id}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Target Amount */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Target Amount (₹) *
          </label>
          <Input
            type="number"
            step="1000"
            min="1000"
            placeholder="e.g. 5000000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            required
            className="bg-card border-border"
          />
          {parseFloat(targetAmount) > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {formatINR(parseFloat(targetAmount))}
            </p>
          )}
        </div>

        {/* Target Deadline: Exact Date or Year */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Target Year *
            </label>
            <Input
              type="number"
              min="1990"
              max={currentYear + 100}
              placeholder={String(currentYear + 10)}
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
              required
              className="bg-card border-border"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {targetDate
                ? `Derived from specific date.`
                : `Interpreted as Dec 31, ${targetYear} (calendar year end).`}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Exact Target Date (Optional)
            </label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-card border-border text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave blank to use end of target year.
            </p>
          </div>
        </div>

        {/* Current Allocated & Monthly SIP */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Current Allocated Corpus (₹)
            </label>
            <Input
              type="number"
              step="1000"
              min="0"
              placeholder="0"
              value={currentAllocated}
              onChange={(e) => setCurrentAllocated(e.target.value)}
              className="bg-card border-border"
            />
            {parseFloat(currentAllocated) > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {formatINR(parseFloat(currentAllocated))}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Planned Monthly SIP (₹)
            </label>
            <Input
              type="number"
              step="500"
              min="0"
              placeholder="0"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(e.target.value)}
              className="bg-card border-border"
            />
            {parseFloat(monthlyContribution) > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {formatINR(parseFloat(monthlyContribution))}/month
              </p>
            )}
          </div>
        </div>

        {/* Advanced assumptions toggle */}
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-primary hover:underline font-medium"
          >
            {showAdvanced ? 'Hide Compounding Assumptions' : 'Customize Compounding & Inflation Assumptions'}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 mt-3 p-3 rounded-lg bg-accent/20 border border-border">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Expected CAGR (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  max="25"
                  value={assumedCagrPct}
                  onChange={(e) => setAssumedCagrPct(e.target.value)}
                  className="h-8 text-xs bg-card border-border"
                />
                <span className="text-[10px] text-muted-foreground">Baseline growth model</span>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Assumed Inflation (%)
                </label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="15"
                  value={assumedInflationPct}
                  onChange={(e) => setAssumedInflationPct(e.target.value)}
                  className="h-8 text-xs bg-card border-border"
                />
                <span className="text-[10px] text-muted-foreground">Annual cost rise</span>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
            Personal Notes
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Move to liquid debt funds 2 years prior to milestone date."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-card p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
            {goalToEdit ? 'Save Changes' : 'Create Goal'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
