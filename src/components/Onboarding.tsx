'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';

interface OnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    title: 'Welcome to reps',
    description: 'Your simple, focused workout tracker with a built-in AI personal trainer. Log your lifts, track your progress, and get stronger.',
    image: null, // No image for welcome slide
    icon: null,
  },
  {
    title: 'Quick Start',
    description: 'Tap Quick Start to begin an empty workout, or choose from templates to get going fast.',
    image: '/onboarding/quick-start.svg',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    title: 'Track Everything',
    description: 'Log exercises, sets, reps, and weight. Use history and progress charts to see your gains.',
    image: '/onboarding/workout.svg',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    title: 'AI Personal Trainer',
    description: 'Chat with your AI personal trainer to plan workouts, get insights on your progress, and receive personalized advice.',
    image: '/onboarding/trainer.svg',
    icon: (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  function handleNext() {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  }

  function handleSkip() {
    onComplete();
  }

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background px-6 py-8">
      <div className="flex-1 flex flex-col items-center justify-center text-center overflow-hidden">
        {/* Screenshot, Icon Fallback, or Logo for welcome slide */}
        {slide.image ? (
          <div className="relative mb-6 flex h-80 w-48 items-center justify-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {imageError[currentSlide] ? (
              <div className="text-primary">{slide.icon}</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.image}
                alt={slide.title}
                className="absolute inset-0 w-full h-full object-cover object-top"
                onError={() => setImageError((prev) => ({ ...prev, [currentSlide]: true }))}
              />
            )}
          </div>
        ) : (
          <p className="mb-8 text-6xl font-bold text-primary">reps</p>
        )}

        <h1 className="text-2xl font-bold text-foreground mb-3">{slide.title}</h1>
        <p className="text-muted-foreground text-sm max-w-xs">{slide.description}</p>
      </div>

      <div className="flex justify-center gap-2 mb-8">
        {slides.map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === currentSlide ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>

      <div className="space-y-3">
        <Button variant="primary" fullWidth size="lg" onClick={handleNext}>
          {isLast ? 'Get Started' : 'Next'}
        </Button>
        {!isLast && (
          <Button variant="ghost"
            onClick={handleSkip}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
