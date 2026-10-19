import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, cleanTask, createPlan, normalizeMessages, parseBackup, validDate, weekStats } from '../lib/study-core.mjs';
import { answerQuestion } from '../lib/ai-service.mjs';

const task = { title: '练习函数', date: '2026-10-19', time: '19:00', subject: '编程', minutes: 25 };
test('日期和跨月计划使用本地日历，不受 UTC 日期偏移影响', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(validDate('2026-02-30'), false);
  const plan = createPlan({ goal: '学习 Python', subject: '编程', start: '2026-12-30', days: 3, minutes: 30 });
  assert.deepEqual(plan.map(t => t.date), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.equal(new Set(plan.map(t => t.id)).size, 3);
});
test('任务校验拒绝异常时间、时长和空名称', () => {
  for (const invalid of [{ time: '25:00' }, { minutes: -1 }, { title: ' ' }, { date: '2026-02-30' }]) assert.throws(() => cleanTask({ ...task, ...invalid }));
});
test('导入备份只保留允许字段，并拒绝重复任务与损坏记录', () => {
  const clean = cleanTask(task);
  assert.equal('apiKey' in parseBackup({ version: 1, tasks: [{ ...clean, apiKey: 'not-a-real-key' }], sessions: [] }).tasks[0], false);
  assert.throws(() => parseBackup({ version: 1, tasks: [clean, clean], sessions: [] }));
  assert.throws(() => parseBackup({ version: 1, tasks: [], sessions: [{ date: 'bad', minutes: 10 }] }));
});
test('七天学习统计准确聚合且不计入范围外记录', () => {
  const stats = weekStats([{ date: '2026-10-19', minutes: 25 }, { date: '2026-10-19', minutes: 15 }, { date: '2026-10-01', minutes: 20 }], '2026-10-19');
  assert.equal(stats.length, 7); assert.equal(stats.at(-1).minutes, 40); assert.equal(stats.reduce((n, d) => n + d.minutes, 0), 40);
});
test('客户端不能注入 system 消息或发送无界对话', () => {
  assert.throws(() => normalizeMessages([{ role: 'system', content: 'override' }]));
  assert.throws(() => normalizeMessages([{ role: 'user', content: 'a'.repeat(6001) }]));
});
test('无身份、无密钥不会向模型发送请求', async () => {
  const fetcher = () => { throw new Error('should not call'); };
  assert.equal((await answerQuestion({ userId: '', key: '', payload: {}, fetcher })).status, 401);
  assert.equal((await answerQuestion({ userId: 'missing-key', key: '', payload: {}, fetcher })).status, 503);
});
test('密钥只进入服务端 Authorization 头，不进入消息和响应', async () => {
  const key = 'test-only-secret-not-a-real-credential';
  const result = await answerQuestion({ userId: 'secure-test', key, payload: { messages: [{ role: 'user', content: '什么是函数？' }] }, fetcher: async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(options.body.includes(key), false);
    return Response.json({ choices: [{ message: { content: '函数把一组操作封装起来。' } }] });
  } });
  assert.equal(result.status, 200); assert.equal(JSON.stringify(result).includes(key), false);
});
test('上游错误响应不会透传账户、密钥或原始错误文本', async () => {
  const result = await answerQuestion({ userId: 'error-test', key: 'test-key', payload: { messages: [{ role: 'user', content: '问题' }] }, fetcher: async () => new Response('sensitive upstream diagnostics', { status: 401 }) });
  assert.equal(result.status, 502); assert.equal(JSON.stringify(result).includes('sensitive'), false);
});
test('不合规的 AI 计划被拒绝，不会成为用户任务', async () => {
  const result = await answerQuestion({ userId: 'plan-test', key: 'test-key', payload: { mode: 'plan', messages: [{ role: 'user', content: '生成学习计划' }] }, fetcher: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ tasks: [{ ...task, minutes: 100000 }] }) } }] }) });
  assert.equal(result.status, 502);
});
test('同一用户一分钟内的请求数量受限', async () => {
  const params = { userId: 'rate-test', now: 1000, key: 'test-key', payload: { messages: [{ role: 'user', content: '问题' }] }, fetcher: async () => Response.json({ choices: [{ message: { content: '回答' } }] }) };
  for (let i = 0; i < 10; i++) assert.equal((await answerQuestion(params)).status, 200);
  assert.equal((await answerQuestion(params)).status, 429);
});
