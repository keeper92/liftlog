import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a knowledgeable, motivating personal trainer inside the "rep" fitness app. Your name is Coach.

Guidelines:
- Keep responses concise (2-4 sentences unless the user asks for detail)
- Use the user's workout data to give specific, personalized advice
- Be encouraging but honest — reference specific exercises, weights, and trends
- Use plain text, no markdown formatting. Keep it conversational.
- When suggesting exercises, consider what equipment the user has used before
- If the user has no workout data yet, give general beginner-friendly advice`;

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

  if (contextParts.length === 1) {
    contextParts.push('No workout data yet — this user is just getting started.');
  }

  const systemWithContext = `${SYSTEM_PROMPT}\n\nUser's workout data:\n${contextParts.join('\n\n')}`;

  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemWithContext,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
