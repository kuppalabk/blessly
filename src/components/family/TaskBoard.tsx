'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/api';
import { Avatar } from './Avatar';
import { useT } from '@/components/I18n';
import { msg } from '@/lib/i18n/ui';

export type TaskRow = { id: string; title: string; status: 'todo' | 'doing' | 'done'; assigneeId: string | null; assigneeName: string | null; dueDate: string | null; createdBy: string | null };
type Member = { userId: string; name: string };
type Me = { userId: string; canEdit: boolean; canManage: boolean };

const COLS = [['todo', msg('To do')], ['doing', msg('In progress')], ['done', msg('Done')]] as const;
const NEXT: Record<TaskRow['status'], { to: TaskRow['status']; label: string }> = {
  todo: { to: 'doing', label: msg('Start') }, doing: { to: 'done', label: msg('Mark done') }, done: { to: 'todo', label: msg('Reopen') }
};

function due(d: string | null, intl: string) {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, day)));
}

/** "Who is doing what" — a three-column board on desktop, stacked on phones. */
export function TaskBoard({ tasks, members, familyId, eventId, me }: { tasks: TaskRow[]; members: Member[]; familyId: string; eventId?: string; me: Me }) {
  const { t: tr, intl } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : tr("Something went wrong")); }
    setBusy(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(tr("What needs doing?"));
    await run('add', async () => {
      await api(`/api/families/${familyId}/tasks`, { body: { title, assigneeId: assignee || null, dueDate: dueDate || null, eventId: eventId ?? null } });
      setTitle(''); setAssignee(''); setDueDate('');
    });
  }

  return (
    <div className="stack">
      <div className="board">
        {COLS.map(([status, label]) => {
          const list = tasks.filter((t) => t.status === status);
          return (
            <section key={status} className="board-col" aria-label={`${tr(label)} (${list.length})`}>
              <p className="eyebrow">{tr(label)} · {list.length}</p>
              {list.map((t) => {
                const mayMove = me.canEdit || t.assigneeId === me.userId;
                const mayDelete = me.canManage || (me.canEdit && t.createdBy === me.userId);
                return (
                  <article key={t.id} className={`task ${t.status === 'done' ? 'task-done' : ''}`} aria-label={t.title}>
                    <b className="task-title">{t.title}</b>
                    <div className="row small" style={{ gap: 8 }}>
                      {t.assigneeId ? <><Avatar name={t.assigneeName ?? '?'} id={t.assigneeId} small /><span className="grow">{t.assigneeId === me.userId ? tr("You") : t.assigneeName}</span></> : <span className="grow muted">{tr("Unassigned")}</span>}
                      {t.dueDate && <span className="badge">{due(t.dueDate, intl)}</span>}
                    </div>
                    {(mayMove || mayDelete) && (
                      <div className="row" style={{ gap: 6 }}>
                        {mayMove && <button className="btn btn-ghost btn-sm grow" disabled={busy === t.id} onClick={() => run(t.id, () => api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { status: NEXT[t.status].to } }))}>{tr(NEXT[t.status].label)}</button>}
                        {me.canEdit && !t.assigneeId && <button className="btn btn-ghost btn-sm" disabled={busy === t.id} onClick={() => run(t.id, () => api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { assigneeId: me.userId } }))}>{tr("I’ll do it")}</button>}
                        {mayDelete && <button className="btn btn-ghost btn-sm" aria-label={tr("Delete task {title}", { title: t.title })} disabled={busy === t.id} onClick={() => run(t.id, () => api(`/api/tasks/${t.id}`, { method: 'DELETE' }))}>✕</button>}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      {me.canEdit && (
        <form onSubmit={add} className="card-box stack" aria-label={tr("Add a task")} noValidate>
          <label className="field">{tr("New task")}<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("e.g. Order the cake")} maxLength={100} />
          </label>
          <div className="two-col" style={{ gap: 12 }}>
            <label className="field">{tr("Who")}<select className="select" aria-label={tr("Assign to")} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">{tr("Anyone")}</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.userId === me.userId ? tr("Me ({name})", { name: m.name }) : m.name}</option>)}
              </select>
            </label>
            <label className="field">{tr("Due (optional)")}<input className="input" type="date" aria-label={tr("Due date")} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <button className="btn" disabled={busy === 'add'}>{busy === 'add' ? tr("Adding…") : tr("Add task")}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
