import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { createClient } from '@supabase/supabase-js';
import { matchExercises } from '@/lib/utils/exerciseMatcher';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a knowledgeable, motivating personal trainer inside the "reps" fitness app. Your name is Trainer.

CONVERSATION STYLE (critical — follow this closely):
- Keep every response to 1-2 sentences. Never send walls of text. Think texting, not email.
- Prefer a quick back-and-forth over explaining everything at once. Ask one thing, get an answer, then follow up.
- Almost every response should end with a "suggestions:" line — give the user 2-4 tappable reply options so they can respond with one tap.
- The suggestions line MUST be the very last line and start with exactly "suggestions:" with options separated by "|". Example: suggestions:Full body|Push/Pull/Legs|Upper/Lower
- Keep each suggestion short (1-4 words). They appear as buttons in the app.
- Even for advice or info, end with a follow-up question + suggestions to keep the conversation going. For example, after giving a tip, ask "Want to go deeper on this?" with suggestions like: suggestions:Yes, tell me more|That's enough|Another tip
- The ONLY time to skip suggestions is a simple final confirmation or acknowledgment with nothing left to discuss.

Guidelines:
- Use the user's workout data to give specific, personalized advice
- Be encouraging but honest — reference specific exercises, weights, and trends
- Use plain text, no markdown formatting. Keep it conversational.
- When suggesting exercises, consider what equipment the user has used before
- If the user has no workout data yet, give general beginner-friendly advice

IMPORT CAPABILITY:
When the user wants to import workout data (pastes workout logs, mentions importing, or uploads a file):
1. Parse the data to extract: dates, exercise names, sets with weights and reps (or time/distance for cardio)
2. Use the import_workouts tool to show a preview or ask clarifying questions
3. Common formats: "Exercise: Weight x Reps", CSV data, "Date: Exercise sets", Strong app exports
4. If exercise names are abbreviated or unclear, include them in the questions array
5. If weight units are ambiguous, ask the user
6. After the user confirms, call import_workouts again with needsConfirmation: false

When presenting import previews, be concise. Example:
"I found 3 workouts from Jan 10-15. Here's what I parsed:
- Bench Press: 3 sets (135-175 lbs)
- Squat: 4 sets (185-225 lbs)
Ready to import? Just say 'yes' or let me know if anything needs fixing."

TEMPLATE CAPABILITY:
When the user asks you to create a workout template, program, split, or routine:
1. Keep it fast and practical. Ask the fewest questions possible.
2. First ask them to pick ONE option: Upper body, Lower body, or Full body.
3. After they choose, call create_template right away unless there is a critical blocker.
4. Template rules: exactly 5 exercises, exactly 3 sets per exercise, and no prescribed weights/reps.
5. Prefer exercises the user has done recently; then fill gaps with standard movements that match their equipment/profile.
6. Use full, standard exercise names (e.g., "Barbell Bench Press" not "bench").
7. After proposing a template, invite quick edits (swap/replace/try new exercise) and regenerate with create_template when requested.
8. If the user asks for a multi-day program, create one template at a time and ask if they want the next one.`;

const PROFILE_SETUP_SYSTEM_PROMPT = `You are a knowledgeable, motivating personal trainer inside the "reps" fitness app. Your name is Trainer.

You are getting to know a new user so you can personalize their training experience. Learn about these topics one at a time across several messages:

1. Experience level (beginner, intermediate, advanced)
2. Training frequency (days per week, session length)
3. Goals (muscle building, strength, fat loss, general fitness, sport performance, etc.)
4. Gym & equipment (where they train, what they have access to)
5. Favorites & preferences (favorite exercises, anything they avoid or can't do)
6. Anything else (injuries, schedule constraints, upcoming events)

CONVERSATION STYLE (critical — follow this closely):
- Ask ONE question per message. Keep it to 1-2 sentences max.
- Always end with a "suggestions:" line with 2-4 tappable reply options. Example: suggestions:Beginner|Intermediate|Advanced
- The suggestions line MUST be the very last line and start with exactly "suggestions:" with options separated by "|".
- Keep each suggestion short (1-4 words).
- React briefly to their answer before asking the next question.
- Use plain text, no markdown formatting.
- When you have enough info (at least experience level, goals, and a couple other topics), call the save_trainer_profile tool with a brief friendly confirmation.`;

const IMPORT_TOOL: Tool = {
  name: 'import_workouts',
  description: 'Parse and import workout data into the user\'s history. Use with needsConfirmation=true to show preview, then with needsConfirmation=false after user confirms.',
  input_schema: {
    type: 'object' as const,
    properties: {
      workouts: {
        type: 'array',
        description: 'Array of workouts to import',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'ISO 8601 date string (e.g., 2024-01-15T09:00:00Z)' },
            name: { type: 'string', description: 'Workout name (e.g., Upper Body, Leg Day)' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Exercise name as parsed from input' },
                  sets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        weight: { type: 'number', description: 'Weight in user\'s preferred unit system' },
                        reps: { type: 'number', description: 'Number of repetitions' },
                        time: { type: 'number', description: 'Duration in seconds (for cardio)' },
                        distance: { type: 'number', description: 'Distance in user\'s preferred unit (for cardio)' },
                        isWarmup: { type: 'boolean', description: 'Whether this is a warmup set' },
                      },
                    },
                  },
                },
                required: ['name', 'sets'],
              },
            },
          },
          required: ['date', 'exercises'],
        },
      },
      needsConfirmation: {
        type: 'boolean',
        description: 'Set to true for preview (user must confirm), false to execute import',
      },
      questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Clarifying questions for the user (e.g., unclear exercise names, ambiguous units)',
      },
    },
    required: ['workouts', 'needsConfirmation'],
  },
};

const PROFILE_TOOL: Tool = {
  name: 'save_trainer_profile',
  description: 'Save the user\'s training profile after gathering enough info from the conversation. Call this when you have learned about their experience level, goals, and at least a couple other topics (frequency, equipment, preferences).',
  input_schema: {
    type: 'object' as const,
    properties: {
      experienceLevel: { type: 'string', description: 'Beginner, intermediate, or advanced (or more specific)' },
      trainingFrequency: { type: 'string', description: 'How often they train (e.g., "4 days per week")' },
      sessionDuration: { type: 'string', description: 'Typical session length (e.g., "60-90 minutes")' },
      goals: {
        type: 'array',
        items: { type: 'string' },
        description: 'Training goals (e.g., "build muscle", "lose fat", "get stronger")',
      },
      gymAccess: { type: 'string', description: 'Where they train and general equipment situation' },
      availableEquipment: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific equipment available (e.g., "barbell", "dumbbells", "cable machine")',
      },
      favoriteExercises: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exercises the user enjoys or wants to focus on',
      },
      dislikedOrAvoidedExercises: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exercises the user avoids (injuries, preferences)',
      },
      additionalNotes: { type: 'string', description: 'Any other relevant info (injuries, schedule constraints, upcoming events)' },
    },
    required: ['experienceLevel', 'goals'],
  },
};

const TEMPLATE_TOOL: Tool = {
  name: 'create_template',
  description: 'Create a workout template that the user can reuse. Use this when the user asks you to build a workout, program, split, routine, or template.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Template name (e.g., "Push Day", "Upper Body A", "Leg Day")',
      },
      exercises: {
        type: 'array',
        description: 'List of exercises in the template',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full exercise name (e.g., "Barbell Bench Press", "Dumbbell Lateral Raise")' },
            defaultSets: { type: 'number', description: 'Number of working sets (typically 3-5)' },
          },
          required: ['name', 'defaultSets'],
        },
      },
    },
    required: ['name', 'exercises'],
  },
};

const ADD_EXERCISE_TOOL: Tool = {
  name: 'add_exercise',
  description: 'Add an exercise to the user\'s current workout. Use this when the user asks to add a specific exercise, or when suggesting exercises during a workout session.',
  input_schema: {
    type: 'object' as const,
    properties: {
      exerciseName: {
        type: 'string',
        description: 'The name of the exercise to add (e.g., "Barbell Bench Press", "Dumbbell Curl"). Use full, standard exercise names.',
      },
    },
    required: ['exerciseName'],
  },
};

const WORKOUT_MODE_PROMPT_SECTION = `
WORKOUT MODE:
The user is currently in an active workout session. You can help them:
- Add exercises: when they ask to add an exercise, use the add_exercise tool with the full exercise name.
- Suggest exercises: based on what they've already done and their training history.
- Give form tips and weight suggestions based on their previous performance data.
- Keep responses very short (1 sentence max) since they're mid-workout.
- Don't be chatty — be direct and action-oriented.`;

interface TrainerProfileData {
  experienceLevel: string;
  trainingFrequency?: string;
  sessionDuration?: string;
  goals: string[];
  gymAccess?: string;
  availableEquipment?: string[];
  favoriteExercises?: string[];
  dislikedOrAvoidedExercises?: string[];
  additionalNotes?: string;
}

interface WorkoutContext {
  unitSystem: string;
  recentWorkouts: {
    name: string;
    date: string;
    exercises: string[];
    totalSets: number;
    totalVolume: number;
  }[];
  personalRecords: {
    exerciseName: string;
    maxWeight: number;
    maxReps: number;
    estimated1RM: number;
  }[];
  weeklyStats: {
    workouts: number;
    volume: number;
    streak: number;
  } | null;
  currentExercise?: {
    id: string;
    name: string;
    history: { date: string; sets: { weight: number; reps: number }[] }[];
    similarExercises: string[];
  };
  trainerProfile?: TrainerProfileData;
}

interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

type TemplateSplit = 'upper' | 'lower' | 'full';

interface TemplateToolInput {
  name?: unknown;
  exercises?: Array<{ name?: unknown; defaultSets?: unknown }>;
}

interface NormalizedTemplateData {
  name: string;
  exercises: { name: string; defaultSets: number }[];
}

const UPPER_EXERCISE_KEYWORDS = [
  'bench', 'press', 'row', 'pull', 'lat', 'chest', 'back', 'shoulder', 'delt', 'curl', 'tricep', 'dip', 'fly', 'chin', 'pulldown',
];

const LOWER_EXERCISE_KEYWORDS = [
  'squat', 'deadlift', 'lunge', 'leg', 'hamstring', 'quad', 'glute', 'calf', 'hip thrust', 'rdl', 'split squat', 'step up',
];

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function countKeywordHits(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  return keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? 1 : 0), 0);
}

interface TemplateSlot {
  id: string;
  keywords: string[];
  fallback: string;
}

const TEMPLATE_SLOT_PLANS: Record<TemplateSplit, TemplateSlot[]> = {
  upper: [
    { id: 'horizontal-push', keywords: ['bench', 'chest press', 'incline press', 'push-up', 'dip'], fallback: 'Barbell Bench Press' },
    { id: 'horizontal-pull', keywords: ['row', 'seated row', 'cable row', 'dumbbell row', 't-bar row'], fallback: 'Seated Cable Row' },
    { id: 'vertical-push', keywords: ['overhead press', 'shoulder press', 'military press', 'arnold press', 'landmine press'], fallback: 'Dumbbell Shoulder Press' },
    { id: 'vertical-pull', keywords: ['lat pulldown', 'pull-up', 'chin-up', 'assisted pull-up', 'pulldown'], fallback: 'Lat Pulldown' },
    { id: 'upper-accessory', keywords: ['curl', 'tricep', 'lateral raise', 'face pull', 'rear delt', 'pec deck'], fallback: 'Dumbbell Biceps Curl' },
  ],
  lower: [
    { id: 'squat-pattern', keywords: ['squat', 'leg press', 'hack squat', 'goblet squat', 'front squat', 'back squat'], fallback: 'Barbell Back Squat' },
    { id: 'hinge-pattern', keywords: ['deadlift', 'romanian deadlift', 'rdl', 'hip thrust', 'good morning'], fallback: 'Romanian Deadlift' },
    { id: 'unilateral', keywords: ['lunge', 'split squat', 'step-up', 'step up', 'rear-foot elevated'], fallback: 'Walking Lunges' },
    { id: 'hamstring-focus', keywords: ['leg curl', 'hamstring curl', 'glute ham', 'nordic'], fallback: 'Seated Leg Curl' },
    { id: 'quad-calf-accessory', keywords: ['leg extension', 'calf raise', 'hack squat', 'bulgarian split squat'], fallback: 'Leg Extension' },
  ],
  full: [
    { id: 'lower-compound', keywords: ['squat', 'lunge', 'leg press', 'front squat', 'back squat'], fallback: 'Barbell Back Squat' },
    { id: 'upper-push', keywords: ['bench', 'press', 'push-up', 'dip', 'chest press'], fallback: 'Barbell Bench Press' },
    { id: 'upper-pull', keywords: ['row', 'pull-up', 'lat pulldown', 'cable row', 'chin-up'], fallback: 'Seated Cable Row' },
    { id: 'hinge-pattern', keywords: ['deadlift', 'romanian deadlift', 'rdl', 'hip thrust', 'good morning'], fallback: 'Romanian Deadlift' },
    { id: 'upper-accessory', keywords: ['shoulder press', 'overhead press', 'lateral raise', 'face pull', 'curl'], fallback: 'Dumbbell Shoulder Press' },
  ],
};

type TemplateCandidateSource = 'provided' | 'recent' | 'fallback' | 'global';

interface TemplateCandidate {
  name: string;
  key: string;
  source: TemplateCandidateSource;
  sourceRank: number;
  order: number;
}

function scoreExerciseNameForSplit(exerciseName: string, split: TemplateSplit): number {
  if (split === 'full') {
    const upperScore = countKeywordHits(exerciseName, UPPER_EXERCISE_KEYWORDS);
    const lowerScore = countKeywordHits(exerciseName, LOWER_EXERCISE_KEYWORDS);
    return Math.max(1, upperScore + lowerScore);
  }

  const name = exerciseName.toLowerCase();
  const keywords = split === 'upper' ? UPPER_EXERCISE_KEYWORDS : LOWER_EXERCISE_KEYWORDS;
  return keywords.reduce((score, keyword) => score + (name.includes(keyword) ? 1 : 0), 0);
}

function inferTemplateSplitFromExercises(exercises: string[]): TemplateSplit | null {
  if (exercises.length === 0) return null;
  let upper = 0;
  let lower = 0;
  for (const exercise of exercises) {
    upper += countKeywordHits(exercise, UPPER_EXERCISE_KEYWORDS);
    lower += countKeywordHits(exercise, LOWER_EXERCISE_KEYWORDS);
  }

  if (upper === 0 && lower === 0) return null;
  if (upper >= lower + 2) return 'upper';
  if (lower >= upper + 2) return 'lower';
  return null;
}

function inferTemplateSplit(name: string, messages: ChatRequestMessage[], providedExercises: string[]): TemplateSplit {
  const recentText = messages.slice(-4).map((m) => m.content.toLowerCase()).join(' ');
  const combined = `${name.toLowerCase()} ${recentText}`;
  if (/\b(lower body|lower|leg day|legs)\b/.test(combined)) return 'lower';
  if (/\b(upper body|upper|push day|pull day|push\/pull)\b/.test(combined)) return 'upper';
  if (/\b(full body|full)\b/.test(combined)) return 'full';

  const inferredFromExercises = inferTemplateSplitFromExercises(providedExercises);
  if (inferredFromExercises) return inferredFromExercises;

  return 'full';
}

function getTopRecentExercises(recentWorkouts: WorkoutContext['recentWorkouts']): string[] {
  const counts = new Map<string, number>();
  for (const workout of recentWorkouts) {
    for (const exerciseName of workout.exercises) {
      const normalized = normalizeText(exerciseName);
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([name]) => name);
}

function getRecentExercisesBySplit(recentWorkouts: WorkoutContext['recentWorkouts'], split: TemplateSplit): string[] {
  const ranked = getTopRecentExercises(recentWorkouts);
  if (split === 'full') return ranked;

  return ranked.filter((name) => scoreExerciseNameForSplit(name, split) > 0);
}

function wantsNovelExercise(messages: ChatRequestMessage[]): boolean {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
  return /\b(new exercise|new move|something new|different exercise|try new|different one|new one)\b/.test(lastMessage);
}

function isAvoidedExercise(exerciseName: string, avoidedTerms: string[]): boolean {
  const normalized = exerciseName.toLowerCase();
  return avoidedTerms.some((term) => term.length >= 3 && normalized.includes(term));
}

function pickBestCandidateForSlot(
  slot: TemplateSlot,
  candidates: TemplateCandidate[],
  usedKeys: Set<string>,
  split: TemplateSplit,
): TemplateCandidate | null {
  let best: TemplateCandidate | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (usedKeys.has(candidate.key)) continue;
    const slotHits = countKeywordHits(candidate.name, slot.keywords);
    if (slotHits <= 0) continue;
    const splitScore = scoreExerciseNameForSplit(candidate.name, split);
    const score = slotHits * 100 + splitScore * 10 - candidate.sourceRank * 8 - candidate.order * 0.001;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function pickBestGeneralCandidate(
  candidates: TemplateCandidate[],
  usedKeys: Set<string>,
  split: TemplateSplit,
  requireSplitMatch: boolean,
): TemplateCandidate | null {
  let best: TemplateCandidate | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (usedKeys.has(candidate.key)) continue;
    const splitScore = scoreExerciseNameForSplit(candidate.name, split);
    if (requireSplitMatch && split !== 'full' && splitScore <= 0) continue;

    const score = splitScore * 20 - candidate.sourceRank * 8 - candidate.order * 0.001;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function normalizeTemplateToolInput(input: unknown, context: WorkoutContext, messages: ChatRequestMessage[]): NormalizedTemplateData {
  const parsed = (input ?? {}) as TemplateToolInput;
  const providedName = normalizeText(parsed.name);
  const providedExercises = Array.isArray(parsed.exercises)
    ? parsed.exercises.map((exercise) => normalizeText(exercise?.name)).filter(Boolean)
    : [];
  const split = inferTemplateSplit(providedName, messages, providedExercises);
  const recentBySplit = getRecentExercisesBySplit(context.recentWorkouts, split);
  const novelRequest = wantsNovelExercise(messages);

  const fallback = TEMPLATE_SLOT_PLANS[split].map((slot) => slot.fallback);
  const globalFallback = [
    ...TEMPLATE_SLOT_PLANS.full.map((slot) => slot.fallback),
    ...TEMPLATE_SLOT_PLANS.upper.map((slot) => slot.fallback),
    ...TEMPLATE_SLOT_PLANS.lower.map((slot) => slot.fallback),
  ];

  const avoidedTerms = (context.trainerProfile?.dislikedOrAvoidedExercises || [])
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean);

  const sourceRanks: Record<TemplateCandidateSource, number> = novelRequest
    ? { provided: 0, fallback: 1, recent: 2, global: 3 }
    : { provided: 0, recent: 1, fallback: 2, global: 3 };

  const candidatesMap = new Map<string, TemplateCandidate>();
  let order = 0;

  function addCandidates(names: string[], source: TemplateCandidateSource) {
    for (const rawName of names) {
      const name = normalizeText(rawName);
      if (!name) continue;
      if (isAvoidedExercise(name, avoidedTerms)) continue;

      const key = name.toLowerCase();
      const existing = candidatesMap.get(key);
      const candidate: TemplateCandidate = {
        name,
        key,
        source,
        sourceRank: sourceRanks[source],
        order,
      };
      order += 1;

      if (!existing || candidate.sourceRank < existing.sourceRank) {
        candidatesMap.set(key, candidate);
      }
    }
  }

  addCandidates(providedExercises, 'provided');
  addCandidates(recentBySplit, 'recent');
  addCandidates(fallback, 'fallback');
  addCandidates(globalFallback, 'global');

  const candidates = Array.from(candidatesMap.values());
  const selectedNames: string[] = [];
  const usedKeys = new Set<string>();

  for (const slot of TEMPLATE_SLOT_PLANS[split]) {
    const slotCandidate = pickBestCandidateForSlot(slot, candidates, usedKeys, split);
    const fallbackName = normalizeText(slot.fallback);
    const fallbackKey = fallbackName.toLowerCase();

    if (slotCandidate) {
      selectedNames.push(slotCandidate.name);
      usedKeys.add(slotCandidate.key);
      continue;
    }

    if (
      fallbackName &&
      !usedKeys.has(fallbackKey) &&
      !isAvoidedExercise(fallbackName, avoidedTerms)
    ) {
      selectedNames.push(fallbackName);
      usedKeys.add(fallbackKey);
      continue;
    }

    const backupCandidate = pickBestGeneralCandidate(candidates, usedKeys, split, true);
    if (backupCandidate) {
      selectedNames.push(backupCandidate.name);
      usedKeys.add(backupCandidate.key);
    }
  }

  while (selectedNames.length < 5) {
    const fillCandidate = pickBestGeneralCandidate(candidates, usedKeys, split, false);
    if (!fillCandidate) break;
    selectedNames.push(fillCandidate.name);
    usedKeys.add(fillCandidate.key);
  }

  if (novelRequest) {
    const recentSet = new Set(getTopRecentExercises(context.recentWorkouts).map((name) => name.toLowerCase()));
    const hasNovelSelection = selectedNames.some((name) => !recentSet.has(name.toLowerCase()));

    if (!hasNovelSelection) {
      const novelCandidate = candidates.find((candidate) => !recentSet.has(candidate.key) && !usedKeys.has(candidate.key));
      if (novelCandidate && selectedNames.length > 0) {
        const replaced = selectedNames[selectedNames.length - 1];
        usedKeys.delete(replaced.toLowerCase());
        selectedNames[selectedNames.length - 1] = novelCandidate.name;
        usedKeys.add(novelCandidate.key);
      }
    }
  }

  let genericIndex = 1;
  while (selectedNames.length < 5) {
    const genericName = `Exercise ${genericIndex}`;
    const key = genericName.toLowerCase();
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      selectedNames.push(genericName);
    }
    genericIndex += 1;
  }

  const fallbackName = split === 'upper'
    ? 'Upper Body'
    : split === 'lower'
      ? 'Lower Body'
      : 'Full Body';

  return {
    name: providedName || `${fallbackName} Template`,
    exercises: selectedNames.map((name) => ({ name, defaultSets: 3 })),
  };
}

function buildProfileContextString(profile: TrainerProfileData): string {
  const lines: string[] = [];
  lines.push(`- Experience: ${profile.experienceLevel}`);
  if (profile.trainingFrequency) lines.push(`- Frequency: ${profile.trainingFrequency}${profile.sessionDuration ? `, ${profile.sessionDuration} sessions` : ''}`);
  if (profile.goals.length > 0) lines.push(`- Goals: ${profile.goals.join(', ')}`);
  if (profile.gymAccess) lines.push(`- Gym: ${profile.gymAccess}${profile.availableEquipment && profile.availableEquipment.length > 0 ? ` (${profile.availableEquipment.join(', ')})` : ''}`);
  if (profile.favoriteExercises && profile.favoriteExercises.length > 0) lines.push(`- Favorite exercises: ${profile.favoriteExercises.join(', ')}`);
  if (profile.dislikedOrAvoidedExercises && profile.dislikedOrAvoidedExercises.length > 0) lines.push(`- Avoids: ${profile.dislikedOrAvoidedExercises.join(', ')}`);
  if (profile.additionalNotes) lines.push(`- Notes: ${profile.additionalNotes}`);
  return `User's training profile:\n${lines.join('\n')}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, context, mode, workoutExercises } = (await request.json()) as {
    messages: ChatRequestMessage[];
    context: WorkoutContext;
    mode?: 'profile-setup' | 'workout' | 'chat';
    workoutExercises?: string[];
  };

  // Profile setup mode — use profile-gathering system prompt + profile tool
  if (mode === 'profile-setup') {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: PROFILE_SETUP_SYSTEM_PROMPT,
      tools: [PROFILE_TOOL],
      messages: messages.map((m): MessageParam => ({ role: m.role, content: m.content })),
    });

    const toolUse = response.content.find((block): block is ToolUseBlock => block.type === 'tool_use');
    const textBlock = response.content.find((block): block is TextBlock => block.type === 'text');

    if (toolUse && toolUse.name === 'save_trainer_profile') {
      return new Response(
        JSON.stringify({
          type: 'profile',
          text: textBlock?.text || 'Profile saved! I\'ll use this to personalize all my advice going forward.',
          profileData: toolUse.input,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // No tool call yet — just a regular text response (still gathering info)
    const text = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return new Response(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Build context string from workout data
  const contextParts: string[] = [];
  contextParts.push(`User's preferred unit system: ${context.unitSystem}`);

  // Inject trainer profile if available
  if (context.trainerProfile) {
    contextParts.push(buildProfileContextString(context.trainerProfile));
  }

  if (context.weeklyStats) {
    const s = context.weeklyStats;
    contextParts.push(
      `This week: ${s.workouts} workouts, ${s.volume.toLocaleString()} ${context.unitSystem === 'imperial' ? 'lbs' : 'kg'} total volume, ${s.streak}-day streak`
    );
  }

  if (context.personalRecords.length > 0) {
    const unit = context.unitSystem === 'imperial' ? 'lbs' : 'kg';
    const prLines = context.personalRecords
      .slice(0, 8)
      .map((pr) => `  ${pr.exerciseName}: ${pr.maxWeight}${unit} x ${pr.maxReps}, est 1RM ${pr.estimated1RM}${unit}`)
      .join('\n');
    contextParts.push(`Personal records:\n${prLines}`);
  }

  if (context.recentWorkouts.length > 0) {
    const workoutLines = context.recentWorkouts
      .slice(0, 5)
      .map(
        (w) =>
          `  ${w.date} — ${w.name || 'Workout'}: ${w.exercises.join(', ')} (${w.totalSets} sets, ${w.totalVolume.toLocaleString()} ${context.unitSystem === 'imperial' ? 'lbs' : 'kg'})`
      )
      .join('\n');
    contextParts.push(`Recent workouts:\n${workoutLines}`);

    const topRecentExercises = getTopRecentExercises(context.recentWorkouts).slice(0, 10);
    if (topRecentExercises.length > 0) {
      contextParts.push(`Most used recent exercises: ${topRecentExercises.join(', ')}`);
    }
  }

  // Add current exercise context if available
  if (context.currentExercise) {
    const ex = context.currentExercise;
    const unit = context.unitSystem === 'imperial' ? 'lbs' : 'kg';
    let exerciseContext = `CURRENT EXERCISE: The user is currently doing ${ex.name} and asking for help with it.`;

    if (ex.history.length > 0) {
      const historyLines = ex.history.map((h) => {
        const setsStr = h.sets.map((s) => `${s.weight}${unit} x ${s.reps}`).join(', ');
        return `  ${h.date}: ${setsStr}`;
      }).join('\n');
      exerciseContext += `\n\nUser's history with ${ex.name}:\n${historyLines}`;
    } else {
      exerciseContext += `\n\nThis is the user's first time doing ${ex.name}.`;
    }

    if (ex.similarExercises.length > 0) {
      exerciseContext += `\n\nSimilar exercises (same muscle group): ${ex.similarExercises.join(', ')}`;
    }

    contextParts.push(exerciseContext);
  }

  if (!context.trainerProfile && contextParts.length === 1) {
    contextParts.push('No workout data yet — this user is just getting started.');
  }

  // Add workout mode context
  if (mode === 'workout' && workoutExercises) {
    if (workoutExercises.length > 0) {
      contextParts.push(`Current workout exercises: ${workoutExercises.join(', ')}`);
    } else {
      contextParts.push('The user just started a workout and has no exercises added yet.');
    }
  }

  const workoutModeSection = mode === 'workout' ? WORKOUT_MODE_PROMPT_SECTION : '';
  const systemWithContext = `${SYSTEM_PROMPT}${workoutModeSection}\n\nUser's workout data:\n${contextParts.join('\n\n')}`;

  // Check if the latest message might be import-related or template-related
  const lastMessage = messages[messages.length - 1]?.content || '';
  const lastMessageLower = lastMessage.toLowerCase();
  const previousMessagesText = messages.slice(0, -1).map((m) => m.content.toLowerCase()).join(' ');

  const explicitlyAskedForTemplate =
    /template|program|split|routine|workout plan|workout template/.test(lastMessageLower) ||
    /create.*workout|build.*workout|make.*workout|design.*workout/.test(lastMessageLower) ||
    /create.*routine|build.*routine|make.*routine/.test(lastMessageLower) ||
    /push.*pull.*leg|upper.*lower|ppl/.test(lastMessageLower);

  const pickedTemplateType = /\b(upper body|upper|lower body|lower|full body|full)\b/.test(lastMessageLower);
  const templateModificationRequest = /\b(swap|replace|substitute|change|modify|adjust|tweak|different|another|try new|new exercise|instead|remove|add)\b/.test(lastMessageLower);
  const templateConfirmation = /\b(looks good|save it|approve|go ahead|that works|keep this|done)\b/.test(lastMessageLower);
  const templateConversationInProgress = /template|save template|swap exercise|try new move|adjust focus|upper body|lower body|full body/.test(previousMessagesText);

  if (explicitlyAskedForTemplate && !pickedTemplateType && !templateConversationInProgress) {
    return new Response(
      'Perfect, let\'s build it fast. Which template do you want?\nsuggestions:Upper body|Lower body|Full body',
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const mightBeImport =
    lastMessage.length > 100 || // Long messages might be pasted data
    /import|paste|upload|csv|json|log|data/.test(lastMessageLower) ||
    /\d+\s*x\s*\d+|\d+\s*lbs?|\d+\s*kg/.test(lastMessageLower) || // Patterns like "135x10" or "135 lbs"
    messages.some((m) => m.content.toLowerCase().includes('[file:'));

  const mightBeTemplate =
    explicitlyAskedForTemplate ||
    pickedTemplateType ||
    (templateConversationInProgress && (templateModificationRequest || templateConfirmation));

  const isWorkoutMode = mode === 'workout';

  // Use tool mode for potential imports, templates, or workout commands
  if (mightBeImport || mightBeTemplate || isWorkoutMode) {
    // Build the tools array based on what's relevant
    const tools: Tool[] = [];
    if (mightBeImport) tools.push(IMPORT_TOOL);
    if (mightBeTemplate) tools.push(TEMPLATE_TOOL);
    if (isWorkoutMode) tools.push(ADD_EXERCISE_TOOL);

    // Non-streaming with tool use
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemWithContext,
      tools,
      messages: messages.map((m): MessageParam => ({ role: m.role, content: m.content })),
    });

    // Check if tool was used
    const toolUse = response.content.find((block): block is ToolUseBlock => block.type === 'tool_use');
    const textBlock = response.content.find((block): block is TextBlock => block.type === 'text');

    if (toolUse && toolUse.name === 'import_workouts') {
      // Return structured response with import tool data
      return new Response(
        JSON.stringify({
          type: 'import',
          text: textBlock?.text || '',
          importData: toolUse.input,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (toolUse && toolUse.name === 'create_template') {
      const normalizedTemplate = normalizeTemplateToolInput(toolUse.input, context, messages);
      // Return structured response with template tool data
      return new Response(
        JSON.stringify({
          type: 'template',
          text: textBlock?.text || 'Here\'s the template I\'ve put together for you!',
          templateData: normalizedTemplate,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (toolUse && toolUse.name === 'add_exercise') {
      // Workout mode: fuzzy match exercise name against DB
      const input = toolUse.input as { exerciseName: string };
      const exerciseName = input.exerciseName || '';

      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          throw new Error('Supabase not configured');
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const matches = await matchExercises(supabase, [exerciseName]);
        const match = matches[0];

        if (match?.matchedExercise) {
          return new Response(
            JSON.stringify({
              type: 'add_exercise',
              text: textBlock?.text || `Added ${match.matchedExercise.name}!\nsuggestions:Add another|What's next?|That's enough`,
              exerciseData: match.matchedExercise,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({
              type: 'add_exercise',
              text: `I couldn't find "${exerciseName}" in the exercise library. Try a different name?\nsuggestions:Show alternatives|Try different name`,
              exerciseData: null,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        return new Response(
          JSON.stringify({
            type: 'add_exercise',
            text: `Had trouble looking up "${exerciseName}". Try again?\nsuggestions:Try again|Add different exercise`,
            exerciseData: null,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Regular text response (no tool use)
    const text = response.content
      .filter((block): block is TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return new Response(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Regular streaming response for non-import messages
  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemWithContext,
    messages: messages.map((m): MessageParam => ({ role: m.role, content: m.content })),
  });

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
