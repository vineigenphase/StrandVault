import 'server-only';
// OpenAI structured-output client (BACKEND.md §7). Lane BE4.
// The key is read server-side only; nothing here is imported by client code.
import { RICO_JSON_SCHEMA, RICO_SYSTEM_PROMPT } from './rico-prompt';

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Returns the parsed JSON object, or throws. Always bounded by a 5s timeout. */
export async function askRico(userPrompt: string): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.9,
      messages: [
        { role: 'system', content: RICO_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'rico_pick', strict: true, schema: RICO_JSON_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const body = await res.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return JSON.parse(content);
}
