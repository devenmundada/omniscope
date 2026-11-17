'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';
import { ScoreRing } from '@/components/omni/score-ring';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  TrendingUp,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Info,
  ArrowRight,
  ShieldCheck,
  Wallet,
  Building,
  Target,
  Sliders,
  Compass,
} from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import { MentorNotes } from '@/components/omni/mentor-notes';
import { motion, AnimatePresence } from 'framer-motion';
import { formatINRCompact } from '@/lib/format';
import type { FinancialHealthAssessment, EvaluatedPillar } from '@/lib/db/health';
import type { PersonalFinancialSummary } from '@/lib/db/financial-summary';

interface RealHealthViewProps {
  assessment: FinancialHealthAssessment;
  summary: PersonalFinancialSummary;
}

const statusMeta = {
  strong: { label: 'Strong', color: 'text-success', bar: 'bg-success', ring: 'bg-success-muted' },
  fair: { label: 'Fair', color: 'text-gold', bar: 'bg-gold', ring: 'bg-gold-muted' },
  weak: { label: 'Needs attention', color: 'text-danger', bar: 'bg-danger', ring: 'bg-danger-muted' },
  unassessed: { label: 'Unassessed', color: 'text-muted-foreground', bar: 'bg-muted', ring: 'bg-muted' },
} as const;

export function RealHealthView({ assessment, summary }: RealHealthViewProps) {
  const { overallScore, weakestPillar, strongestPillar, pillars, diagnostics } = assessment;

  // Selected pillar for inspection
  const [selectedPillarId, setSelectedPillarId] = useState<string>(
    weakestPillar?.id || pillars[0]?.id || 'emergency'
  );

  const activePillar = pillars.find((p) => p.id === selectedPillarId) || pillars[0];
  const activeMeta = statusMeta[activePillar.status];

  return (
    <StaggerContainer>
      <StaggerItem>
        <PageHeader
          eyebrow="Financial Health Diagnostics"
          title="How healthy are you financially?"
          question="Five core pillars decide your financial wellbeing. Measured from your verified portfolio, profile, and active goals."
        />
      </StaggerItem>

      {/* Overall Score Card */}
      <StaggerItem className="mt-6">
        <Card className="flex flex-col items-center gap-8 p-8 sm:flex-row sm:items-center sm:gap-12">
          <ScoreRing score={overallScore ?? 0} label="out of 100" size={188} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Financial Health Score
              </span>
              <span className="rounded-full bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                v{assessment.engineVersion}
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                Coverage: {assessment.coveragePct}% ({assessment.assessedPillarsCount}/{assessment.totalPillarsCount} assessed)
              </span>
            </div>

            <p className="font-serif text-3xl tracking-tight text-foreground">
              {assessment.ratingLabel}
            </p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {assessment.ratingDescription}
            </p>

            {weakestPillar ? (
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground border-l-2 border-primary/40 pl-3">
                Highest-leverage improvement opportunity:{' '}
                <span className="font-semibold text-foreground">{weakestPillar.label}</span>. Addressing it will directly lift your overall score.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Complete your profile and add active goals to unlock a 100% full-coverage score.
              </p>
            )}
          </div>
        </Card>
      </StaggerItem>

      {/* Pillar Diagnostics Breakdown (Live Baseline Assessment) */}
      <div className="grid gap-6 lg:grid-cols-12 mb-8 mt-8">
        <StaggerItem className="lg:col-span-7">
          <Card className="p-6 h-full flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Pillar Health Profile</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Live verified baseline measurements</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  Engine v{assessment.engineVersion}
                </span>
              </div>

              <div className="space-y-3.5 mt-4">
                {pillars.map((p) => {
                  const meta = statusMeta[p.status];
                  const isSelected = p.id === activePillar.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPillarId(p.id)}
                      className={cn(
                        'p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-2',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border/60 bg-card/40 hover:bg-card hover:border-border'
                      )}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{p.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {p.isAssessed
                              ? `Weight: ${(p.normalizedWeight * 100).toFixed(0)}%`
                              : `Base: ${(p.baseWeight * 100).toFixed(0)}%`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-[11px]">{p.metricValue}</span>
                          <span
                            className={cn(
                              'text-[10px] font-medium px-2 py-0.5 rounded-full',
                              meta.ring,
                              meta.color
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700', meta.bar)}
                          style={{ width: `${p.score}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Click on any pillar to inspect measured drivers</span>
              <span>Dynamic re-weighting active</span>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem className="lg:col-span-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePillar.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <Card className="p-6 h-full border-l-4 border-l-primary bg-primary/5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Pillar Diagnostic Inspection
                      </span>
                      <h2 className="text-lg font-semibold text-foreground mt-0.5">
                        {activePillar.label}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{activePillar.question}</p>
                    </div>
                    <span className="tnum font-serif text-2xl text-foreground font-semibold">
                      {activePillar.isAssessed ? activePillar.score : '—'}
                      <span className="text-xs text-muted-foreground font-sans font-normal ml-1">/100</span>
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <div className="flex items-center gap-2 mb-1 text-foreground">
                        <Activity className="size-4 text-primary" />
                        <h3 className="font-medium text-xs uppercase tracking-wider">Measured Value</h3>
                      </div>
                      <p className="text-xs text-foreground font-semibold font-mono bg-card/60 p-2 rounded border border-border/60">
                        {activePillar.metricLabel}: {activePillar.metricValue}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1 text-foreground">
                        <TrendingUp className="size-4 text-success" />
                        <h3 className="font-medium text-xs uppercase tracking-wider">Evaluation Rationale</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activePillar.insight}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1 text-foreground">
                        <Sparkles className="size-4 text-gold" />
                        <h3 className="font-medium text-xs uppercase tracking-wider">Suggested Next Step</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {activePillar.recommendation}
                      </p>
                    </div>
                  </div>
                </div>

                {!activePillar.isAssessed && (
                  <div className="pt-3 border-t border-border/50 mt-4">
                    <Link
                      href={activePillar.id === 'goals' ? '/goals' : '/profile'}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      Update {activePillar.id === 'goals' ? 'Goals' : 'Profile'} to assess this pillar
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                )}
              </Card>
            </motion.div>
          </AnimatePresence>
        </StaggerItem>
      </div>

      {/* Longitudinal Tracking Disclosure */}
      <StaggerItem className="mb-6">
        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0 text-primary mt-0.5" />
          <p className="leading-relaxed">
            {assessment.historicalTrackingDisclosure}
          </p>
        </div>
      </StaggerItem>

      {/* Identified Assets vs Liabilities Disclaimer Card */}
      <StaggerItem className="mt-6">
        <Card className="p-6 bg-card/60 border-border">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="size-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Identified Liquid & Invested Assets
                </h2>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                {summary.assets.disclaimer}
              </p>
            </div>

            <div className="flex items-center gap-6 divide-x divide-border">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Liquid Buffer</p>
                <p className="font-serif text-lg font-semibold text-foreground">
                  {formatINRCompact(summary.assets.identifiedLiquidAssets)}
                </p>
              </div>
              <div className="pl-6">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Invested Portfolio</p>
                <p className="font-serif text-lg font-semibold text-foreground">
                  {formatINRCompact(summary.assets.identifiedInvestedAssets)}
                </p>
              </div>
              <div className="pl-6">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Identified</p>
                <p className="font-serif text-lg font-semibold text-primary">
                  {formatINRCompact(summary.assets.totalIdentifiedAssets)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </StaggerItem>

      {/* Risk Diagnostics Section */}
      {diagnostics.length > 0 && (
        <StaggerItem className="mt-8">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-2">
              <ShieldAlert className="size-4 text-warning" />
              Active Risk Diagnostics ({diagnostics.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {diagnostics.map((diag) => (
                <Card
                  key={diag.id}
                  className={cn(
                    'p-4 border-l-4',
                    diag.severity === 'high'
                      ? 'border-l-danger bg-danger/5'
                      : 'border-l-warning bg-warning/5'
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{diag.title}</h3>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0',
                        diag.severity === 'high'
                          ? 'bg-danger/20 text-danger'
                          : 'bg-warning/20 text-warning'
                      )}
                    >
                      {diag.severity}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {diag.description}
                  </p>
                  <div className="rounded-md bg-card/80 p-2.5 text-xs text-foreground flex items-start gap-1.5 border border-border/50">
                    <ArrowRight className="size-3.5 shrink-0 text-primary mt-0.5" />
                    <span>{diag.actionableStep}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </StaggerItem>
      )}

      {/* Diagnostic Guidance */}
      <StaggerItem className="mt-8">
        <MentorNotes
          title="Financial Health Diagnostic Guidance"
          content={
            assessment.confidence === 'High'
              ? `Your health score reflects verified real-world inputs. You have populated ${assessment.assessedPillarsCount} of 5 pillars. Your strongest foundation is ${strongestPillar?.label || 'your assets'}, while ${weakestPillar?.label || 'other pillars'} represent the key leverage point to fortify your wealth architecture.`
              : `Your health score is currently based on ${assessment.assessedPillarsCount} assessed pillar(s). We have dynamically normalized the score so missing data does not unfairly penalize you. To achieve high confidence, consider updating your monthly income, living expenses, or adding active goals.`
          }
          confidence={assessment.confidence}
        />
      </StaggerItem>

      {/* The Five Pillars Full Cards */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Pillar Action Plans
          </h2>
          <span className="text-xs text-muted-foreground">
            Dynamic weight re-normalization enabled
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {pillars.map((p) => {
            const meta = statusMeta[p.status];
            return (
              <StaggerItem key={p.id}>
                <Card className="p-6 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold text-foreground">{p.label}</h2>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {p.isAssessed
                              ? `Weight: ${(p.normalizedWeight * 100).toFixed(0)}%`
                              : `Base: ${(p.baseWeight * 100).toFixed(0)}%`}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{p.question}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                          meta.ring,
                          meta.color
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>

                    {p.isAssessed ? (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">{p.metricLabel}:</span>
                          <span className="font-semibold text-foreground">{p.metricValue}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn('h-full rounded-full transition-all duration-700', meta.bar)}
                              style={{ width: `${p.score}%` }}
                            />
                          </div>
                          <span className="tnum w-9 text-right text-sm font-semibold text-foreground">
                            {p.score}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border text-center">
                        <p className="text-xs text-muted-foreground mb-2">{p.metricLabel}</p>
                        <Link
                          href={p.id === 'goals' ? '/goals' : '/profile'}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          Provide data in {p.id === 'goals' ? 'Goals' : 'Profile'}
                          <ArrowRight className="size-3" />
                        </Link>
                      </div>
                    )}

                    <p className="mt-4 text-sm leading-relaxed text-muted-foreground text-pretty">
                      {p.insight}
                    </p>
                  </div>

                  <div className="pt-3 mt-4 border-t border-border/50 text-xs text-muted-foreground flex items-start gap-1.5">
                    <Info className="size-3.5 shrink-0 text-primary mt-0.5" />
                    <span>
                      <strong className="text-foreground">Suggested next step:</strong> {p.recommendation}
                    </span>
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </div>
      </section>

      {/* Methodology note */}
      <StaggerItem className="mt-8 mb-4">
        <p className="text-[11px] text-muted-foreground text-center">
          {assessment.methodologyDisclosure}
        </p>
      </StaggerItem>
    </StaggerContainer>
  );
}
