'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';

type StepPlacement = 'top' | 'bottom';

interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  preferredPlacement?: StepPlacement;
}

interface DemoFeatureTourProps {
  onFinish: () => void;
}

interface TooltipPosition {
  top: number;
  left: number;
  width: number;
  placement: StepPlacement;
}

const TOOLTIP_MAX_WIDTH = 340;
const VIEWPORT_PADDING = 12;
const TARGET_PADDING = 8;
const TARGET_OFFSET = 14;

const STEPS: TourStep[] = [
  {
    id: 'start',
    target: '[data-tour-anchor="start-workout"]',
    title: 'Start a workout fast',
    description: 'Use this button to jump right into a new workout, or resume one already in progress.',
    preferredPlacement: 'bottom',
  },
  {
    id: 'templates',
    target: '[data-tour-anchor="saved-templates"]',
    title: 'Use saved templates',
    description: 'Templates let you repeat your routines with one tap. Demo data already includes examples.',
    preferredPlacement: 'top',
  },
  {
    id: 'pr',
    target: '[data-tour-anchor="pr-feed"]',
    title: 'Track personal records',
    description: 'Open PR Feed to see your latest highlights and strength milestones.',
    preferredPlacement: 'bottom',
  },
  {
    id: 'history',
    target: '[data-tour-anchor="history"]',
    title: 'Review training history',
    description: 'Use this calendar view to spot consistency patterns and streaks.',
    preferredPlacement: 'bottom',
  },
  {
    id: 'trainer',
    target: '[data-tour-anchor="nav-trainer"]',
    title: 'Try the AI trainer',
    description: 'Open Trainer for workout ideas, progress analysis, and coaching prompts based on your data.',
    preferredPlacement: 'top',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function findNextMountedStepIndex(startIndex: number) {
  for (let i = startIndex; i < STEPS.length; i += 1) {
    if (document.querySelector(STEPS[i].target)) return i;
  }
  return -1;
}

function findPreviousMountedStepIndex(startIndex: number) {
  for (let i = startIndex; i >= 0; i -= 1) {
    if (document.querySelector(STEPS[i].target)) return i;
  }
  return -1;
}

export default function DemoFeatureTour({ onFinish }: DemoFeatureTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onFinish();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onFinish]);

  useEffect(() => {
    const step = STEPS[stepIndex];
    const target = document.querySelector<HTMLElement>(step.target);
    if (!target) {
      onFinish();
      return;
    }

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    const updatePosition = () => {
      const liveTarget = document.querySelector<HTMLElement>(step.target);
      if (!liveTarget) return;

      const rect = liveTarget.getBoundingClientRect();
      setTargetRect(rect);

      const width = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2);
      const left = clamp(
        rect.left + rect.width / 2 - width / 2,
        VIEWPORT_PADDING,
        window.innerWidth - width - VIEWPORT_PADDING,
      );

      const tooltipHeight = tooltipRef.current?.offsetHeight ?? 220;
      const placement =
        step.preferredPlacement ?? (rect.top > window.innerHeight / 2 ? 'top' : 'bottom');
      const topCandidate =
        placement === 'top'
          ? rect.top - tooltipHeight - TARGET_OFFSET
          : rect.bottom + TARGET_OFFSET;

      const top = clamp(
        topCandidate,
        VIEWPORT_PADDING,
        window.innerHeight - tooltipHeight - VIEWPORT_PADDING,
      );

      setTooltipPosition({
        top,
        left,
        width,
        placement,
      });
    };

    updatePosition();
    const timeoutId = window.setTimeout(updatePosition, 260);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [stepIndex, onFinish]);

  const highlightStyle = useMemo(() => {
    if (!targetRect) return null;

    const top = Math.max(VIEWPORT_PADDING, targetRect.top - TARGET_PADDING);
    const left = Math.max(VIEWPORT_PADDING, targetRect.left - TARGET_PADDING);
    const width = Math.max(0, targetRect.width + TARGET_PADDING * 2);
    const height = Math.max(0, targetRect.height + TARGET_PADDING * 2);

    return {
      top,
      left,
      width,
      height,
    };
  }, [targetRect]);

  const goBack = () => {
    const previousIndex = findPreviousMountedStepIndex(stepIndex - 1);
    if (previousIndex !== -1) setStepIndex(previousIndex);
  };

  const goNext = () => {
    const nextIndex = findNextMountedStepIndex(stepIndex + 1);
    if (nextIndex === -1) {
      onFinish();
      return;
    }
    setStepIndex(nextIndex);
  };

  if (!highlightStyle || !tooltipPosition) return null;

  const currentStep = STEPS[stepIndex];
  const canGoBack = findPreviousMountedStepIndex(stepIndex - 1) !== -1;
  const canGoNext = findNextMountedStepIndex(stepIndex + 1) !== -1;
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[140]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_46%)]" />

      <div
        className="animate-tour-highlight pointer-events-none absolute rounded-3xl border-2 border-primary/90 bg-primary/10 transition-all duration-200"
        style={{
          ...highlightStyle,
        }}
      />

      <div
        ref={tooltipRef}
        className="ui-overlay-shell absolute z-10 rounded-3xl p-5 animate-fade-in"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          width: tooltipPosition.width,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface-light/70 px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Demo Tour</p>
          </div>
          <p className="text-xs font-semibold text-text-muted">
            {stepIndex + 1} / {STEPS.length}
          </p>
        </div>

        <h3 className="mt-3 text-[18px] font-semibold tracking-tight text-text">{currentStep.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{currentStep.description}</p>

        <div className="mt-4 h-1.5 rounded-full bg-surface-light">
          <div
            className="h-full rounded-full bg-primary transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onFinish}
            className="text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            {canGoBack && (
              <Button type="button" size="sm" variant="ghost" onClick={goBack}>
                Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={goNext}>
              {canGoNext ? 'Next' : 'Done'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
