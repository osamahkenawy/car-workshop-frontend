import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle, Clock, WarningTriangle, Plus, Search, User, Xmark,
  Calendar, ClipboardCheck,
} from 'iconoir-react';
import api from '../lib/api';
import './CRMPages.css';

/**
 * Tasks & Follow-ups — one list of what staff owe customers.
 *
 * The Enquiries page already tracks follow-ups, but only for enquiries. A
 * promise made on a work order or a complaint was invisible. This covers any
 * record, and reports the enquiry follow-ups alongside so nobody has to
 * remember there are two places a follow-up can hide.
 */

const NAVY = '#1e3a6b';

const PRIORITY_META = {
  urgent: { label: 'Urgent', color: '#B3341F', bg: '#FDECEA' },
  high:   { label: 'High',   color: '#B77900', bg: '#FDF2D6' },
  normal: { label: 'Normal', color: '#4C5C64', bg: '#EDEEEA' },
  low:    { label: 'Low',    color: '#8A8A8A', bg: '#F4F4F4' },
};

const STATUS_META = {
  open:        { label: 'Open',        color: '#2E5E7E', bg: '#E6EEF4' },
  in_progress: { label: 'In progress', color: '#B77900', bg: '#FDF2D6' },
  done:        { label: 'Done',        color: '#1C6B52', bg: '#E7F0EB' },
  cancelled:   { label: 'Cancelled',   color: '#8A8A8A', bg: '#F0F0F0' },
};

const TASK_TYPES = [
  { v: 'follow_up',       label: 'Follow up' },
  { v: 'call_back',       label: 'Call back' },
  { v: 'quote_chase',     label: 'Chase a quote' },
  { v: 'collect_payment', label: 'Collect payment' },
  { v: 'check_part',      label: 'Check a part' },
  { v: 'complaint',       label: 'Complaint' },
  { v: 'reminder',        label: 'Reminder' },
  { v: 'other',           label: 'Other' },
];

const VIEWS = [
  { key: 'overdue',    label: 'Overdue' },
  { key: 'today',      label: 'Due today' },
  { key: 'mine',       label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: '',           label: 'All open' },
  { key: 'done',       label: 'Finished' },
];

const fmtDue = v => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(+d)) return null;
  const days = Math.floor((d - new Date()) / 86400000);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (days < -1) return { date, rel: `${Math.abs(days)} days late`, late: true };
  if (days === -1 || (days === 0 && d < new Date())) return { date, rel: 'overdue', late: true };
  if (days === 0) return { date, rel: 'today', late: false };
  if (days === 1) return { date, rel: 'tomorrow', late: false };
  return { date, rel: `in ${days} days`, late: false };
};

export default function CrmTasks() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [staff, setStaff] = useState([]);
  const [view, setView] = useState('overdue');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [banner, setBanner] = useState(null);
  const [form, setForm] = useState({
    title: '', details: '', task_type: 'follow_up', priority: 'normal', due_at: '', assigned_to: '',
  });
  const [formErrors, setFormErrors] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (view) qs.set('view', view);
      if (search.trim()) qs.set('search', search.trim());
      const [list, s] = await Promise.all([
        api.get(`/crm/tasks?${qs}`),
        api.get('/crm/tasks/stats'),
      ]);
      if (list?.success) setRows(list.data || []);
      if (s?.success) setStats(s.data);
    } catch {
      setBanner({ kind: 'error', text: 'Could not load tasks. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [view, search]);

  useEffect(() => { load(); }, [load]);

  // Staff list for assignment. Optional — the page works unassigned if the
  // users endpoint is not permitted for this role.
  useEffect(() => {
    api.get('/users?limit=100')
      .then(r => { if (r?.success) setStaff(r.data || []); })
      .catch(() => {});
  }, []);

  async function complete(row) {
    setBusyId(row.id);
    try {
      const res = await api.post(`/crm/tasks/${row.id}/complete`, {});
      setBanner({ kind: res?.success ? 'ok' : 'error', text: res?.message || 'Done.' });
      load();
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message || 'Could not complete that task.' });
    } finally {
      setBusyId(null);
    }
  }

  async function patch(row, body, okText) {
    setBusyId(row.id);
    try {
      const res = await api.patch(`/crm/tasks/${row.id}`, body);
      if (res?.success) setBanner({ kind: 'ok', text: okText });
      load();
    } catch {
      setBanner({ kind: 'error', text: 'Could not update that task.' });
    } finally {
      setBusyId(null);
    }
  }

  async function create(e) {
    e.preventDefault();
    setFormErrors([]);
    try {
      const res = await api.post('/crm/tasks', {
        ...form,
        assigned_to: form.assigned_to || null,
        due_at: form.due_at || null,
      });
      if (res?.success) {
        setShowNew(false);
        setForm({ title: '', details: '', task_type: 'follow_up', priority: 'normal', due_at: '', assigned_to: '' });
        setBanner({ kind: 'ok', text: 'Task added.' });
        load();
      }
    } catch (err) {
      // The API returns per-field messages written for a person to read.
      setFormErrors(err?.errors || [{ message: err?.message || 'Could not save the task.' }]);
    }
  }

  const T = stats?.totals || {};
  const cards = [
    { key: 'overdue',    label: 'Overdue',      value: T.overdue,     Icon: WarningTriangle, accent: '#B3341F' },
    { key: 'today',      label: 'Due today',    value: T.due_today,   Icon: Calendar,        accent: '#B77900' },
    { key: 'open',       label: 'Open',         value: T.open_count,  Icon: ClipboardCheck,  accent: '#2E5E7E' },
    { key: 'unassigned', label: 'Unassigned',   value: T.unassigned,  Icon: User,            accent: '#6B5B95' },
    { key: 'done',       label: 'Done today',   value: T.done_today,  Icon: CheckCircle,     accent: '#1C6B52' },
  ];

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">{t('common.crm_tasks', 'Tasks & Follow-ups')}</h1>
          <p className="page-subheading">Everything staff owe customers, in one list</p>
        </div>
        <button className="btn-primary-action" onClick={() => setShowNew(true)}>
          <Plus width={16} height={16} /> New task
        </button>
      </div>

      {banner && (
        <div role="status" style={{
          margin: '0 0 16px', padding: '10px 14px', borderRadius: 8, fontSize: 14, border: '1px solid',
          borderColor: banner.kind === 'error' ? '#B3341F' : '#1C6B52',
          background: banner.kind === 'error' ? '#FDECEA' : '#E7F0EB',
          color: banner.kind === 'error' ? '#8C2818' : '#14503D',
        }}>{banner.text}</div>
      )}

      <div className="stats-grid">
        {cards.map(c => (
          <div className="stat-card" key={c.key} style={{ borderTop: `3px solid ${c.accent}` }}>
            <div className="stat-icon" style={{ background: `${c.accent}18`, color: c.accent }}>
              <c.Icon width={20} height={20} />
            </div>
            <div className="stat-info">
              <h3 style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(c.value ?? 0)}</h3>
              <p>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {Number(T.enquiry_follow_ups_due) > 0 && (
        <div style={{
          margin: '0 0 16px', padding: '10px 14px', borderRadius: 8, fontSize: 14,
          border: '1px solid #B77900', background: '#FDF2D6', color: '#7A5200',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Clock width={16} height={16} style={{ flex: 'none' }} />
          <span>
            <strong>{T.enquiry_follow_ups_due}</strong> enquiry follow-up{Number(T.enquiry_follow_ups_due) === 1 ? '' : 's'} are
            also due, tracked on the Enquiries page rather than here.
          </span>
        </div>
      )}

      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIEWS.map(v => (
            <button key={v.key || 'all'} onClick={() => setView(v.key)}
              className={view === v.key ? 'btn-sm-primary' : 'btn-sm-outline'}>
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search width={16} height={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9aa0aa' }} />
          <input className="form-control" style={{ paddingInlineStart: 32 }}
            placeholder="Search task, customer or phone…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Due</th>
              <th>Assigned</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="empty-col">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <ClipboardCheck className="empty-icon" width={40} height={40} />
                  <p>{view === 'overdue' ? 'Nothing overdue. ' : ''}No tasks in this view.</p>
                </div>
              </td></tr>
            ) : rows.map(r => {
              const p = PRIORITY_META[r.priority] || PRIORITY_META.normal;
              const s = STATUS_META[r.status] || STATUS_META.open;
              const due = fmtDue(r.due_at);
              const busy = busyId === r.id;
              const open = ['open', 'in_progress'].includes(r.status);
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    {r.details && (
                      <div style={{ fontSize: 12, color: '#7d8494', maxWidth: 320 }}>{r.details}</div>
                    )}
                  </td>
                  <td>
                    {r.customer_name || '—'}
                    {r.customer_phone && (
                      <div style={{ fontSize: 12, color: '#7d8494' }}>{r.customer_phone}</div>
                    )}
                    {(r.make || r.plate_number) && (
                      <div style={{ fontSize: 12, color: '#7d8494' }}>
                        {[r.make, r.model].filter(Boolean).join(' ')} {r.plate_number || ''}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {(TASK_TYPES.find(x => x.v === r.task_type) || {}).label || r.task_type}
                  </td>
                  <td>
                    <span className="status-badge" style={{ color: p.color, background: p.bg }}>
                      {r.priority === 'urgent' && <WarningTriangle width={11} height={11} />} {p.label}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {due ? (
                      <>
                        <span style={{ color: due.late ? '#B3341F' : 'inherit', fontWeight: due.late ? 600 : 400 }}>
                          {due.date}
                        </span>
                        <div style={{ fontSize: 12, color: due.late ? '#B3341F' : '#7d8494' }}>{due.rel}</div>
                      </>
                    ) : <span style={{ color: '#9aa0aa' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {r.assigned_name || <span style={{ color: '#B77900' }}>Unassigned</span>}
                  </td>
                  <td>
                    <span className="status-badge" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {open && (
                      <>
                        <button className="btn-sm-primary" disabled={busy} onClick={() => complete(r)}>
                          <CheckCircle width={13} height={13} /> {busy ? '…' : 'Done'}
                        </button>
                        {r.status === 'open' && (
                          <button className="btn-sm-outline" disabled={busy}
                            onClick={() => patch(r, { status: 'in_progress' }, 'Marked in progress.')}>
                            Start
                          </button>
                        )}
                        <button className="btn-sm-danger" disabled={busy} title="Cancel"
                          onClick={() => patch(r, { status: 'cancelled' }, 'Task cancelled.')}>
                          <Xmark width={13} height={13} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New task</h2>
              <button className="modal-close" onClick={() => setShowNew(false)} aria-label="Close">
                <Xmark width={18} height={18} />
              </button>
            </div>
            <form onSubmit={create}>
              <div className="modal-body">
                {formErrors.length > 0 && (
                  <div className="alert-error" style={{ marginBottom: 12 }}>
                    {formErrors.map((e, i) => <div key={i}>{e.message}</div>)}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">What needs doing</label>
                  <input className="form-control" autoFocus value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Call Mr Haddad about the brake quote" />
                </div>
                <div className="form-group">
                  <label className="form-label">Details</label>
                  <textarea className="form-control" rows={3} value={form.details}
                    onChange={e => setForm({ ...form, details: e.target.value })}
                    placeholder="Anything the person picking this up needs to know" />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={form.task_type}
                      onChange={e => setForm({ ...form, task_type: e.target.value })}>
                      {TASK_TYPES.map(x => <option key={x.v} value={x.v}>{x.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-control" value={form.priority}
                      onChange={e => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(PRIORITY_META).map(([v, m]) => (
                        <option key={v} value={v}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Due</label>
                    <input type="datetime-local" className="form-control" value={form.due_at}
                      onChange={e => setForm({ ...form, due_at: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assign to</label>
                    <select className="form-control" value={form.assigned_to}
                      onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                      <option value="">Nobody yet</option>
                      {staff.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
