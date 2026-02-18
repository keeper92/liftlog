export type TourStepPlacement = 'top' | 'bottom';
export type TourRouteMatch = 'exact' | 'prefix';
export type TourAdvanceAction = 'close-pr-feed' | 'close-history' | 'discard-workout';

export interface InteractiveTourStep {
  id: string;
  route: string;
  routeMatch: TourRouteMatch;
  target: string;
  title: string;
  description: string;
  placement?: TourStepPlacement;
  requireClick?: boolean;
  autoAdvanceOnClick?: boolean;
  advanceAction?: TourAdvanceAction;
}

export const INTERACTIVE_TOUR_STEPS: InteractiveTourStep[] = [
  {
    id: 'dashboard-overview',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="start-workout"]',
    title: 'This is your home base',
    description: 'Start workouts fast, launch overlays, and jump to the rest of the app from here.',
    placement: 'bottom',
  },
  {
    id: 'start-workout-click',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="start-workout"]',
    title: 'Start a workout',
    description: 'Click Start Workout now. We will quickly preview the workout screen, then come right back.',
    placement: 'bottom',
    requireClick: true,
    autoAdvanceOnClick: true,
  },
  {
    id: 'workout-preview',
    route: '/workout',
    routeMatch: 'prefix',
    target: '[data-tour-anchor="workout-page"]',
    title: 'Workout screen',
    description: 'This is where you log sets, reps, and weight during training.',
    placement: 'top',
    advanceAction: 'discard-workout',
  },
  {
    id: 'open-pr-feed',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="pr-feed"]',
    title: 'Open PR Feed',
    description: 'Click the star button to open your personal records feed.',
    placement: 'bottom',
    requireClick: true,
    autoAdvanceOnClick: true,
  },
  {
    id: 'pr-feed-preview',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="pr-feed-overlay"]',
    title: 'Personal records at a glance',
    description: 'PR Feed highlights your strongest improvements over time.',
    placement: 'top',
    advanceAction: 'close-pr-feed',
  },
  {
    id: 'open-calendar',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="history"]',
    title: 'Open calendar history',
    description: 'Click the calendar button to view consistency and streaks.',
    placement: 'bottom',
    requireClick: true,
    autoAdvanceOnClick: true,
  },
  {
    id: 'calendar-preview',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="history-overlay"]',
    title: 'Review your training pattern',
    description: 'Use this view to inspect training days and past sessions quickly.',
    placement: 'top',
    advanceAction: 'close-history',
  },
  {
    id: 'go-progress',
    route: '/dashboard',
    routeMatch: 'exact',
    target: '[data-tour-anchor="nav-progress"]',
    title: 'Go to Progress',
    description: 'Click Progress in the bottom nav.',
    placement: 'top',
    requireClick: true,
    autoAdvanceOnClick: true,
  },
  {
    id: 'progress-preview',
    route: '/progress',
    routeMatch: 'exact',
    target: '[data-tour-anchor="progress-page"]',
    title: 'Progress trends',
    description: 'Track max weight trends and your key PRs from this page.',
    placement: 'top',
  },
  {
    id: 'go-trainer',
    route: '/progress',
    routeMatch: 'exact',
    target: '[data-tour-anchor="nav-trainer"]',
    title: 'Go to AI Trainer',
    description: 'Click Trainer in the bottom nav.',
    placement: 'top',
    requireClick: true,
    autoAdvanceOnClick: true,
  },
  {
    id: 'trainer-preview',
    route: '/trainer',
    routeMatch: 'exact',
    target: '[data-tour-anchor="trainer-input"]',
    title: 'Your AI coaching chat',
    description: 'Ask for workout ideas, progress analysis, or exercise guidance right here.',
    placement: 'top',
  },
];
