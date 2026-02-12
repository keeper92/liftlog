import Anthropic from '@anthropic-ai/sdk';
import type { Tool, MessageParam, ContentBlock, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';

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
Ready to import? Just say 'yes' or let me know if anything needs fixing."`;

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
}

interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, context } = (await request.json()) as {
    messages: ChatRequestMessage[];
    context: WorkoutContext;
  };

  // Build context string from workout data
  const contextParts: string[] = [];
  contextParts.push(`User's preferred unit system: ${context.unitSystem}`);

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

  if (contextParts.length === 1) {
    contextParts.push('No workout data yet — this user is just getting started.');
  }

  const systemWithContext = `${SYSTEM_PROMPT}\n\nUser's workout data:\n${contextParts.join('\n\n')}`;

  // Check if the latest message might be import-related
  const lastMessage = messages[messages.length - 1]?.content || '';
  const mightBeImport =
    lastMessage.length > 100 || // Long messages might be pasted data
    /import|paste|upload|csv|json|log|data/i.test(lastMessage) ||
    /\d+\s*x\s*\d+|\d+\s*lbs?|\d+\s*kg/i.test(lastMessage) || // Patterns like "135x10" or "135 lbs"
    messages.some(m => m.content.toLowerCase().includes('[file:'));

  // Use tool mode for potential imports, streaming for regular chat
  if (mightBeImport) {
    // Non-streaming with tool use
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemWithContext,
      tools: [IMPORT_TOOL],
      messages: messages.map((m): MessageParam => ({ role: m.role, content: m.content })),
    });

    // Check if tool was used
    const toolUse = response.content.find((block): block is ToolUseBlock => block.type === 'tool_use');
    const textBlock = response.content.find((block): block is TextBlock => block.type === 'text');

    if (toolUse && toolUse.name === 'import_workouts') {
      // Return structured response with tool use data
      return new Response(
        JSON.stringify({
          type: 'import',
          text: textBlock?.text || '',
          importData: toolUse.input,
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
