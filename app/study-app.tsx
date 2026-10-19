'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { BookOpen, LayoutDashboard, ListTodo, CalendarDays, Timer, Sparkles, Settings, Plus, ArrowUpRight, ArrowRight, Play, Pause, RotateCcw, Check, Trash2, Pencil, X, Send, ChevronLeft, ChevronRight, Download, Upload, ShieldCheck, Bell, Flame, CircleHelp, Target, Coffee, LoaderCircle } from 'lucide-react';
import { addDays, cleanTask, createPlan, localDate, parseBackup, weekStats } from '../lib/study-core.mjs';

type Task = { id: string; title: string; subject: string; date: string; time: string; minutes: number; priority: string; done: boolean; notes: string };
type Session = { id: string; date: string; minutes: number; taskTitle: string };
type Message = { role: 'user' | 'assistant'; content: string };
type ApiReply = { configured?: boolean; error?: string; answer?: string; tasks?: Task[] };
type Clock = { minutes: number; remaining: number; deadline: number | null; taskId: string; kind: 'focus' | 'break'; runId: string };
type Tab = 'home' | 'tasks' | 'plan' | 'focus' | 'ai' | 'settings';
const STORAGE = 'studymate.v1';
const blankClock = (minutes = 25): Clock => ({ minutes, remaining: minutes * 60, deadline: null, taskId: '', kind: 'focus', runId: '' });
const navigation = [{ id: 'home', label: '学习概览', icon: LayoutDashboard }, { id: 'tasks', label: '我的任务', icon: ListTodo }, { id: 'plan', label: '学习日历', icon: CalendarDays }, { id: 'focus', label: '专注空间', icon: Timer }, { id: 'ai', label: '学伴问答', icon: Sparkles }] as const;
const titles: Record<Tab, string> = { home: '学习概览', tasks: '我的任务', plan: '学习日历', focus: '专注空间', ai: '学伴问答', settings: '偏好与数据' };
const weekDay = (day: string) => new Date(day + 'T12:00:00').toLocaleDateString('zh-CN', { weekday: 'short' });
const shortDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={onClose} className="modal"><div className="modal-top"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div>{children}</dialog>;
}

export default function StudyApp() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [goal, setGoal] = useState(90);
  const [clock, setClock] = useState<Clock>(blankClock());
  const [now, setNow] = useState(Date.now());
  const [modal, setModal] = useState<'task' | 'plan' | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<boolean | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [sharePlan, setSharePlan] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  const [preview, setPreview] = useState<Task[] | null>(null);
  const [planForm, setPlanForm] = useState({ goal: '', subject: '综合', start: localDate(), days: 5, minutes: 45, time: '19:00' });
  const finishGuard = useRef('');
  const notifiedTasks = useRef(new Set<string>());
  const importRef = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const today = localDate(new Date(now));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const data = JSON.parse(saved); const parsed = parseBackup(data);
        setTasks(parsed.tasks); setSessions(parsed.sessions);
        if (Number.isInteger(data.goal) && data.goal >= 15 && data.goal <= 600) setGoal(data.goal);
        const c = data.clock;
        if (c && Number.isInteger(c.minutes) && c.minutes >= 1 && c.minutes <= 120 && Number.isFinite(c.remaining) && c.remaining >= 0 && c.remaining <= c.minutes * 60 && (c.deadline === null || Number.isFinite(c.deadline)) && ['focus', 'break'].includes(c.kind)) setClock({ ...c, taskId: String(c.taskId || ''), runId: String(c.runId || '') });
      }
    } catch { setToast('本地数据无法读取，请在设置中导入备份恢复。'); }
    setReady(true);
    fetch('/api/ai').then(r => { setNeedsLogin(r.status === 401); return r.json(); }).then(data => setAiStatus((data as ApiReply).configured === true)).catch(() => setAiStatus(false));
    const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ version: 1, tasks, sessions, goal, clock })); }
    catch { setToast('浏览器存储不可用，请及时导出数据。'); }
  }, [ready, tasks, sessions, goal, clock]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  useEffect(() => {
    if (!ready || !clock.deadline || now < clock.deadline || finishGuard.current === clock.runId) return;
    finishGuard.current = clock.runId;
    if (clock.kind === 'focus') {
      const title = tasks.find(task => task.id === clock.taskId)?.title || '自由专注';
      const date = localDate(new Date(clock.deadline));
      setSessions(previous => previous.some(session => session.id === clock.runId) ? previous : [...previous, { id: clock.runId, date, minutes: clock.minutes, taskTitle: title }]);
      setToast(`完成 ${clock.minutes} 分钟专注，休息一下吧！`);
    } else setToast('休息结束，准备开始下一轮学习。');
    if ('Notification' in window && Notification.permission === 'granted') new Notification('学伴提醒', { body: clock.kind === 'focus' ? '本轮专注结束，给自己一点休息时间。' : '休息结束，可以开始下一轮了。' });
    setClock(previous => ({ ...previous, remaining: 0, deadline: null }));
  }, [now, ready, clock, tasks]);

  useEffect(() => {
    if (!ready) return;
    for (const task of tasks) {
      if (task.done || task.date !== today) continue;
      const start = new Date(`${task.date}T${task.time}:00`).getTime();
      const key = `${task.id}:${task.date}:${task.time}`;
      if (now >= start && now - start < 30000 && !notifiedTasks.current.has(key)) {
        notifiedTasks.current.add(key);
        setToast(`学习时间到了：${task.title}`);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('学伴 · 学习时间到了', { body: task.title });
      }
    }
  }, [now, ready, tasks, today]);

  const todayTasks = tasks.filter(task => task.date === today).sort((a, b) => a.time.localeCompare(b.time));
  const todayMinutes = sessions.filter(session => session.date === today).reduce((sum, session) => sum + session.minutes, 0);
  const dueTasks = tasks.filter(task => !task.done && task.date <= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const stats = weekStats(sessions, today);
  const totalWeek = stats.reduce((sum, day) => sum + day.minutes, 0);
  const completed = todayTasks.filter(task => task.done).length;
  const remaining = clock.deadline ? Math.max(0, Math.ceil((clock.deadline - now) / 1000)) : clock.remaining;
  const minuteText = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const progress = Math.min(100, (1 - remaining / (clock.minutes * 60)) * 100);

  function openTask(task: Task | null = null) { setEditing(task); setModal('task'); }
  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const task = cleanTask({ ...fields, id: editing?.id || crypto.randomUUID(), done: editing?.done || false, minutes: Number(fields.minutes) }) as Task;
      setTasks(old => editing ? old.map(item => item.id === editing.id ? task : item) : [...old, task]); setModal(null); setToast(editing ? '任务已更新' : '新任务已添加');
    } catch (error) { setToast((error as Error).message); }
  }
  function toggleTask(id: string) { setTasks(old => old.map(task => task.id === id ? { ...task, done: !task.done } : task)); }
  function removeTask(id: string) { if (confirm('确定删除这个任务？')) setTasks(old => old.filter(task => task.id !== id)); }
  function focusTask(id = '') {
    if (clock.deadline) { setTab('focus'); setToast('一轮专注正在进行，结束后可更换任务。'); return; }
    setClock({ ...blankClock(), taskId: id }); setTab('focus');
  }
  function toggleTimer() {
    if (clock.deadline) setClock(old => ({ ...old, remaining: Math.max(0, Math.ceil((old.deadline! - Date.now()) / 1000)), deadline: null }));
    else setClock(old => ({ ...old, remaining: old.remaining || old.minutes * 60, deadline: Date.now() + (old.remaining || old.minutes * 60) * 1000, runId: old.remaining && old.runId ? old.runId : crypto.randomUUID() }));
  }
  function resetTimer(minutes = clock.minutes, kind: 'focus' | 'break' = clock.kind) {
    if (clock.deadline && !confirm('重新开始会丢弃本轮未完成的专注时间，继续吗？')) return;
    setClock({ ...blankClock(minutes), kind, taskId: clock.taskId });
  }
  async function ask(text = question) {
    if (!text.trim() || busy) return;
    if (text.length > 2000) { setToast('问题请控制在 2000 字以内。'); return; }
    const next = [...messages.slice(-8), { role: 'user' as const, content: text.trim() }];
    setMessages(next); setQuestion(''); setBusy(true); setTab('ai');
    try {
      const context = sharePlan ? JSON.stringify(tasks.filter(task => !task.done).slice(0, 8).map(({ title, subject, date, time, minutes }) => ({ title, subject, date, time, minutes }))).slice(0, 4000) : undefined;
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next, context }), signal: AbortSignal.timeout(70000) });
      const data = await response.json() as ApiReply; if (!response.ok || typeof data.answer !== 'string') throw new Error(data.error || '问答暂时不可用');
      const answer = data.answer;
      setMessages(old => [...old, { role: 'assistant', content: answer }]);
    } catch (error) { setToast((error as Error).name === 'TimeoutError' ? '等待回答超时，请稍后重试。' : (error as Error).message); }
    finally { setBusy(false); }
  }
  async function generatePlan(ai: boolean) {
    try {
      const local = createPlan(planForm) as Task[];
      if (!ai) { setPreview(local); return; }
      setPlanBusy(true);
      const text = `为我制定学习计划。目标：${planForm.goal}；学科：${planForm.subject}；起始日期：${planForm.start}；连续${planForm.days}天；每天${planForm.time}开始，每天只安排一项任务，每项不超过${planForm.minutes}分钟。请分解成具体可实践的学习任务。`;
      const response = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'plan', messages: [{ role: 'user', content: text }] }), signal: AbortSignal.timeout(70000) });
      const data = await response.json() as ApiReply; if (!response.ok || !Array.isArray(data.tasks)) throw new Error(data.error || '生成失败');
      const end = addDays(planForm.start, planForm.days - 1);
      const parsed = data.tasks.map(cleanTask) as Task[];
      if (parsed.length > planForm.days || parsed.some(task => task.date < planForm.start || task.date > end || task.minutes > planForm.minutes) || new Set(parsed.map(task => task.date)).size !== parsed.length) throw new Error('AI 计划超出你的时间范围，请重试或使用本地生成。');
      setPreview(parsed);
    } catch (error) { setToast((error as Error).message); } finally { setPlanBusy(false); }
  }
  function addPreview() {
    if (!preview) return;
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const collisions = preview.some(task => tasks.some(old => !old.done && old.date === task.date && toMinutes(task.time) < toMinutes(old.time) + old.minutes && toMinutes(old.time) < toMinutes(task.time) + task.minutes));
    if (collisions && !confirm('计划与已有任务的时间可能重叠。仍要添加吗？添加后可逐项修改。')) return;
    setTasks(old => [...old, ...preview]); setPreview(null); setModal(null); setTab('plan'); setToast('计划已加入学习日历');
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, tasks, sessions }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `studymate-${today}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importData(file?: File) {
    if (!file) return;
    try { if (file.size > 3000000) throw new Error('备份文件不能超过 3 MB'); const data = parseBackup(JSON.parse(await file.text())); if (confirm(`导入 ${data.tasks.length} 个任务和 ${data.sessions.length} 条专注记录，将替换现有记录。继续吗？`)) { setTasks(data.tasks); setSessions(data.sessions); setClock(blankClock()); setToast('备份导入完成'); } }
    catch (error) { setToast((error as Error).message); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }
  const taskRow = (task: Task) => <div className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}><button className={`task-check ${task.done ? 'checked' : ''}`} aria-label={task.done ? `恢复任务：${task.title}` : `完成任务：${task.title}`} onClick={() => toggleTask(task.id)}>{task.done && <Check size={14} />}</button><div className="task-info"><strong>{task.title}</strong><span><i className={'subject-dot ' + (task.priority === 'high' ? 'coral' : '')} />{task.subject} · {task.time} · {task.minutes} 分钟{task.date < today && !task.done && <em>待补上</em>}</span></div><div className="row-actions"><button className="icon-button" aria-label={`编辑：${task.title}`} onClick={() => openTask(task)}><Pencil size={15} /></button>{!task.done && <button className="icon-button" aria-label={`开始学习：${task.title}`} onClick={() => focusTask(task.id)}><Play size={16} /></button>}<button className="icon-button delete-button" aria-label={`删除：${task.title}`} onClick={() => removeTask(task.id)}><Trash2 size={15} /></button></div></div>;

  if (!ready) return <div className="loading-screen"><BookOpen size={40} /><p>学伴正在准备你的学习空间…</p></div>;
  const monday = addDays(today, -((new Date(today + 'T12:00:00').getDay() + 6) % 7) + weekOffset * 7);
  const calendarDays = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  return <div className="app-shell">
    <aside className="sidebar"><a href="#" onClick={e => { e.preventDefault(); setTab('home'); }} className="brand"><span className="brand-mark"><BookOpen size={23} /></span><span>学伴<small>STUDYMATE</small></span></a><div className="nav-label">你的学习空间</div><nav aria-label="主导航">{navigation.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={tab === item.id ? 'active' : ''}><item.icon size={19} />{item.label}{item.id === 'ai' && <span className="nav-ai">AI</span>}</button>)}</nav><div className="sidebar-note"><span className="note-spark">✧</span><p>不必一下子很厉害，<br />每天进步一点点。</p><small>SMALL STEPS, EVERY DAY.</small></div><button className={`settings-nav ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}><Settings size={18} />偏好与数据</button><div className="profile"><div className="avatar">学</div><div><strong>我的学习空间</strong><small><span className="online-dot" />个人私密空间</small></div></div></aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb">我的空间 <span>/</span> <strong>{titles[tab]}</strong></div><div className="topbar-right"><span className="date-label">{new Date(today + 'T12:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><button className="icon-button" aria-label="查看待办提醒" onClick={() => { setTab('tasks'); setFilter('pending'); setToast(dueTasks.length ? `还有 ${dueTasks.length} 项今天或之前的任务待完成。` : '没有逾期任务，按自己的节奏继续。'); }}><Bell size={19} />{dueTasks.length > 0 && <span className="notification-dot" />}</button></div></header>
    <div className="page-content">
    {tab === 'home' && <>
      <div className="page-heading"><div><div className="eyebrow">A LITTLE BETTER, EVERY DAY</div><h1>今天，也向目标靠近一点<span className="sun">☀</span></h1><p>把大目标拆成小行动，学伴陪你认真走好每一步。</p></div><button className="primary-button" onClick={() => openTask()}><Plus size={17} />添加学习任务</button></div>
      <section className="stats-grid" aria-label="学习统计"><div className="stat-card"><div className="stat-label">今日专注 <span className="stat-icon lavender"><Timer size={18} /></span></div><div className="stat-number">{todayMinutes}<small>分钟</small></div><div className="stat-caption">每日目标 {goal} 分钟 <span>{Math.min(100, Math.round(todayMinutes / goal * 100))}%</span></div><div className="progress-track"><i style={{ width: `${Math.min(100, todayMinutes / goal * 100)}%` }} /></div></div><div className="stat-card"><div className="stat-label">今日任务 <span className="stat-icon peach"><ListTodo size={18} /></span></div><div className="stat-number">{completed}<small>/ {todayTasks.length} 项</small></div><div className="stat-caption">{todayTasks.length ? completed === todayTasks.length ? '今天的计划全部完成啦' : `还有 ${todayTasks.length - completed} 个小目标等你完成` : '添加第一个小目标，开始今天的学习'}</div></div><div className="stat-card"><div className="stat-label">本周积累 <span className="stat-icon mint"><Flame size={18} /></span></div><div className="stat-number">{totalWeek}<small>分钟</small></div><div className="stat-caption">近 7 天学习了 {stats.filter(day => day.minutes > 0).length} 天 <span className="green">每一步都算数</span></div></div></section>
      <div className="dashboard-grid"><div className="dashboard-left"><section className="panel task-panel"><div className="section-heading"><h2>今天的学习清单 <span className="count-pill">{todayTasks.length}</span></h2><button className="text-button" onClick={() => setTab('tasks')}>全部任务 <ArrowUpRight size={15} /></button></div>{todayTasks.length ? todayTasks.map(taskRow) : <div className="empty-state"><span className="empty-icon"><ListTodo size={26} /></span><h3>给今天安排一个小目标</h3><p>阅读一章、练习一道题，都是很好的开始。</p><button className="text-button accent" onClick={() => openTask()}>创建第一个任务 <Plus size={16} /></button></div>}<button className="add-line" onClick={() => openTask()}><Plus size={17} />添加一项学习任务</button></section><section className="panel"><div className="section-heading"><div><h2>进步，看得见</h2><p className="section-subtitle">最近 7 天的专注时间</p></div><span className="chart-total">{totalWeek}<small> 分钟</small></span></div><div className="week-chart" role="img" aria-label={stats.map(day => `${day.date} ${day.minutes}分钟`).join('，')}>{stats.map(day => <div className={'chart-column ' + (day.date === today ? 'current' : '')} key={day.date}><span>{day.minutes || '—'}</span><div className="bar-well"><i style={{ height: `${Math.max(3, day.minutes / Math.max(...stats.map(d => d.minutes), 60) * 100)}%` }} /></div><small>{day.date === today ? '今天' : weekDay(day.date)}</small></div>)}</div></section></div><div className="dashboard-right"><section className="focus-card"><div className="focus-card-label"><span><i />给自己一段专心的时间</span><Timer size={18} /></div><div className="small-timer">{minuteText}<small>{clock.kind === 'break' ? '休息时间' : clock.deadline ? '专注进行中' : '专注一小步'}</small></div><button onClick={() => { setTab('focus'); if (!clock.deadline) toggleTimer(); }} className="focus-start"><Play size={17} fill="currentColor" />{clock.deadline ? '回到专注空间' : '开始专注'}</button><p>放下其他事情，此刻只做一件事。</p></section><section className="ai-card"><span className="ai-card-icon"><Sparkles size={23} /></span><h2>有问题，问学伴</h2><p>一个没弄懂的知识点，<br />一份不知道从哪开始的计划。</p><button onClick={() => setTab('ai')}>一起想清楚 <ArrowRight size={17} /></button><span className="ai-decoration" aria-hidden="true">✧</span></section><section className="gentle-note"><div><ShieldCheck size={17} />安心学习</div><p>任务与记录保存在当前浏览器。只有主动提问的内容才会发送给模型。</p></section></div></div>
    </>}
    {tab === 'tasks' && <><div className="page-heading"><div><div className="eyebrow">ONE TASK AT A TIME</div><h1>把目标变成小行动</h1><p>任务可以调整，开始永远不晚。</p></div><button className="primary-button" onClick={() => openTask()}><Plus size={17} />添加任务</button></div><section className="panel"><div className="task-toolbar"><div className="segmented">{[['all', '全部'], ['pending', '待完成'], ['done', '已完成']].map(([value, label]) => <button className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><input className="search-input" placeholder="搜索任务或学科…" aria-label="搜索任务" value={search} onChange={e => setSearch(e.target.value)} /></div>{tasks.filter(task => (filter === 'all' || (filter === 'done' ? task.done : !task.done)) && (task.title + task.subject).includes(search)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(task => <div key={task.id} className="dated-task"><div className="date-chip">{task.date === today ? '今天' : shortDay(task.date)}</div>{taskRow(task)}</div>)}{!tasks.length && <div className="empty-state"><ListTodo size={32} /><h3>你的任务清单还是空的</h3><p>添加任务，或者让学伴帮你拆解一个目标。</p><button className="secondary-button" onClick={() => { setPreview(null); setModal('plan'); }}>制定学习计划</button></div>}</section></>}
    {tab === 'plan' && <><div className="page-heading"><div><div className="eyebrow">MAKE ROOM FOR WHAT MATTERS</div><h1>给学习留一点时间</h1><p>让计划落在具体的一天，也给自己留出休息的空间。</p></div><button className="primary-button" onClick={() => { setPreview(null); setModal('plan'); }}><Sparkles size={17} />制定学习计划</button></div><section className="panel calendar-panel"><div className="section-heading"><h2>{shortDay(monday)} — {shortDay(addDays(monday, 6))}</h2><div className="inline-actions"><button className="icon-button" aria-label="上一周" onClick={() => setWeekOffset(n => n - 1)}><ChevronLeft size={18} /></button><button className="text-button" onClick={() => setWeekOffset(0)}>本周</button><button className="icon-button" aria-label="下一周" onClick={() => setWeekOffset(n => n + 1)}><ChevronRight size={18} /></button></div></div><div className="calendar-grid">{calendarDays.map(day => <div className={'calendar-day ' + (day === today ? 'today' : '')} key={day}><div className="calendar-day-label"><span>{weekDay(day)}</span><strong>{Number(day.slice(8))}</strong></div>{tasks.filter(task => task.date === day).sort((a, b) => a.time.localeCompare(b.time)).map(task => <button key={task.id} onClick={() => openTask(task)} className={'calendar-task ' + (task.done ? 'complete' : '')}><small>{task.time} · {task.minutes} 分钟</small><strong>{task.done && '✓ '}{task.title}</strong><span>{task.subject}</span></button>)}{!tasks.some(task => task.date === day) && <span className="no-schedule">留一点余白</span>}</div>)}</div></section></>}
    {tab === 'focus' && <><div className="page-heading"><div><div className="eyebrow">LESS DISTRACTION, MORE FOCUS</div><h1>此刻，只做一件事</h1><p>不追求完美的一天，先完成眼前这一小段。</p></div><span className="soft-badge"><ShieldCheck size={15} />仅记录完成的专注时段</span></div><section className="panel focus-room"><div className="segmented"><button className={clock.kind === 'focus' ? 'selected' : ''} onClick={() => resetTimer(25, 'focus')}><Timer size={15} />专注时间</button><button className={clock.kind === 'break' ? 'selected' : ''} onClick={() => resetTimer(5, 'break')}><Coffee size={15} />短暂休息</button></div><div className="timer-ring" style={{ background: `conic-gradient(var(--coral) ${progress}%, #eeedf3 0)` }}><div><div className="timer-digits" role="timer" aria-label={`剩余 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`}>{minuteText}</div><span>{clock.deadline ? '把注意力带回此刻' : remaining === 0 ? '做得很好，休息一下' : '准备好，就开始吧'}</span></div></div><select className="focus-task-select" aria-label="本轮学习任务" value={clock.taskId} disabled={Boolean(clock.deadline)} onChange={e => setClock(c => ({ ...c, taskId: e.target.value }))}><option value="">自由专注 · 不关联任务</option>{tasks.filter(task => !task.done).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select><div className="timer-controls"><button className="icon-button" onClick={() => resetTimer()} aria-label="重置计时"><RotateCcw size={21} /></button><button className="primary-button timer-main" onClick={toggleTimer}>{clock.deadline ? <Pause size={20} /> : <Play size={20} />}{clock.deadline ? '暂停一下' : remaining === 0 ? '再来一轮' : '开始专注'}</button></div>{clock.kind === 'focus' && <div className="duration-options">{[15, 25, 45].map(minutes => <button key={minutes} disabled={Boolean(clock.deadline)} className={clock.minutes === minutes ? 'selected' : ''} onClick={() => resetTimer(minutes, 'focus')}>{minutes} 分钟</button>)}</div>}<p className="muted small">保持页面打开可收到结束提示。关闭网页后不会发送提醒。</p></section><section className="panel recent-sessions"><div className="section-heading"><h2>最近的认真时刻</h2><span className="muted small">自动记录完成的时段</span></div>{sessions.length ? sessions.slice(-5).reverse().map(session => <div className="session-row" key={session.id}><span className="session-check"><Check size={15} /></span><strong>{session.taskTitle}</strong><span>{shortDay(session.date)}</span><b>{session.minutes} 分钟</b></div>) : <p className="muted">完成第一轮专注，这里就会留下你的进步。</p>}</section></>}
    {tab === 'ai' && <><div className="page-heading"><div><div className="eyebrow">CURIOSITY IS A GOOD BEGINNING</div><h1>每一个问题，都值得被认真回答</h1><p>解释知识、梳理思路、一起制定更可执行的计划。</p></div><span className={'soft-badge ' + (aiStatus ? 'connected' : '')}><span className="online-dot" />{aiStatus === null ? '检查连接中' : aiStatus ? 'DeepSeek 已连接' : '等待服务端配置'}</span></div><section className="panel chat-panel">{needsLogin && <div className="login-notice">登录后即可安全使用问答。<a href="/signin-with-chatgpt?return_to=/" target="_top">登录学习空间 →</a></div>}<div className="chat-toolbar"><span><Sparkles size={18} />学伴 · 你的学习搭子</span><button className="text-button" disabled={busy} onClick={() => setMessages([])}>新建对话</button></div><div className="chat-history">{!messages.length && <div className="chat-welcome"><span className="welcome-spark"><Sparkles size={32} /></span><h2>你好，今天想学点什么？</h2><p>从一个小问题开始，我们一起把它想明白。</p><div className="prompt-grid">{['用生活中的例子解释二分查找', '帮我理解为什么要学习函数', '我总是拖延，怎样开始学习？', '如何用费曼学习法复习一章内容？'].map(prompt => <button key={prompt} onClick={() => ask(prompt)}><CircleHelp size={17} />{prompt}<ArrowUpRight size={15} /></button>)}</div></div>}{messages.map((message, index) => <div className={'message ' + message.role} key={index}><div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={17} /> : '我'}</div><div><small>{message.role === 'assistant' ? '学伴' : '你'}</small><div className="message-content">{message.content}</div></div></div>)}{busy && <div className="message assistant"><div className="message-avatar"><Sparkles size={17} /></div><span className="thinking"><LoaderCircle size={16} />正在整理思路…</span></div>}<div ref={chatEnd} /></div><div className="chat-composer"><label className="checkbox-label"><input type="checkbox" checked={sharePlan} onChange={e => setSharePlan(e.target.checked)} />本次分享未完成的学习计划（最多 8 项）</label><form onSubmit={e => { e.preventDefault(); ask(); }}><textarea aria-label="输入你的学习问题" placeholder="说说你想弄懂的问题…" value={question} maxLength={2000} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }} /><button className="send-button" disabled={busy || !question.trim()} aria-label="发送问题"><Send size={20} /></button></form><p>回答由 AI 生成，请结合教材核对。当前对话只保存在页面内存中。</p></div></section></>}
    {tab === 'settings' && <><div className="page-heading"><div><div className="eyebrow">YOUR SPACE, YOUR PACE</div><h1>按自己的节奏学习</h1><p>管理每日目标、学习数据和提醒权限。</p></div></div><div className="settings-grid"><section className="panel"><h2><Target size={19} />每日学习目标</h2><p className="muted">一个可以坚持的小目标，比完美计划更有用。</p><label className="field">每天专注（分钟）<input type="number" min="15" max="600" step="15" value={goal} onChange={e => { const value = Number(e.target.value); if (value >= 15 && value <= 600) setGoal(value); }} /></label><h2 className="settings-subhead"><Bell size={19} />专注结束提醒</h2><p className="muted">通知只在网页打开时工作。浏览器可能限制后台通知。</p><button className="secondary-button" onClick={async () => { if (!('Notification' in window)) { setToast('当前浏览器不支持系统通知'); return; } const permission = await Notification.requestPermission(); setToast(permission === 'granted' ? '系统提醒已开启' : '未开启通知，仍会显示页面提醒'); }}>开启浏览器通知</button></section><section className="panel"><h2><ShieldCheck size={19} />数据与隐私</h2><p className="muted">任务和专注记录保存在当前浏览器，不会自动同步到其他设备。导出的备份可能包含个人学习内容，请妥善保管。</p><div className="data-actions"><button className="secondary-button" onClick={exportData}><Download size={16} />导出备份</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={16} />导入备份</button><input hidden ref={importRef} type="file" accept="application/json,.json" onChange={e => importData(e.target.files?.[0])} /></div><div className="privacy-info"><ShieldCheck size={20} /><div><strong>API 密钥只在服务端</strong><p>网页不保存、不显示密钥。学习问答通过服务器调用 DeepSeek，只有你发送的问题和主动分享的计划会发送给模型。</p></div></div><button className="danger-text" onClick={() => { if (confirm('这会删除当前浏览器中的全部任务和专注记录。请先导出备份。确定清空？')) { setTasks([]); setSessions([]); setMessages([]); setClock(blankClock()); setToast('本地学习数据已清空'); } }}><Trash2 size={15} />清空本地学习数据</button></section></div></>}
    <footer className="page-footer"><span>学伴 StudyMate</span><span>每一个认真学习的日子，都在积蓄力量。</span><span>✧</span></footer></div></main>
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal === 'task' && <Modal title={editing ? '调整学习任务' : '添加学习任务'} onClose={() => setModal(null)}><form onSubmit={saveTask}><label className="field">学习什么？<input name="title" autoFocus required maxLength={120} defaultValue={editing?.title || ''} placeholder="例如：理解二分查找并完成 3 道练习" /></label><div className="form-grid"><label className="field">学科<input name="subject" maxLength={30} defaultValue={editing?.subject || '综合'} /></label><label className="field">优先级<select name="priority" defaultValue={editing?.priority || 'normal'}><option value="normal">按计划进行</option><option value="high">优先学习</option><option value="low">有空再学</option></select></label><label className="field">日期<input name="date" type="date" required defaultValue={editing?.date || today} /></label><label className="field">开始时间<input name="time" type="time" required defaultValue={editing?.time || '19:00'} /></label></div><label className="field">预计时长（5—240 分钟）<input name="minutes" type="number" min={5} max={240} required defaultValue={editing?.minutes || 25} /></label><label className="field">学习步骤或备注<textarea name="notes" maxLength={500} defaultValue={editing?.notes || ''} placeholder="把任务拆成几个更容易开始的小步骤" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button><button className="primary-button">{editing ? '保存修改' : '加入学习计划'}</button></div></form></Modal>}
    {modal === 'plan' && <Modal title={preview ? '看看这份学习计划' : '把一个目标，拆成每天的一小步'} onClose={() => { if (!planBusy) setModal(null); }}>{preview ? <><p className="muted small">先检查内容和时间，再加入日历。添加后还可以逐项调整。</p><div className="plan-preview">{preview.map(task => <div key={task.id}><span>{shortDay(task.date)} · {task.time} · {task.minutes} 分钟</span><strong>{task.title}</strong><p>{task.notes}</p></div>)}</div><div className="modal-actions"><button className="secondary-button" onClick={() => setPreview(null)}>返回修改</button><button className="primary-button" onClick={addPreview}>确认加入日历</button></div></> : <form onSubmit={e => { e.preventDefault(); generatePlan(false); }}><label className="field">想达成什么目标？<input required maxLength={120} autoFocus value={planForm.goal} onChange={e => setPlanForm(p => ({ ...p, goal: e.target.value }))} placeholder="例如：入门 Python 的循环与函数" /></label><div className="form-grid"><label className="field">学科<input maxLength={30} value={planForm.subject} onChange={e => setPlanForm(p => ({ ...p, subject: e.target.value }))} /></label><label className="field">开始日期<input required type="date" value={planForm.start} onChange={e => setPlanForm(p => ({ ...p, start: e.target.value }))} /></label><label className="field">计划天数<input required type="number" min={1} max={14} value={planForm.days} onChange={e => setPlanForm(p => ({ ...p, days: Number(e.target.value) }))} /></label><label className="field">每天时长（分钟）<input required type="number" min={5} max={240} value={planForm.minutes} onChange={e => setPlanForm(p => ({ ...p, minutes: Number(e.target.value) }))} /></label></div><label className="field">每日开始时间<input required type="time" value={planForm.time} onChange={e => setPlanForm(p => ({ ...p, time: e.target.value }))} /></label><p className="muted small">本地生成会按“理解—练习—复盘”拆解目标；AI 生成会把此表单内容发送给 DeepSeek。</p><div className="modal-actions"><button className="secondary-button" disabled={planBusy}>本地生成</button><button className="primary-button" type="button" disabled={planBusy} onClick={() => generatePlan(true)}>{planBusy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{planBusy ? '正在制定计划…' : '让 AI 帮我拆解'}</button></div></form>}</Modal>}
  </div>;
}


