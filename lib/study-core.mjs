export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(day, count) {
  const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + count); return localDate(date);
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && localDate(new Date(`${value}T12:00:00`)) === value;
}
export function cleanTask(task) {
  if (!task || typeof task !== 'object' || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 120 || !validDate(task.date)) throw new Error('任务名称或日期无效');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(task.time)) throw new Error('任务时间无效');
  if (!Number.isInteger(task.minutes) || task.minutes < 5 || task.minutes > 240) throw new Error('任务时长应在 5 到 240 分钟之间');
  return { id: typeof task.id === 'string' && task.id.length < 100 ? task.id : crypto.randomUUID(), title: task.title.trim(), subject: String(task.subject || '综合').slice(0, 30), date: task.date, time: task.time, minutes: task.minutes, priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal', done: task.done === true, notes: String(task.notes || '').slice(0, 500) };
}
export function createPlan({ goal, subject, start, days = 5, minutes = 45, time = '19:00' }) {
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 120 || !validDate(start) || !Number.isInteger(days) || days < 1 || days > 14) throw new Error('请填写目标、开始日期和 1 到 14 天的计划');
  const phases = ['建立知识框架', '理解核心概念', '动手练习', '查漏补缺', '自测与复盘'];
  return Array.from({ length: days }, (_, index) => cleanTask({ title: `${goal.trim()} · ${phases[Math.min(4, Math.floor(index * 5 / days))]}`, subject, date: addDays(start, index), time, minutes, priority: 'normal', notes: `第 ${index + 1}/${days} 天：先回顾，再练习，最后用自己的话总结。` }));
}
export function parseBackup(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.tasks) || !Array.isArray(raw.sessions) || raw.tasks.length > 2000 || raw.sessions.length > 10000) throw new Error('不是有效的学伴备份文件');
  const tasks = raw.tasks.map(cleanTask);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('备份中存在重复任务编号');
  const sessions = raw.sessions.map(session => {
    if (!session || !validDate(session.date) || !Number.isFinite(session.minutes) || session.minutes <= 0 || session.minutes > 240) throw new Error('专注记录格式无效');
    return { id: String(session.id || crypto.randomUUID()).slice(0, 100), date: session.date, minutes: Math.round(session.minutes), taskTitle: String(session.taskTitle || '自由专注').slice(0, 120) };
  });
  return { tasks, sessions };
}
export function weekStats(sessions, today = localDate()) {
  return Array.from({ length: 7 }, (_, index) => { const date = addDays(today, index - 6); return { date, minutes: sessions.filter(session => session.date === date).reduce((sum, session) => sum + session.minutes, 0) }; });
}
export function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 12) throw new Error('对话长度无效');
  let total = 0;
  const result = messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 6000) throw new Error('对话内容无效');
    total += message.content.length; return { role: message.role, content: message.content };
  });
  if (total > 18000 || result.at(-1).role !== 'user') throw new Error('对话过长，请新建对话');
  return result;
}
