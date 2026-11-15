'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car,
  GraduationCap,
  Home,
  Palmtree,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Target,
  AlertTriangle,
  Lightbulb,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  Info,
  Loader2,
  Calendar,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/omni/primitives';
import { MentorNotes } from '@/components/omni/mentor-notes';
import { formatINRCompact, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StaggerContainer, StaggerItem } from '@/components/omni/page-transition';
import { motion, AnimatePresence } from 'framer-motion';
import { GoalModal } from './goal-modal';
import { deleteGoalAction } from '@/app/goals/actions';
import type { GoalEntity } from '@/lib/db/schema/goals';
import type { GoalProjectionDetails } from '@/lib/math/financial-projections';

interface RealGoalsViewProps {
  goals: Array<{
    goal: GoalEntity;
    details: GoalProjectionDetails;
  }>;
  totalTargetAmount: number;
  totalCurrentAllocated: number;
  totalMonthlyCommitment: number;
  onTrackCount: number;
  userEmail?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  graduation: GraduationCap,
  palm: Palmtree,
  car: Car,
  shield: ShieldCheck,
};

export function RealGoalsView({
  goals,
  totalTargetAmount,
  totalCurrentAllocated,
  totalMonthlyCommitment,
  onTrackCount,
}: RealGoalsViewProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalEntity | null>(null);

  const handleOpenCreate = () => {
    setEditingGoal(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (goal: GoalEntity) => {
    setEditingGoal(goal);
    setModalOpen(true);
  };

  const overdueCount = goals.filter((g) => g.details.isOverdue && !g.details.isFunded).length;

  return (
    <StaggerContainer>
      <StaggerItem>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            eyebrow="Goal Intelligence"
            title="Are you getting closer to your dreams?"
            question="Every rupee you invest is quietly working toward something. Here is how close each dream is."
          />
          <Button
            onClick={handleOpenCreate}
            size="sm"
            className="self-start sm:self-center gap-1.5 shrink-0"
          >
            <Plus className="size-4" />
            Add Goal
          </Button>
        </div>
      </StaggerItem>

      {/* Top summary stats */}
      <div className="grid gap-4 sm:grid-cols-3 mt-6">
        <StaggerItem>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Saved toward goals</p>
            <p className="tnum mt-2 font-serif text-3xl tracking-tight text-foreground">
              {formatINRCompact(totalCurrentAllocated)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              of {formatINRCompact(totalTargetAmount)} total target
            </p>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">On track</p>
            <p className="tnum mt-2 font-serif text-3xl tracking-tight text-success">
              {onTrackCount} of {goals.length}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {overdueCount > 0 ? `${overdueCount} overdue goal(s) need attention` : 'goals progressing well'}
            </p>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Monthly commitment</p>
            <p className="tnum mt-2 font-serif text-3xl tracking-tight text-foreground">
              {formatINRCompact(totalMonthlyCommitment)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">invested every month</p>
          </Card>
        </StaggerItem>
      </div>

      {/* Empty State */}
      {goals.length === 0 && (
        <StaggerItem className="mt-8">
          <Card className="p-12 text-center border-dashed border-border bg-card/40">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
              <Target className="size-6" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No Goals Defined Yet</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Setting specific milestones like retirement, buying a home, or higher education anchors your investment strategy to real-world timelines.
            </p>
            <div className="mt-6">
              <Button onClick={handleOpenCreate} size="sm" className="gap-1.5">
                <Plus className="size-4" />
                Create Your First Goal
              </Button>
            </div>
          </Card>
        </StaggerItem>
      )}

      {/* Goals List */}
      {goals.length > 0 && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {goals.map(({ goal, details }) => (
            <StaggerItem key={goal.id}>
              <RealGoalCard
                goal={goal}
                details={details}
                onEdit={() => handleOpenEdit(goal)}
              />
            </StaggerItem>
          ))}
        </div>
      )}

      {/* Strategic Allocation Guidance */}
      {goals.length > 0 && (
        <StaggerItem className="mt-8">
          <MentorNotes
            title="Goal Allocation Guidance"
            content={
              overdueCount > 0
                ? `You have ${overdueCount} goal(s) past their milestone date with an unfunded balance. Because contribution deadlines have elapsed, ongoing monthly compounding cannot bridge the gap. Consider routing liquid surplus into these milestones or adjusting their target dates.`
                : onTrackCount === goals.length
                ? `All ${goals.length} of your active goals are currently on track under baseline compounding. As milestone target dates draw closer (< 3 years), systematically shift equity holdings into fixed-income or liquid assets to safeguard accumulated capital from market drawdowns.`
                : `You have ${goals.length - onTrackCount} goal(s) requiring additional SIP contributions to satisfy baseline growth models. Aligning annual salary increments with lagging goals will help close the gap without straining monthly cash flow.`
            }
            confidence={goals.length >= 3 ? 'High' : 'Medium'}
            actionable
          />
        </StaggerItem>
      )}

      {/* Methodology and Compounding Disclosure */}
      <StaggerItem className="mt-6">
        <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0 text-primary mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Mathematical Compounding & Deadline Conventions</p>
            <p className="leading-relaxed">
              Projections are computed using discrete monthly compounding: <span className="font-mono text-foreground/90">FV = P×(1+r/12)ⁿ + PMT×[((1+r/12)ⁿ - 1)/(r/12)]</span>,
              where <span className="font-mono text-foreground/90">n</span> is exact months remaining to the milestone.
              Where only a target year is provided, the deadline is interpreted as December 31 of that year (end of calendar year).
              Where neither target date nor year is provided, the application applies an illustrative five-year default deadline as an editable baseline assumption.
              For goals due today or in the past, no future contributions are projected beyond the deadline.
              Scenario feasibility classifications are deterministic comparisons based on 6.0% (Conservative) and 10.0% (Baseline) return models; they are mathematical illustrations, not statistical Monte Carlo probabilities or guaranteed returns.
            </p>
          </div>
        </div>
      </StaggerItem>

      {/* Goal Modal */}
      <GoalModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        goalToEdit={editingGoal}
        onSuccess={() => router.refresh()}
      />
    </StaggerContainer>
  );
}

function RealGoalCard({
  goal,
  details,
  onEdit,
}: {
  goal: GoalEntity;
  details: GoalProjectionDetails;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const Icon = iconMap[goal.icon] || ShieldCheck;
  const pct = details.fundingPct;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${goal.name}"?`)) {
      startDeleteTransition(async () => {
        await deleteGoalAction(goal.id);
        router.refresh();
      });
    }
  };

  // Status badge styling
  let statusBadgeLabel = 'On track';
  let statusBadgeClass = 'bg-success-muted text-emerald-800 dark:text-success';

  if (details.isFunded) {
    statusBadgeLabel = 'Target Achieved';
    statusBadgeClass = 'bg-success-muted text-emerald-800 dark:text-success';
  } else if (details.isOverdue) {
    statusBadgeLabel = 'Overdue';
    statusBadgeClass = 'bg-danger-muted text-red-800 dark:text-danger';
  } else if (details.isDueToday) {
    statusBadgeLabel = 'Due Today';
    statusBadgeClass = 'bg-gold-muted text-amber-800 dark:text-gold';
  } else if (!details.onTrack) {
    statusBadgeLabel = 'Slightly behind';
    statusBadgeClass = 'bg-warning-muted text-amber-800 dark:text-warning';
  }

  return (
    <Card
      className={cn(
        'flex flex-col transition-colors cursor-pointer',
        isExpanded ? 'border-primary/40 ring-1 ring-primary/20' : 'hover:border-primary/40'
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{goal.name}</h3>
                {goal.category && goal.category !== 'OTHER' && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {goal.category}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Calendar className="size-3 text-muted-foreground shrink-0" />
                <span>
                  {details.targetDate
                    ? `Target: ${details.targetDate.split('T')[0]}`
                    : `Target ${details.targetYear}`}
                </span>
                <span className="text-muted-foreground/60">•</span>
                <span>
                  {details.isOverdue
                    ? 'Deadline passed'
                    : details.isDueToday
                    ? 'Due today'
                    : `${details.monthsRemaining} mo remaining`}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium hidden sm:inline-flex',
                statusBadgeClass
              )}
            >
              {statusBadgeLabel}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit goal"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/40"
            >
              <Pencil className="size-4" />
            </button>

            <button
              onClick={handleDelete}
              title="Delete goal"
              disabled={isDeleting}
              className="p-1.5 text-muted-foreground hover:text-danger rounded-md hover:bg-danger/10"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin text-danger" /> : <Trash2 className="size-4" />}
            </button>

            <button type="button" aria-label={isExpanded ? 'Collapse goal details' : 'Expand goal details'} aria-expanded={isExpanded} className="text-muted-foreground hover:text-foreground p-1">
              {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
            </button>
          </div>
        </div>

        {/* Progress bar and numbers */}
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="tnum font-serif text-2xl tracking-tight text-foreground">
              {formatINRCompact(details.currentAllocatedAmount)}
            </span>
            <span className="tnum text-sm text-muted-foreground">
              of {formatINRCompact(details.targetAmount)}
            </span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-1000',
                details.isFunded
                  ? 'bg-success'
                  : details.isOverdue
                  ? 'bg-danger'
                  : details.onTrack
                  ? 'bg-success'
                  : 'bg-warning'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex justify-between mt-1.5">
            <p className="tnum text-xs text-muted-foreground">{pct}% funded</p>
            <p className="tnum text-xs text-muted-foreground">
              {details.isOverdue || details.isDueToday
                ? `Shortfall: ${formatINRCompact(details.remainingShortfall)}`
                : `SIP: ${formatINRCompact(details.monthlyContribution)}/mo`}
            </p>
          </div>

          {details.isDefaultDeadline && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <div className="flex items-center gap-1.5">
                <Info className="size-3.5 shrink-0" />
                <span>Applied 5-year illustrative default (editable assumption).</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="font-medium underline hover:text-foreground shrink-0 cursor-pointer"
              >
                Set deadline
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Details Drawer */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 pt-2 border-t border-border bg-accent/10">
              {/* Overdue / Due Today Alert */}
              {(details.isOverdue || details.isDueToday) && !details.isFunded && (
                <div className="my-3 p-3 rounded-lg border border-danger/30 bg-danger/10 text-xs text-danger flex items-start gap-2">
                  <Clock className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {details.isOverdue ? 'Milestone Deadline Has Passed' : 'Milestone Due Today'}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Target deadline ({details.deadlineDate}) has elapsed with ₹{details.remainingShortfall.toLocaleString('en-IN')} unfunded.
                      No future monthly contributions are projected beyond the deadline. An immediate lump-sum allocation is required.
                    </p>
                  </div>
                </div>
              )}

              {/* Projection Status & Funding Requirement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pt-4">
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                    <Target className="size-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Projection Status</span>
                  </div>
                  <span
                    className={cn(
                      'text-base font-semibold block font-serif',
                      details.scenarioFeasibility === 'Achieved' || details.scenarioFeasibility === 'High'
                        ? 'text-success'
                        : details.scenarioFeasibility === 'Moderate'
                        ? 'text-info'
                        : details.scenarioFeasibility === 'Overdue'
                        ? 'text-danger'
                        : 'text-warning'
                    )}
                  >
                    {details.feasibilityLabel}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">
                    {details.feasibilityExplanation}
                  </p>
                </div>

                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                    <Lightbulb className="size-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {details.isOverdue || details.isDueToday ? 'Lump Sum Needed' : 'Required SIP'}
                    </span>
                  </div>
                  <span className="text-xl font-serif text-foreground">
                    {details.isOverdue || details.isDueToday
                      ? formatINRCompact(details.remainingShortfall)
                      : formatINRCompact(details.requiredMonthlySavings)}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {details.isOverdue || details.isDueToday
                      ? 'Immediate capital required'
                      : details.monthlySavingsGap > 0
                      ? `₹${formatINRCompact(details.monthlySavingsGap)} monthly shortfall`
                      : 'Planned SIP satisfies target'}
                  </p>
                </div>
              </div>

              {/* Multi-Scenario Projections */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-primary" />
                  Growth Scenarios at Milestone ({details.deadlineDate})
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-lg border border-border bg-card">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase block">Conservative (6%)</span>
                    <span className="text-sm font-semibold text-foreground font-serif block mt-1">
                      {formatINRCompact(details.scenarios.conservative.projectedFutureValue)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-primary/40 bg-primary/5">
                    <span className="text-[10px] text-primary font-medium uppercase block">Baseline (10%)</span>
                    <span className="text-sm font-semibold text-foreground font-serif block mt-1">
                      {formatINRCompact(details.scenarios.baseline.projectedFutureValue)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-border bg-card">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase block">Optimistic (12%)</span>
                    <span className="text-sm font-semibold text-foreground font-serif block mt-1">
                      {formatINRCompact(details.scenarios.optimistic.projectedFutureValue)}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  Zero return (pure contributions): {formatINRCompact(details.scenarios.zeroReturn.projectedFutureValue)}
                  {details.isOverdue && ' (Deadline passed; no future contributions projected)'}
                </p>
              </div>

              {/* Inflation context */}
              {!details.isOverdue && (
                <div className="mb-6 p-3 rounded-lg border border-border/80 bg-card/60 text-xs">
                  <span className="font-medium text-foreground">Inflation Reality Check: </span>
                  <span className="text-muted-foreground">
                    At {details.assumedInflationPct}% annual inflation, purchasing power diminishes over {details.yearsRemaining} years.
                    A future cost equivalent to ₹{formatINRCompact(details.targetAmount)} today would require approximately{' '}
                    <span className="font-semibold text-foreground">{formatINRCompact(details.inflationAdjustedTarget)}</span> by milestone date.
                  </span>
                </div>
              )}

              {/* Risk Factors */}
              <div className="space-y-4 mb-6">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5 text-warning" />
                    Key Risk Factors
                  </h4>
                  <ul className="space-y-1.5">
                    {details.riskFactors.map((risk, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-warning mt-0.5 leading-none">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Suggested Next Steps / Guidance */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2 text-foreground">
                  <CheckCircle2 className="size-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider">Suggested Next Steps</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {details.guidance}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
