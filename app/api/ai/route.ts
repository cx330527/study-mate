import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { answerQuestion } from '../../../lib/ai-service.mjs';
import { ownerAccess } from '../../../lib/ai-access.mjs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET() {
  const user = await getChatGPTUser();
  const config = env as unknown as Record<string, string>;
  const access = ownerAccess(user, config.STUDY_OWNER_EMAIL);
  return Response.json({ configured: access.allowed && Boolean(config.DEEPSEEK_API_KEY), canAsk: access.allowed, requiresLogin: !user, notice: access.error, provider: 'DeepSeek' }, { headers });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  const config = env as unknown as Record<string, string>;
  const access = ownerAccess(user, config.STUDY_OWNER_EMAIL);
  if (!access.allowed) return Response.json({ error: access.error }, { status: access.status, headers });
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '请求来源无效。' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: '请求格式无效。' }, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: '请求为空。' }, { status: 400, headers });
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 80000) { await reader.cancel(); return Response.json({ error: '请求内容过大。' }, { status: 413, headers }); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { return Response.json({ error: '请求内容无效。' }, { status: 400, headers }); }
  const result = await answerQuestion({ userId: user!.userId, payload, key: config.DEEPSEEK_API_KEY, model: config.DEEPSEEK_MODEL || 'deepseek-flash' });
  return Response.json(result.body, { status: result.status, headers });
}
