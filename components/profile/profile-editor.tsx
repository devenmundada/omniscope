'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { updateProfileAction, type ProfileActionResult } from '@/app/profile/actions';
import type { UserFullProfile } from '@/lib/db/profile';
import {
  User as UserIcon,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sliders,
  DollarSign,
  HeartHandshake,
  EyeOff,
  Eye,
} from 'lucide-react';
import { formatINR } from '@/lib/format';

const ARCHETYPES = [
  {
    title: 'The Patient Compounder',
    desc: 'Automates steady SIPs, avoids short-term noise, lets compounding work undisturbed.',
  },
  {
    title: 'The Strategic Allocator',
    desc: 'Maintains strict asset allocation targets across equities, gold, and fixed income.',
  },
  {
    title: 'The Value Compounder',
    desc: 'Deeply analyzes fundamental moats, valuations, and margins of safety.',
  },
  {
    title: 'The Capital Preserver',
    desc: 'Prioritizes downside protection, debt safety, and liquidity over maximum growth.',
  },
];

const RISK_STYLES = ['Measured & Calculated', 'Conservative & Protective', 'Growth-Oriented & Dynamic'];
const DECISION_STYLES = ['Data-Informed', 'Rule-Based', 'Intuitive & Systematic'];

export function ProfileEditor({ initialData }: { initialData: UserFullProfile }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ProfileActionResult | null>(null);

  const { user, financialProfile } = initialData;
  const prefs = (financialProfile?.preferences || {}) as { hideBalances?: boolean };

  const [riskScore, setRiskScore] = useState<number>(financialProfile?.riskToleranceScore ?? 70);
  const [hideBalances, setHideBalances] = useState<boolean>(prefs.hideBalances ?? false);
  const [archetype, setArchetype] = useState<string>(
    financialProfile?.investorArchetype || 'The Patient Compounder'
  );
  const [riskStyle, setRiskStyle] = useState<string>(
    financialProfile?.riskStyle || 'Measured & Calculated'
  );
  const [decisionStyle, setDecisionStyle] = useState<string>(
    financialProfile?.decisionStyle || 'Data-Informed'
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    const formData = new FormData(e.currentTarget);
    formData.set('riskToleranceScore', String(riskScore));
    formData.set('hideBalances', String(hideBalances));
    formData.set('investorArchetype', archetype);
    formData.set('riskStyle', riskStyle);
    formData.set('decisionStyle', decisionStyle);

    startTransition(async () => {
      const result = await updateProfileAction(null, formData);
      setFeedback(result);
      if (result.success) {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {feedback?.error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Update Failed</p>
            <p className="mt-0.5">{feedback.error}</p>
          </div>
        </div>
      )}

      {feedback?.success && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Profile Saved</p>
            <p className="mt-0.5">Your personal financial profile has been persisted securely.</p>
          </div>
        </div>
      )}

      {/* 1. Identity & Contact */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <UserIcon className="size-5 text-primary" />
          <h2 className="text-lg font-serif font-semibold text-foreground">Verified Identity</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Account ownership and verified authentication credentials. Email is verified via Supabase Auth and cannot be modified directly.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Verified Email
            </label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="bg-muted/50 cursor-not-allowed pr-28 text-muted-foreground"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <ShieldCheck className="size-3" /> Verified
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Managed securely by Supabase Auth.</p>
          </div>

          <div>
            <label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Full Legal Name
            </label>
            <Input
              id="name"
              name="name"
              defaultValue={user.name || financialProfile?.displayName || ''}
              placeholder="e.g. Darshan Bhaiyya"
              required
            />
          </div>

          <div>
            <label htmlFor="displayName" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Display Name
            </label>
            <Input
              id="displayName"
              name="displayName"
              defaultValue={financialProfile?.displayName || user.name || ''}
              placeholder="e.g. Darshan"
            />
          </div>
        </div>
      </Card>

      {/* 2. Financial Personality & Archetype */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="size-5 text-primary" />
          <h2 className="text-lg font-serif font-semibold text-foreground">Wealth DNA & Archetype</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Your psychological profile informs OmniScope&rsquo;s AI mentor recommendations and risk tolerance guardrails.
        </p>

        {/* Investor Archetype Selection */}
        <div className="mb-6">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-3">
            Investor Archetype
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {ARCHETYPES.map((arc) => {
              const selected = archetype === arc.title;
              return (
                <button
                  type="button"
                  key={arc.title}
                  onClick={() => setArchetype(arc.title)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-foreground">{arc.title}</p>
                    {selected && <CheckCircle2 className="size-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{arc.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <div>
            <label htmlFor="riskStyle" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Risk Style
            </label>
            <select
              id="riskStyle"
              value={riskStyle}
              onChange={(e) => setRiskStyle(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {RISK_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="decisionStyle" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Decision Style
            </label>
            <select
              id="decisionStyle"
              value={decisionStyle}
              onChange={(e) => setDecisionStyle(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {DECISION_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Risk Tolerance Slider */}
        <div className="p-4 rounded-xl bg-muted/40 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Risk Tolerance Score</span>
            <span className="text-sm font-bold text-primary tnum">{riskScore} / 100</span>
          </div>
          <input
            aria-label="Risk tolerance score"
            type="range"
            min="0"
            max="100"
            step="1"
            value={riskScore}
            onChange={(e) => setRiskScore(Number(e.target.value))}
            className="w-full accent-primary cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
            <span>Capital Preservation (0)</span>
            <span>Balanced (50)</span>
            <span>Aggressive Compounding (100)</span>
          </div>
        </div>
      </Card>

      {/* 3. Cash Flows & Safety Net */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="size-5 text-primary" />
          <h2 className="text-lg font-serif font-semibold text-foreground">Cash Flows & Safety Net</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Used by Financial Health to calculate emergency buffer adequacy, liquidity coverage, and savings rate.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="monthlyIncome" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Monthly Income (₹)
            </label>
            <Input
              id="monthlyIncome"
              name="monthlyIncome"
              type="number"
              step="1000"
              defaultValue={financialProfile?.monthlyIncome ? Number(financialProfile.monthlyIncome) : ''}
              placeholder="e.g. 150000"
            />
          </div>

          <div>
            <label htmlFor="monthlyExpenses" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Monthly Living Expenses (₹)
            </label>
            <Input
              id="monthlyExpenses"
              name="monthlyExpenses"
              type="number"
              step="1000"
              defaultValue={financialProfile?.monthlyExpenses ? Number(financialProfile.monthlyExpenses) : ''}
              placeholder="e.g. 60000"
            />
          </div>

          <div>
            <label htmlFor="emergencyFundActual" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Current Emergency Fund (₹)
            </label>
            <Input
              id="emergencyFundActual"
              name="emergencyFundActual"
              type="number"
              step="5000"
              defaultValue={financialProfile?.emergencyFundActual ? Number(financialProfile.emergencyFundActual) : ''}
              placeholder="e.g. 360000"
            />
          </div>

          <div>
            <label htmlFor="emergencyFundTargetMonths" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Emergency Target (Months)
            </label>
            <Input
              id="emergencyFundTargetMonths"
              name="emergencyFundTargetMonths"
              type="number"
              min="1"
              max="36"
              defaultValue={financialProfile?.emergencyFundTargetMonths ?? 6}
            />
          </div>
        </div>
      </Card>

      {/* 4. Protection & Insurance */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <HeartHandshake className="size-5 text-primary" />
          <h2 className="text-lg font-serif font-semibold text-foreground">Insurance Protection</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Ensures your financial plan survives black-swan events without forcing equity liquidation.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="termInsuranceCover" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Term Life Insurance Cover (₹)
            </label>
            <Input
              id="termInsuranceCover"
              name="termInsuranceCover"
              type="number"
              step="100000"
              defaultValue={financialProfile?.termInsuranceCover ? Number(financialProfile.termInsuranceCover) : ''}
              placeholder="e.g. 20000000"
            />
          </div>

          <div>
            <label htmlFor="healthInsuranceCover" className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Health Insurance Cover (₹)
            </label>
            <Input
              id="healthInsuranceCover"
              name="healthInsuranceCover"
              type="number"
              step="50000"
              defaultValue={financialProfile?.healthInsuranceCover ? Number(financialProfile.healthInsuranceCover) : ''}
              placeholder="e.g. 1500000"
            />
          </div>
        </div>
      </Card>

      {/* 5. Privacy & Display Preferences */}
      <Card className="p-6">
        <h2 className="text-lg font-serif font-semibold text-foreground mb-4">Privacy & Display</h2>
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
          <div className="flex items-center gap-3">
            {hideBalances ? <EyeOff className="size-5 text-primary" /> : <Eye className="size-5 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium text-foreground">Hide Balances in Public</p>
              <p className="text-xs text-muted-foreground">Obscures net worth and quantities on dashboard and portfolio screens.</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hideBalances}
            aria-label="Hide balances in public"
            onClick={() => setHideBalances(!hideBalances)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              hideBalances ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                hideBalances ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isPending} className="px-8 shadow-sm">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving Profile...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  );
}
