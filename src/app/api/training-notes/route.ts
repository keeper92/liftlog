import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a personal trainer analyzing a user's just-completed workout. Generate brief, encouraging training notes.

Format your response as 2-3 short bullet points (use • for bullets). Include:
1. ONE accomplishment or achievement (weight/rep PRs, first time doing an exercise, consistency)
2. ONE observation or suggestion (form focus, plateau breaking, exercise variety)
3. Optionally ONE brief encouragement or next-step recommendation

Guidelines:
- Keep each bullet to 1-2 sentences max
- Be specific - reference actual exercises and numbers from the data
- Use plain text, no markdown beyond bullet points
- Be encouraging but honest
- If they improved on an exercise, celebrate it
- If they plateaued or went down, suggest alternatives or recovery
- Keep the total response under 100 words`;

interface TrainingNotesRequest {
  workoutName: string;
  exerciseCount: number;
  totalSets: number;
  comparisons: string;
  unitSystem: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { workoutName, exerciseCount, totalSets, comparisons, unitSystem } =
    (await request.json()) as TrainingNotesRequest;

  const unit = unitSystem === 'imperial' ? 'lbs' : 'kg';

  const userMessage = `Workout completed: "${workoutName}"
${exerciseCount} exercises, ${totalSets} working sets
Unit system: ${unit}

Exercise performance (today vs previous best):
${comparisons}

Generate brief training notes with accomplishments and suggestions.`;

  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
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
