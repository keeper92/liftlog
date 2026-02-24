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

const TOOLTIP_MAX_WIDTH = 280;
const VIEWPORT_PADDING = 12;
const TARGET_PADDING = 8;
const TARGET_OFFSET = 14;

const STEPS: TourStep[] = [
  {
    id: 'dashboard',
    target: '[data-tour-anchor="start-workout"]',
    title: 'Dashboard',
    description: 'Start a workout, or resume one in progress.',
    preferredPlacement: 'top',
  },
  {
    id: 'pr',
    target: '[data-tour-anchor="pr-feed"]',
    title: 'PR Feed',
    description: 'See your latest PRs at a glance.',
    preferredPlacement: 'bottom',
  },
  {
    id: 'calendar',
    target: '[data-tour-anchor="history"]',
    title: 'Calendar',
    description: 'Check consistency, streaks, and recent sessions.',
    preferredPlacement: 'bottom',
  },
  {
    id: 'progress',
    target: '[data-tour-anchor="nav-progress"]',
    title: 'Progress',
    description: 'Track trends and exercise stats over time.',
    preferredPlacement: 'top',
  },
  {
    id: 'trainer',
    target: '[data-tour-anchor="nav-trainer"]',
    title: 'Trainer',
    description: 'Build templates and get personalized coaching.',
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
  const canGoNext = findNextMountedStepIndex(stepIndex + 1) !== -1;
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[140]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--primary-foreground)_14%,transparent),transparent_46%)]" />

      <div
        className="animate-tour-highlight pointer-events-none absolute rounded-xl border-2 border-primary/90 bg-primary/10 transition-all duration-200"
        style={{
          ...highlightStyle,
        }}
      />

      <div
        ref={tooltipRef}
        className="absolute z-10 rounded-lg border bg-card p-3 shadow-md animate-fade-in"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          width: tooltipPosition.width,
        }}
      >
        <h3 className="text-base font-semibold tracking-tight text-foreground">{currentStep.title}</h3>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">{currentStep.description}</p>

        <div className="mt-2.5 h-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <Button variant="ghost"
            type="button"
            onClick={onFinish}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip tour
          </Button>

          <Button type="button" size="sm" onClick={goNext} className="min-h-[34px] px-3 text-xs">
            {canGoNext ? 'Next' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  );
}
