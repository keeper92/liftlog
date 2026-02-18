'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { DEMO_TOUR_PENDING_KEY } from '@/lib/constants/onboarding';
import { INTERACTIVE_TOUR_STEPS, type InteractiveTourStep } from '@/lib/onboarding/interactiveTourSteps';
import { useActiveWorkoutStore } from '@/stores/activeWorkoutStore';

interface TooltipPosition {
  top: number;
  left: number;
  width: number;
}

const TOOLTIP_MAX_WIDTH = 340;
const VIEWPORT_PADDING = 12;
const TARGET_PADDING = 8;
const TARGET_OFFSET = 14;
const STEP_MISSING_LIMIT = 50;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function routeMatches(step: InteractiveTourStep, pathname: string) {
  if (step.routeMatch === 'prefix') {
    return pathname.startsWith(step.route);
  }
  return pathname === step.route;
}

export default function InteractiveTourProvider() {
  const router = useRouter();
  const pathname = usePathname();
  const workoutId = useActiveWorkoutStore((s) => s.workoutId);

  const [introOpen, setIntroOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const [clickedTarget, setClickedTarget] = useState(false);
  const [startedWorkoutDuringTour, setStartedWorkoutDuringTour] = useState(false);

  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const missingStepCounterRef = useRef(0);
  const handledStepClickRef = useRef<string | null>(null);

  const currentStep = isActive ? INTERACTIVE_TOUR_STEPS[stepIndex] : null;
  const isLastStep = stepIndex === INTERACTIVE_TOUR_STEPS.length - 1;

  const dispatchTourEvent = useCallback((eventName: string) => {
    window.dispatchEvent(new Event(eventName));
  }, []);

  const finishTour = useCallback(() => {
    sessionStorage.removeItem(DEMO_TOUR_PENDING_KEY);

    dispatchTourEvent('tour:close-pr-feed');
    dispatchTourEvent('tour:close-history');

    if (startedWorkoutDuringTour && useActiveWorkoutStore.getState().isActive) {
      useActiveWorkoutStore.getState().discardWorkout();
    }

    setStartedWorkoutDuringTour(false);
    setClickedTarget(false);
    setTargetRect(null);
    setTooltipPosition(null);
    setStepIndex(0);
    setIsActive(false);
    setIntroOpen(false);
  }, [dispatchTourEvent, startedWorkoutDuringTour]);

  const runAdvanceAction = useCallback(
    (step: InteractiveTourStep) => {
      if (step.advanceAction === 'close-pr-feed') {
        dispatchTourEvent('tour:close-pr-feed');
      }

      if (step.advanceAction === 'close-history') {
        dispatchTourEvent('tour:close-history');
      }

      if (step.advanceAction === 'discard-workout') {
        if (startedWorkoutDuringTour && useActiveWorkoutStore.getState().isActive) {
          useActiveWorkoutStore.getState().discardWorkout();
          setStartedWorkoutDuringTour(false);
        }
      }
    },
    [dispatchTourEvent, startedWorkoutDuringTour],
  );

  const goNext = useCallback(() => {
    if (!currentStep) return;

    runAdvanceAction(currentStep);

    const nextIndex = stepIndex + 1;
    if (nextIndex >= INTERACTIVE_TOUR_STEPS.length) {
      finishTour();
      return;
    }

    setClickedTarget(false);
    setTargetRect(null);
    setTooltipPosition(null);
    setStepIndex(nextIndex);
  }, [currentStep, finishTour, runAdvanceAction, stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex === 0) return;

    dispatchTourEvent('tour:close-pr-feed');
    dispatchTourEvent('tour:close-history');

    setClickedTarget(false);
    setTargetRect(null);
    setTooltipPosition(null);
    setStepIndex((prev) => prev - 1);
  }, [dispatchTourEvent, stepIndex]);

  const startTour = useCallback(() => {
    sessionStorage.removeItem(DEMO_TOUR_PENDING_KEY);
    setStartedWorkoutDuringTour(false);
    setClickedTarget(false);
    setStepIndex(0);
    setTargetRect(null);
    setTooltipPosition(null);
    setIntroOpen(false);
    setIsActive(true);
  }, []);

  useEffect(() => {
    if (isActive || introOpen) return;
    if (pathname !== '/dashboard') return;
    if (sessionStorage.getItem(DEMO_TOUR_PENDING_KEY) !== '1') return;

    const frameId = window.requestAnimationFrame(() => {
      setIntroOpen(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [introOpen, isActive, pathname]);

  useEffect(() => {
    if (!currentStep) return;
    if (routeMatches(currentStep, pathname)) return;
    if (currentStep.requireClick && currentStep.autoAdvanceOnClick && clickedTarget) return;

    if (currentStep.routeMatch === 'prefix' && currentStep.route === '/workout' && workoutId) {
      router.push(`/workout/${workoutId}`);
      return;
    }

    if (currentStep.routeMatch === 'prefix' && currentStep.route === '/workout' && !workoutId) {
      return;
    }

    router.push(currentStep.route);
  }, [clickedTarget, currentStep, pathname, router, workoutId]);

  useEffect(() => {
    if (!currentStep) return;
    if (!routeMatches(currentStep, pathname)) return;

    const target = document.querySelector<HTMLElement>(currentStep.target);
    if (!target) return;

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }, [currentStep, pathname]);

  useEffect(() => {
    if (!currentStep) return;

    const frameId = window.requestAnimationFrame(() => {
      setClickedTarget(false);
      handledStepClickRef.current = null;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentStep]);

  useEffect(() => {
    if (!currentStep) return;
    if (!routeMatches(currentStep, pathname)) return;

    let disposed = false;

    const updatePosition = () => {
      if (disposed) return;

      const target = document.querySelector<HTMLElement>(currentStep.target);
      if (!target) {
        missingStepCounterRef.current += 1;

        window.requestAnimationFrame(() => {
          if (disposed) return;
          setTargetRect(null);
          setTooltipPosition(null);
        });

        if (missingStepCounterRef.current > STEP_MISSING_LIMIT) {
          missingStepCounterRef.current = 0;
          window.setTimeout(() => {
            if (!disposed) goNext();
          }, 0);
        }

        return;
      }

      missingStepCounterRef.current = 0;

      const rect = target.getBoundingClientRect();
      const width = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2);
      const left = clamp(
        rect.left + rect.width / 2 - width / 2,
        VIEWPORT_PADDING,
        window.innerWidth - width - VIEWPORT_PADDING,
      );

      const tooltipHeight = tooltipRef.current?.offsetHeight ?? 220;
      const placement =
        currentStep.placement ?? (rect.top > window.innerHeight / 2 ? 'top' : 'bottom');
      const topCandidate =
        placement === 'top'
          ? rect.top - tooltipHeight - TARGET_OFFSET
          : rect.bottom + TARGET_OFFSET;
      const top = clamp(
        topCandidate,
        VIEWPORT_PADDING,
        window.innerHeight - tooltipHeight - VIEWPORT_PADDING,
      );

      window.requestAnimationFrame(() => {
        if (disposed) return;
        setTargetRect(rect);
        setTooltipPosition({ top, left, width });
      });
    };

    const tick = () => window.requestAnimationFrame(updatePosition);
    const intervalId = window.setInterval(tick, 200);
    const startFrameId = window.requestAnimationFrame(updatePosition);

    window.addEventListener('resize', tick);
    window.addEventListener('scroll', tick, true);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(startFrameId);
      window.clearInterval(intervalId);
      window.removeEventListener('resize', tick);
      window.removeEventListener('scroll', tick, true);
    };
  }, [currentStep, goNext, pathname]);

  useEffect(() => {
    if (!currentStep?.requireClick) return;
    if (!routeMatches(currentStep, pathname)) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      if (handledStepClickRef.current === currentStep.id) return;

      const matchedElement = target.closest(currentStep.target);
      if (!matchedElement) return;

      handledStepClickRef.current = currentStep.id;

      if (currentStep.id === 'start-workout-click') {
        if (!useActiveWorkoutStore.getState().isActive) {
          setStartedWorkoutDuringTour(true);
        }
      }

      window.requestAnimationFrame(() => {
        setClickedTarget(true);
      });

      if (currentStep.autoAdvanceOnClick) {
        window.setTimeout(() => {
          goNext();
        }, 180);
      }
    };

    window.addEventListener('click', handleClick, true);
    return () => window.removeEventListener('click', handleClick, true);
  }, [currentStep, goNext, pathname]);

  const highlightStyle = useMemo(() => {
    if (!targetRect) return null;

    return {
      top: Math.max(VIEWPORT_PADDING, targetRect.top - TARGET_PADDING),
      left: Math.max(VIEWPORT_PADDING, targetRect.left - TARGET_PADDING),
      width: Math.max(0, targetRect.width + TARGET_PADDING * 2),
      height: Math.max(0, targetRect.height + TARGET_PADDING * 2),
    };
  }, [targetRect]);

  return (
    <>
      <Modal
        isOpen={introOpen}
        onClose={finishTour}
        title="Welcome to the demo"
        actions={[
          { label: 'Skip', variant: 'ghost', onClick: finishTour },
          { label: 'Start Tour', onClick: startTour },
        ]}
      >
        <p className="text-sm leading-relaxed">
          This interactive tour will walk you through the core features step by step.
        </p>
      </Modal>

      {isActive && currentStep && highlightStyle && tooltipPosition && (
        <div className="fixed inset-0 z-[140] pointer-events-none">
          <div
            className="absolute rounded-2xl border-2 border-primary/90 bg-white/5 transition-all duration-200"
            style={{
              ...highlightStyle,
              boxShadow: '0 0 0 9999px rgba(18, 18, 18, 0.56)',
            }}
          />

          <div
            ref={tooltipRef}
            className="pointer-events-auto absolute z-10 rounded-2xl border border-border bg-surface p-4 shadow-xl animate-fade-in"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
              width: tooltipPosition.width,
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Interactive Tour
            </p>
            <h3 className="mt-1 text-base font-semibold text-text">{currentStep.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{currentStep.description}</p>
            <p className="mt-2 text-xs text-text-muted">
              Step {stepIndex + 1} of {INTERACTIVE_TOUR_STEPS.length}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={finishTour}
                className="text-sm font-medium text-text-muted transition-colors hover:text-text"
              >
                Skip Tour
              </button>

              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={goBack}>
                    Back
                  </Button>
                )}

                {currentStep.requireClick && currentStep.autoAdvanceOnClick ? (
                  <span className="text-xs font-medium text-text-muted">
                    {clickedTarget ? 'Moving to next step...' : 'Click highlighted item'}
                  </span>
                ) : (
                  <Button type="button" size="sm" onClick={isLastStep ? finishTour : goNext}>
                    {isLastStep ? 'Done' : 'Next'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
