import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const { name, category } = await req.json();

    if (!name || typeof name !== 'string') {
      return Response.json({ error: 'Exercise name is required.' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a fitness exercise database. Given the exercise "${name}"${category ? ` (category: ${category})` : ''}, return a JSON object with these fields:

- "instructions": array of 4-6 short step-by-step form instructions (strings)
- "secondaryMuscles": array of secondary muscle groups worked (use lowercase with underscores, e.g. "middle_back", "biceps", "triceps", "shoulders", "forearms", "hamstrings", "glutes", "calves", "abdominals", "quadriceps", "chest", "lats", "traps", "lower_back", "neck", "adductors", "abductors")
- "force": "push" or "pull" or "static" or null
- "level": "beginner" or "intermediate" or "advanced"
- "mechanic": "compound" or "isolation" or null
- "equipment": specific equipment needed (e.g. "barbell", "dumbbell", "cable", "machine", "body only", "kettlebell", "bands", "exercise ball", "foam roll", "medicine ball", "e-z curl bar") or null
- "primaryMuscle": the single primary muscle group (same format as secondaryMuscles)
- "category": one of "barbell", "dumbbell", "machine", "cable", "bodyweight", "cardio", "stretching", "plyometrics", "strongman", "olympic_weightlifting", "other"

Return ONLY valid JSON, no markdown or explanation.`,
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();
    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const details = JSON.parse(jsonStr);

    return Response.json(details);
  } catch (error) {
    console.error('Exercise details API error:', error);
    return Response.json({ error: 'Failed to generate exercise details.' }, { status: 500 });
  }
}
