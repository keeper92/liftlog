import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a knowledgeable, motivating personal trainer inside the "reps" fitness app. Your name is Trainer.

Guidelines:
- Keep responses concise (2-4 sentences unless the user asks for detail)
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
1. Use the create_template tool with a descriptive name and list of exercises
2. Choose exercises that match the user's equipment and experience level (from their profile if available)
3. Use standard, full exercise names (e.g., "Barbell Bench Press" not "bench", "Barbell Squat" not "squats")
4. Include 4-8 exercises per template with 3-5 sets each
5. Consider the user's goals and preferences when selecting exercises
6. If the user asks for a multi-day program (e.g., Push/Pull/Legs), create ONE template at a time and ask if they want the next one`;

const PROFILE_SETUP_SYSTEM_PROMPT = `You are a knowledgeable, motivating personal trainer inside the "reps" fitness app. Your name is Trainer.

You are getting to know a new user so you can personalize their training experience. Have a natural, friendly conversation to learn about them. Ask about these topics across 3-5 messages (don't ask everything at once — keep it conversational):

1. Experience level — How long have they been lifting? Beginner, intermediate, or advanced?
2. Training frequency — How many days per week do they train? How long are their sessions?
3. Goals — What are they working toward? (muscle building, strength, fat loss, general fitness, sport performance, etc.)
4. Gym & equipment — Where do they train? What equipment do they have access to?
5. Favorites & preferences — Any favorite exercises? Any they avoid or can't do (injuries, etc.)?
6. Anything else they want you to know (upcoming events, injuries, schedule constraints)

Guidelines:
- Be warm, encouraging, and conversational — not like a form
- Ask 2-3 related things per message, don't overwhelm
- React to their answers naturally before asking the next question
- Use plain text, no markdown formatting
- When you have enough info (at least experience level, goals, and a couple other topics), call the save_trainer_profile tool
- Include a friendly confirmation message alongside the tool call`;

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

  const { messages, context, mode } = (await request.json()) as {
    messages: ChatRequestMessage[];
    context: WorkoutContext;
    mode?: 'profile-setup' | 'chat';
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

  const systemWithContext = `${SYSTEM_PROMPT}\n\nUser's workout data:\n${contextParts.join('\n\n')}`;

  // Check if the latest message might be import-related or template-related
  const lastMessage = messages[messages.length - 1]?.content || '';
  const allMessagesText = messages.map(m => m.content.toLowerCase()).join(' ');
  const mightBeImport =
    lastMessage.length > 100 || // Long messages might be pasted data
    /import|paste|upload|csv|json|log|data/i.test(lastMessage) ||
    /\d+\s*x\s*\d+|\d+\s*lbs?|\d+\s*kg/i.test(lastMessage) || // Patterns like "135x10" or "135 lbs"
    messages.some(m => m.content.toLowerCase().includes('[file:'));

  const mightBeTemplate =
    /template|program|split|routine|workout plan/i.test(lastMessage) ||
    /create.*workout|build.*workout|make.*workout|design.*workout/i.test(lastMessage) ||
    /create.*routine|build.*routine|make.*routine/i.test(lastMessage) ||
    /push.*pull.*leg|upper.*lower|ppl|full body/i.test(lastMessage) ||
    // Check conversation context — user might be confirming a template suggestion
    (allMessagesText.includes('template') && /yes|sure|go ahead|do it|sounds good|let.s do/i.test(lastMessage));

  // Use tool mode for potential imports or templates, streaming for regular chat
  if (mightBeImport || mightBeTemplate) {
    // Build the tools array based on what's relevant
    const tools: Tool[] = [];
    if (mightBeImport) tools.push(IMPORT_TOOL);
    if (mightBeTemplate) tools.push(TEMPLATE_TOOL);
    // If both could apply, include both and let the model decide
    if (mightBeImport && !mightBeTemplate) tools.push(TEMPLATE_TOOL);
    if (mightBeTemplate && !mightBeImport) tools.push(IMPORT_TOOL);

    // Non-streaming with tool use
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemWithContext,
      tools: [IMPORT_TOOL, TEMPLATE_TOOL],
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
      // Return structured response with template tool data
      return new Response(
        JSON.stringify({
          type: 'template',
          text: textBlock?.text || 'Here\'s the template I\'ve put together for you!',
          templateData: toolUse.input,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
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
