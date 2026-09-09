import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  WarningTriangle, Clock, CheckCircle, Calendar, Plus, Search, Xmark,
  Filter, Phone, Mail, MessageText, Page, MailOut, ClipboardCheck, ArrowRight,
  ArrowUpCircle, ShieldCheck,
} from 'iconoir-react';
import api from '../lib/api';
import './CRMPages.css';
import './CrmSurface.css';

/**
 * Complaints — wires up the `disputes` table (intake, ack/response SLA
 * timestamps, outcome, authority level, and — as of
 * 20260911_complaint_severity_workflow.sql — severity, root cause and
 * customer-confirmed closure) against the workshop's actual complaint
 * management policy.
 *
 * Severity drives everything downstream: S1 (safety/repeat) targets 1-2
 * working days and requires a root cause before closing; S2 (workmanship/
 * billing) targets 3-5; S3 (conduct/information) targets 2-3. A second
 * complaint on the same customer within 90 days is auto-flagged "repeat"
 * and forced to S1 server-side, so the severity shown here may not match
 * whatever was picked on the form.
 *
 * Workflow:
 *   open (unacknowledged) → Acknowledge → Start investigating →
 *   Resolve (outcome + resolution + root cause + what changed) →
 *   Mark communicated (told the customer, in writing) →
 *   Confirm resolution (the CUSTOMER confirmed the outcome — not staff
 *   finishing the paperwork) → Close
 *
 * "Escalate" is the manual trigger for a customer asking to speak to someone
 * more senior; the policy's automatic "time" trigger (target date passed)
 * is surfaced as is_escalation_due rather than auto-escalating, since
 * nothing pages anyone yet.
 */

const SEVERITY_META = {
  S1: { label: 'S1', name: 'Safety / repeat failure', color: '#c0392b', bg: '#fdeaea', hint: 'Safety consequence, a fault returning after repair, a vehicle left unusable, or any regulatory/insurer/legal dimension.' },
  S2: { label: 'S2', name: 'Workmanship / billing',   color: '#b26a00', bg: '#fdf2e0', hint: 'Work not to standard, invoice disputed, promised date missed, wrong part, or vehicle damage/condition discrepancy.' },
  S3: { label: 'S3', name: 'Conduct / information',   color: '#1f7a72', bg: '#e3f4f2', hint: 'Staff manner or professionalism, unclear advice, unanswered calls/messages, or site/waiting-area conditions.' },
};

const STATUS_META = {
  open:          { label: 'Pending',     color: '#c0392b', bg: '#fdeaea' },
  investigating: { label: 'In Progress', color: '#b26a00', bg: '#fdf2e0' },
  resolved:      { label: 'Completed',   color: '#2563eb', bg: '#eaf1fe' },
  closed:        { label: 'Closed',      color: '#17734f', bg: '#e7f3ec' },
};

const CHANNEL_META = {
  in_person: { label: 'In person', Icon: ClipboardCheck },
  phone:     { label: 'Phone',     Icon: Phone },
  email:     { label: 'Email',     Icon: Mail },
  whatsapp:  { label: 'WhatsApp',  Icon: MessageText },
  portal:    { label: 'Portal',    Icon: Page },
  letter:    { label: 'Letter',    Icon: MailOut },
};

const OUTCOME_META = {
  pending:         { label: 'Pending decision', color: '#8b93a3' },
  refund_due:      { label: 'Refund due',       color: '#c0392b' },
  charge_correct:  { label: 'Charge was correct', color: '#17734f' },
  partial_refund:  { label: 'Partial refund',   color: '#b26a00' },
  goodwill:        { label: 'Goodwill gesture',  color: '#6b5b95' },
};

const VIEWS = [
  { key: '',              label: 'Active' },
  { key: 'open',          label: 'Pending' },
  { key: 'investigating', label: 'In Progress' },
  { key: 'resolved',      label: 'Completed' },
  { key: 'closed',        label: 'Closed' },
  { key: 'all',           label: 'All' },
];

const fmtAge = iso => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function Complaints() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [view, setView] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [resolveFor, setResolveFor] = useState(null);
  const filterRef = useRef(null);

  const [form, setForm] = useState({
    reason: '', customer_id: '', amount: '', intake_channel: 'phone', authority_level: 'advisor', severity: 'S2',
  });
  const [formErrors, setFormErrors] = useState([]);

  const [resolveForm, setResolveForm] = useState({
    outcome: 'pending', resolution: '', changes_made: '',
    root_cause: '', root_cause_category: '', corrective_action: '',
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 280);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (view) qs.set('status', view);
      if (debounced) qs.set('search', debounced);
      if (channelFilter) qs.set('intake_channel', channelFilter);
      if (dateFrom) qs.set('from', dateFrom);
      if (dateTo) qs.set('to', dateTo);
      const statsQs = new URLSearchParams();
      if (dateFrom) statsQs.set('from', dateFrom);
      if (dateTo) statsQs.set('to', dateTo);
      const [list, s] = await Promise.all([
        api.get(`/disputes?${qs}`),
        api.get(`/disputes/stats?${statsQs}`),
      ]);
      if (list?.success) setRows(list.data || []);
      if (s?.success) setStats(s.data);
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message ? `Could not load complaints — ${e.message}` : 'Could not load complaints. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [view, debounced, channelFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showNew) return;
    api.get('/customers?limit=300').then(r => { if (r?.success) setCustomers(r.data || []); }).catch(() => {});
  }, [showNew]);

  useEffect(() => {
    if (showFilters === false) return;
    const onDown = e => { if (!filterRef.current?.contains(e.target)) setShowFilters(false); };
    const onKey = e => { if (e.key === 'Escape') setShowFilters(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showFilters]);

  async function act(row, path, okText, body) {
    setBusyId(row.id);
    try {
      const res = await api.post(`/disputes/${row.id}/${path}`, body || {});
      setBanner({ kind: res?.success ? 'ok' : 'error', text: res?.success ? okText : (res?.message || 'That did not work.') });
      load();
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message || 'That did not work.' });
    } finally {
      setBusyId(null);
    }
  }

  async function startInvestigating(row) {
    setBusyId(row.id);
    try {
      const res = await api.patch(`/disputes/${row.id}`, { status: 'investigating' });
      setBanner({ kind: res?.success ? 'ok' : 'error', text: res?.success ? 'Marked as investigating.' : (res?.message || 'That did not work.') });
      load();
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message || 'That did not work.' });
    } finally {
      setBusyId(null);
    }
  }

  async function submitResolve(e) {
    e.preventDefault();
    if (resolveFor.severity === 'S1' && !resolveForm.root_cause.trim()) {
      setBanner({ kind: 'error', text: 'Root cause is required for an S1 complaint before it can be resolved.' });
      return;
    }
    setBusyId(resolveFor.id);
    try {
      const res = await api.post(`/disputes/${resolveFor.id}/resolve`, resolveForm);
      if (res?.success) {
        setBanner({ kind: 'ok', text: 'Marked resolved.' });
        setResolveFor(null);
        setResolveForm({ outcome: 'pending', resolution: '', changes_made: '', root_cause: '', root_cause_category: '', corrective_action: '' });
        load();
      } else {
        setBanner({ kind: 'error', text: res?.message || 'Could not resolve that complaint.' });
      }
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message || 'Could not resolve that complaint.' });
    } finally {
      setBusyId(null);
    }
  }

  async function create(e) {
    e.preventDefault();
    setFormErrors([]);
    if (!form.reason.trim()) {
      setFormErrors([{ message: 'Describe what the complaint is about.' }]);
      return;
    }
    try {
      const res = await api.post('/disputes', {
        ...form,
        customer_id: form.customer_id || null,
        amount: form.amount || 0,
      });
      if (res?.success) {
        setShowNew(false);
        setForm({ reason: '', customer_id: '', amount: '', intake_channel: 'phone', authority_level: 'advisor', severity: 'S2' });
        setBanner({ kind: 'ok', text: `Logged as ${res.data.case_number}.` });
        load();
      } else {
        setFormErrors(res?.errors || [{ message: res?.message || 'Could not save the complaint.' }]);
      }
    } catch (err) {
      setFormErrors([{ message: err?.message || 'Could not save the complaint.' }]);
    }
  }

  const h = stats?.headline || {};
  const cards = [
    { key: 'open', label: 'Still open', value: h.stillOpen, Icon: WarningTriangle, tone: 'rose' },
    { key: 'ack', label: 'Acknowledged within 1 day', value: h.ackSlaPct != null ? `${h.ackSlaPct}%` : '—', Icon: Clock, tone: 'blue' },
    { key: 'res', label: 'Avg. resolution time', value: h.avgResolutionDays != null ? `${h.avgResolutionDays}d` : '—', Icon: Calendar, tone: 'amber' },
    { key: 'rate', label: 'Resolved / closed', value: h.resolutionRatePct != null ? `${h.resolutionRatePct}%` : '—', Icon: CheckCircle, tone: 'green' },
  ];
  const bySeverity = stats?.by_severity || [];

  const activeFilters = channelFilter ? 1 : 0;

  return (
    <div className="page-container cs">
      <header className="cs-head">
        <div>
          <h1 className="cs-title">Complaints</h1>
          <p className="cs-sub">Intake to resolution — acknowledgement, decision and follow-through in one place</p>
        </div>
        <div className="cs-actions">
          <input type="date" className="form-control tk-fixed-select" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} aria-label="From date" />
          <input type="date" className="form-control tk-fixed-select" value={dateTo}
            onChange={e => setDateTo(e.target.value)} aria-label="To date" />
          {(dateFrom || dateTo) && (
            <button className="cs-filter-clear" style={{ flex: 'none' }} onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear dates
            </button>
          )}
          <button className="cs-generate" onClick={() => setShowNew(true)}>
            <Plus width={17} height={17} /> New complaint
          </button>
        </div>
      </header>

      {banner && <div role="status" className={`cs-banner is-${banner.kind}`}>{banner.text}</div>}

      <div className="cs-kpis">
        {cards.map(c => (
          <div className={`cs-kpi cs-kpi--${c.tone}`} key={c.key}>
            <div className="cs-kpi-icon"><c.Icon width={24} height={24} /></div>
            <div className="cs-kpi-body">
              <p className="cs-kpi-value">{c.value ?? 0}</p>
              <p className="cs-kpi-label">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {bySeverity.length > 0 && (
        <div className="cs-meta" style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          {bySeverity.map(sv => {
            const m = SEVERITY_META[sv.severity] || SEVERITY_META.S2;
            return (
              <span key={sv.severity} className="cs-pill" style={{ color: m.color, background: m.bg }}>
                {m.label} · {m.name}: {sv.count} logged
                {sv.slaCompliancePct != null ? `, ${sv.slaCompliancePct}% within SLA` : ''}
              </span>
            );
          })}
        </div>
      )}

      <div className="cs-controls">
        <div className="cs-views" role="tablist" aria-label="Complaint views">
          {VIEWS.map(v => (
            <button key={v.key || 'default'} role="tab" aria-selected={view === v.key}
              className={`cs-view${view === v.key ? ' is-active' : ''}`} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="cs-search">
          <Search width={17} height={17} />
          <input placeholder="Search case #, customer or phone…" value={search}
            onChange={e => setSearch(e.target.value)} aria-label="Search complaints" />
        </div>
        <span className="cs-filter-wrap" ref={filterRef}>
          <button className={`cs-sort${activeFilters ? ' is-active' : ''}`} onClick={() => setShowFilters(v => !v)}
            aria-label="Filter by channel" aria-expanded={showFilters}>
            <Filter width={18} height={18} />
            {activeFilters > 0 && <span className="cs-filter-dot">{activeFilters}</span>}
          </button>
          {showFilters && (
            <div className="cs-filter-panel">
              <label htmlFor="f-channel">Channel</label>
              <select id="f-channel" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
                <option value="">Any channel</option>
                {Object.entries(CHANNEL_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
              <button className="cs-filter-clear" onClick={() => setChannelFilter('')} disabled={!activeFilters}>
                Clear filter
              </button>
            </div>
          )}
        </span>
      </div>

      <div className="cs-tablewrap">
        <table className="cs-table cs-table--tasks">
          <thead>
            <tr>
              <th>Case</th>
              <th>Customer</th>
              <th>Severity</th>
              <th>Channel</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Logged</th>
              <th style={{ textAlign: 'end' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="cs-empty">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="cs-empty">
                    <CheckCircle width={40} height={40} />
                    <p>{activeFilters > 0 || debounced ? 'No complaints match those filters.' : 'Nothing here — no complaints logged for this view.'}</p>
                  </div>
                </td>
              </tr>
            ) : rows.map(r => {
              const s = STATUS_META[r.status] || STATUS_META.open;
              const ch = CHANNEL_META[r.intake_channel] || CHANNEL_META.in_person;
              const sev = SEVERITY_META[r.severity] || SEVERITY_META.S2;
              const busy = busyId === r.id;
              return (
                <tr key={r.id}>
                  <td>
                    <div className="cs-task">
                      <span className="cs-task-icon" style={{ background: s.bg, color: s.color }}>
                        <WarningTriangle width={18} height={18} />
                      </span>
                      <span className="cs-task-body">
                        <div className="cs-task-title">{r.case_number}</div>
                        <div className="cs-task-note">{r.reason}</div>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="cs-name">{r.customer_name || '—'}</div>
                    {r.customer_phone && <div className="cs-meta">{r.customer_phone}</div>}
                    {r.work_order_number && <div className="cs-meta">{r.work_order_number}</div>}
                  </td>
                  <td>
                    <span className="cs-pill" style={{ color: sev.color, background: sev.bg }} title={sev.hint}>{sev.label}</span>
                    {r.is_repeat ? <div className="cs-meta">Repeat</div> : null}
                  </td>
                  <td className="cs-service">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ch.Icon width={14} height={14} /> {ch.label}
                    </span>
                  </td>
                  <td className="cs-service">{r.amount > 0 ? `AED ${Number(r.amount).toLocaleString()}` : '—'}</td>
                  <td>
                    <span className="cs-pill" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                  </td>
                  <td>
                    <div className="cs-due">{fmtDate(r.created_at)}</div>
                    <div className="cs-meta">{fmtAge(r.created_at)}</div>
                  </td>
                  <td>
                    <div className="cs-actions">
                      {r.status === 'closed' && <span className="cs-done">No action needed</span>}
                      {r.status === 'open' && !r.acknowledged_at && (
                        <button className="cs-send" disabled={busy} onClick={() => act(r, 'acknowledge', 'Acknowledged.')}>
                          <CheckCircle width={15} height={15} /> {busy ? '…' : 'Acknowledge'}
                        </button>
                      )}
                      {r.status === 'open' && r.acknowledged_at && (
                        <button className="cs-send" disabled={busy} onClick={() => startInvestigating(r)}>
                          <ArrowRight width={15} height={15} /> {busy ? '…' : 'Start investigating'}
                        </button>
                      )}
                      {r.status === 'investigating' && (
                        <button className="cs-send" disabled={busy} onClick={() => setResolveFor(r)}>
                          <CheckCircle width={15} height={15} /> Resolve
                        </button>
                      )}
                      {r.status === 'resolved' && !r.outcome_communicated_at && (
                        <button className="cs-send" disabled={busy} onClick={() => act(r, 'communicate', 'Recorded as communicated.')}>
                          <MailOut width={15} height={15} /> {busy ? '…' : 'Mark communicated'}
                        </button>
                      )}
                      {r.status === 'resolved' && r.outcome_communicated_at && !r.customer_confirmed_at && (
                        <button className="cs-send" disabled={busy} onClick={() => act(r, 'confirm', 'Customer confirmation recorded.')}>
                          <ShieldCheck width={15} height={15} /> {busy ? '…' : 'Confirm resolution'}
                        </button>
                      )}
                      {r.status === 'resolved' && r.customer_confirmed_at && (
                        <button className="cs-send" disabled={busy} onClick={() => act(r, 'close', 'Closed.')}>
                          <CheckCircle width={15} height={15} /> {busy ? '…' : 'Close'}
                        </button>
                      )}
                      {['open', 'investigating'].includes(r.status) && r.authority_level !== 'senior' && (
                        <button className="cs-btn-ghost" disabled={busy} onClick={() => act(r, 'escalate', 'Escalated.')}>
                          <ArrowUpCircle width={15} height={15} /> Escalate
                        </button>
                      )}
                    </div>
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
              <h2>New complaint</h2>
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
                  <label className="form-label">What is the complaint about</label>
                  <textarea className="form-control" rows={3} autoFocus value={form.reason}
                    onChange={e => setForm({ ...form, reason: e.target.value })}
                    placeholder="Customer says the AC repair did not fix the issue…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Severity</label>
                  <select className="form-control" value={form.severity}
                    onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {Object.entries(SEVERITY_META).map(([v, m]) => <option key={v} value={v}>{m.label} — {m.name}</option>)}
                  </select>
                  <p className="cs-meta" style={{ marginTop: 4 }}>{SEVERITY_META[form.severity].hint}</p>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Customer</label>
                    <select className="form-control" value={form.customer_id}
                      onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                      <option value="">No customer linked yet</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">How it came in</label>
                    <select className="form-control" value={form.intake_channel}
                      onChange={e => setForm({ ...form, intake_channel: e.target.value })}>
                      {Object.entries(CHANNEL_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Amount in dispute (AED)</label>
                    <input type="number" min="0" step="0.01" className="form-control" value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Authority needed</label>
                    <select className="form-control" value={form.authority_level}
                      onChange={e => setForm({ ...form, authority_level: e.target.value })}>
                      <option value="advisor">Advisor</option>
                      <option value="manager">Manager</option>
                      <option value="senior">Senior</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Log complaint</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolveFor && (
        <div className="modal-overlay" onClick={() => setResolveFor(null)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Resolve {resolveFor.case_number}</h2>
              <button className="modal-close" onClick={() => setResolveFor(null)} aria-label="Close">
                <Xmark width={18} height={18} />
              </button>
            </div>
            <form onSubmit={submitResolve}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Outcome</label>
                  <select className="form-control" value={resolveForm.outcome}
                    onChange={e => setResolveForm({ ...resolveForm, outcome: e.target.value })}>
                    {Object.entries(OUTCOME_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Resolution — what we decided</label>
                  <textarea className="form-control" rows={2} value={resolveForm.resolution}
                    onChange={e => setResolveForm({ ...resolveForm, resolution: e.target.value })}
                    placeholder="The compressor was faulty from a bad part; replaced under warranty." />
                </div>
                <div className="form-group">
                  <label className="form-label">What we changed as a result</label>
                  <textarea className="form-control" rows={2} value={resolveForm.changes_made}
                    onChange={e => setResolveForm({ ...resolveForm, changes_made: e.target.value })}
                    placeholder="Replaced compressor, refunded diagnostic fee." />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Root cause{resolveFor.severity === 'S1' ? ' (required for S1)' : ' (optional)'}
                  </label>
                  <textarea className="form-control" rows={2} value={resolveForm.root_cause}
                    onChange={e => setResolveForm({ ...resolveForm, root_cause: e.target.value })}
                    placeholder="Five-whys result — the process, control or resource that would have prevented this." />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Root cause category</label>
                    <select className="form-control" value={resolveForm.root_cause_category}
                      onChange={e => setResolveForm({ ...resolveForm, root_cause_category: e.target.value })}>
                      <option value="">—</option>
                      <option value="method">Method</option>
                      <option value="machine">Machine</option>
                      <option value="material">Material</option>
                      <option value="manpower">Manpower</option>
                      <option value="measurement">Measurement</option>
                      <option value="environment">Environment</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Corrective action</label>
                    <input className="form-control" value={resolveForm.corrective_action}
                      onChange={e => setResolveForm({ ...resolveForm, corrective_action: e.target.value })}
                      placeholder="What changes to stop this recurring" />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setResolveFor(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Mark resolved</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
