import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User, Car, Wallet, Calendar, Megaphone, Package, Page, EmojiSatisfied,
  Bell, Phone, Mail, ChatBubble, Plus, ArrowLeft, CheckCircle, Clock,
  ClipboardCheck, Search,
} from 'iconoir-react';
import api from '../lib/api';
import { fmtCurrency } from '../utils/currency';
import './CRMPages.css';

/**
 * Customer 360 — one screen for everything known about a customer.
 *
 * The history already existed, scattered across enquiries, work orders,
 * invoices, feedback and vehicles. Answering "what's the story with this
 * customer?" meant opening four pages and reading dates. This assembles it.
 *
 * Reached either with an :id in the URL, or by searching from here.
 */

const NAVY = '#1e3a6b';

/** How each timeline event is drawn. */
const EVENT_META = {
  enquiry:              { Icon: Megaphone,       color: '#B77900' },
  work_order:           { Icon: Package,         color: '#2E5E7E' },
  work_order_completed: { Icon: CheckCircle,     color: '#1C6B52' },
  invoice:              { Icon: Page,            color: '#6B5B95' },
  feedback:             { Icon: EmojiSatisfied,  color: '#0d6273' },
  activity:             { Icon: Phone,           color: '#4C5C64' },
  reminder_sent:        { Icon: Bell,            color: '#B77900' },
};

const ACTIVITY_TYPES = [
  { v: 'call_out',  label: 'Called them' },
  { v: 'call_in',   label: 'They called' },
  { v: 'whatsapp',  label: 'WhatsApp' },
  { v: 'email',     label: 'Email' },
  { v: 'visit',     label: 'Walk-in visit' },
  { v: 'complaint', label: 'Complaint' },
  { v: 'note',      label: 'Note' },
];

const CHANNELS = [
  { v: 'sms', label: 'SMS', Icon: ChatBubble },
  { v: 'whatsapp', label: 'WhatsApp', Icon: ChatBubble },
  { v: 'email', label: 'Email', Icon: Mail },
  { v: 'call', label: 'Phone call', Icon: Phone },
];

const fmtWhen = v => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(+d)) return String(v).slice(0, 16);
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export default function Customer360() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState({ activity_type: 'call_out', subject: '', body: '' });

  // Search, for when the page is opened without a customer.
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/crm/customers/${id}`);
      if (res?.success) setData(res.data);
      else setError(res?.message || 'Could not load that customer.');
    } catch (e) {
      setError(e?.message || 'Could not load that customer.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function search(e) {
    e?.preventDefault();
    if (!term.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/customers?search=${encodeURIComponent(term.trim())}&limit=20`);
      if (res?.success) setResults(res.data || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function logActivity(e) {
    e.preventDefault();
    if (!logForm.subject.trim() && !logForm.body.trim()) return;
    try {
      const res = await api.post(`/crm/customers/${id}/activities`, logForm);
      if (res?.success) {
        setShowLog(false);
        setLogForm({ activity_type: 'call_out', subject: '', body: '' });
        setBanner({ kind: 'ok', text: 'Logged.' });
        load();
      }
    } catch (err) {
      setBanner({ kind: 'error', text: err?.message || 'Could not save that.' });
    }
  }

  async function setChannel(channel) {
    try {
      await api.patch(`/crm/customers/${id}/consent`, { preferred_channel: channel });
      setBanner({ kind: 'ok', text: `Reminders will go by ${channel}.` });
      load();
    } catch {
      setBanner({ kind: 'error', text: 'Could not update the channel.' });
    }
  }

  async function toggleConsent(on) {
    try {
      await api.patch(`/crm/customers/${id}/consent`, { marketing_consent: on, source: 'staff' });
      setBanner({
        kind: 'ok',
        text: on ? 'Marketing consent recorded.' : 'Marketing consent withdrawn.',
      });
      load();
    } catch {
      setBanner({ kind: 'error', text: 'Could not update consent.' });
    }
  }

  /* ── No customer chosen: search ─────────────────────────── */
  if (!id) {
    return (
      <div className="page-container">
        <div className="page-header-row">
          <div>
            <h1 className="page-heading">{t('common.customer_360', 'Customer 360')}</h1>
            <p className="page-subheading">Everything you know about one customer, on one screen</p>
          </div>
        </div>
        <form onSubmit={search} className="filter-bar" style={{ gap: 8 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search width={16} height={16}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9aa0aa' }} />
            <input className="form-control" style={{ paddingInlineStart: 32 }} autoFocus
              placeholder="Search by name, phone or email…"
              value={term} onChange={e => setTerm(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {results.length > 0 && (
          <div className="table-responsive">
            <table className="contacts-table">
              <thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th>City</th><th /></tr></thead>
              <tbody>
                {results.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.full_name}</strong>{c.company_name ? ` · ${c.company_name}` : ''}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-sm-primary" onClick={() => navigate(`/crm/customers/${c.id}`)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {results.length === 0 && term && !searching && (
          <div className="empty-state">
            <User className="empty-icon" width={40} height={40} />
            <p>Nobody matched “{term}”.</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) return <div className="page-container"><p>Loading…</p></div>;
  if (error) {
    return (
      <div className="page-container">
        <button className="btn-sm-outline" onClick={() => navigate('/crm/customers')}>
          <ArrowLeft width={14} height={14} /> Back
        </button>
        <div className="empty-state" style={{ marginTop: 20 }}>
          <User className="empty-icon" width={40} height={40} />
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { customer: c, vehicles, stats, feedback, timeline, tasks, reminders } = data;

  // Four cards: a fifth wraps to its own row on .stats-grid. Average job is a
  // property of lifetime value, so it reads better beneath it than beside it.
  const cards = [
    {
      key: 'ltv', label: 'Lifetime value', value: fmtCurrency(stats.lifetime_value),
      Icon: Wallet, accent: '#1C6B52',
      sub: Number(stats.avg_job_value) > 0 ? `${fmtCurrency(stats.avg_job_value)} average job` : null,
    },
    { key: 'jobs', label: 'Jobs completed', value: Number(stats.jobs_completed ?? 0), Icon: Package, accent: '#2E5E7E' },
    {
      key: 'last', label: 'Last visit', Icon: Calendar, accent: '#B77900',
      value: stats.days_since_last_visit === null
        ? 'Never'
        : stats.days_since_last_visit === 0 ? 'Today' : `${stats.days_since_last_visit}d ago`,
    },
    {
      key: 'enq', label: 'Enquiries', value: Number(stats.enquiries_total ?? 0),
      Icon: Megaphone, accent: '#6B5B95',
      sub: Number(stats.enquiries_converted) > 0 ? `${Number(stats.enquiries_converted)} converted` : null,
    },
  ];

  return (
    <div className="page-container">
      <button className="btn-sm-outline" style={{ marginBottom: 12 }} onClick={() => navigate('/crm/customers')}>
        <ArrowLeft width={14} height={14} /> All customers
      </button>

      <div className="page-header-row">
        <div>
          <h1 className="page-heading" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {c.full_name}
            {stats.is_repeat && (
              <span className="status-badge" style={{ background: '#E7F0EB', color: '#1C6B52' }}>
                Repeat customer
              </span>
            )}
          </h1>
          <p className="page-subheading">
            {[c.company_name, c.phone, c.email, [c.area, c.city].filter(Boolean).join(', ')]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <button className="btn-primary-action" onClick={() => setShowLog(true)}>
          <Plus width={16} height={16} /> Log a call or note
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
        {cards.map(x => (
          <div className="stat-card" key={x.key} style={{ borderTop: `3px solid ${x.accent}` }}>
            <div className="stat-icon" style={{ background: `${x.accent}18`, color: x.accent }}>
              <x.Icon width={20} height={20} />
            </div>
            <div className="stat-info">
              <h3 style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.28rem', overflowWrap: 'anywhere' }}>
                <bdi>{x.value}</bdi>
              </h3>
              <p>{x.label}</p>
              {x.sub && (
                <p style={{ fontSize: 11, margin: 0, color: '#8A8A8A' }}><bdi>{x.sub}</bdi></p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── How to reach them ───────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10,
        padding: '14px 16px', margin: '0 0 20px',
        display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7d8494' }}>
            Reminders go by
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {CHANNELS.map(ch => (
              <button key={ch.v}
                className={c.preferred_channel === ch.v ? 'btn-sm-primary' : 'btn-sm-outline'}
                onClick={() => setChannel(ch.v)}>
                <ch.Icon width={13} height={13} /> {ch.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ borderInlineStart: '1px solid #e3e8ef', paddingInlineStart: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7d8494' }}>
            Marketing
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="status-badge" style={
              Number(c.marketing_consent) === 1
                ? { background: '#E7F0EB', color: '#1C6B52' }
                : { background: '#F0F0F0', color: '#8A8A8A' }
            }>
              {Number(c.marketing_consent) === 1 ? 'Opted in' : 'Not opted in'}
            </span>
            <button className="btn-sm-outline"
              onClick={() => toggleConsent(Number(c.marketing_consent) !== 1)}>
              {Number(c.marketing_consent) === 1 ? 'Withdraw' : 'Record consent'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#9aa0aa', marginTop: 4, maxWidth: 280 }}>
            Service reminders are sent either way. This covers promotions only.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 20rem)', gap: 20, alignItems: 'start' }}>
        {/* ── Timeline ─────────────────────────────────────── */}
        <div>
          <h3 style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7d8494', margin: '0 0 12px' }}>
            History · {timeline.total} events
          </h3>
          {timeline.events.length === 0 ? (
            <div className="empty-state">
              <Clock className="empty-icon" width={36} height={36} />
              <p>Nothing recorded for this customer yet.</p>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingInlineStart: 26 }}>
              <div style={{
                position: 'absolute', insetInlineStart: 7, top: 6, bottom: 6,
                width: 2, background: '#e3e8ef',
              }} />
              {timeline.events.map((e, i) => {
                const m = EVENT_META[e.kind] || { Icon: Clock, color: '#4C5C64' };
                return (
                  <div key={`${e.kind}-${e.id}-${i}`} style={{ position: 'relative', paddingBottom: 18 }}>
                    <div style={{
                      position: 'absolute', insetInlineStart: -26, top: 2,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', border: `2px solid ${m.color}`,
                      display: 'grid', placeItems: 'center',
                    }}>
                      <m.Icon width={9} height={9} style={{ color: m.color }} />
                    </div>
                    <div style={{ fontSize: 12, color: '#9aa0aa' }}>{fmtWhen(e.at)}</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                    {e.detail && (
                      <div style={{ fontSize: 13, color: '#4b5568', marginTop: 2 }}>{e.detail}</div>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                      {e.meta?.status && (
                        <span className="status-badge" style={{ background: '#F4F6FA', color: NAVY, fontSize: 11 }}>
                          {String(e.meta.status).replace(/_/g, ' ')}
                        </span>
                      )}
                      {e.meta?.amount > 0 && (
                        <span className="status-badge" style={{ background: '#E7F0EB', color: '#1C6B52', fontSize: 11 }}>
                          <bdi>{fmtCurrency(e.meta.amount)}</bdi>
                        </span>
                      )}
                      {e.meta?.channel && (
                        <span className="status-badge" style={{ background: '#EDEEEA', color: '#4C5C64', fontSize: 11 }}>
                          {e.meta.channel}
                        </span>
                      )}
                      {e.meta?.nps !== undefined && e.meta?.nps !== null && (
                        <span className="status-badge" style={{ background: '#E2EFF1', color: '#0d6273', fontSize: 11 }}>
                          NPS <bdi>{e.meta.nps}</bdi>
                        </span>
                      )}
                      {e.meta?.by && (
                        <span style={{ fontSize: 11, color: '#9aa0aa' }}>by {e.meta.by}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Side column ──────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 16 }}>
          <Panel title={`Vehicles · ${vehicles.length}`} Icon={Car}>
            {vehicles.length === 0 ? <Muted>No vehicles on file.</Muted> : vehicles.map(v => (
              <div key={v.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {[v.make, v.model, v.year].filter(Boolean).join(' ')}
                </div>
                <div style={{ fontSize: 12, color: '#7d8494' }}>
                  {v.plate_number || '—'}
                  {v.mileage ? ` · ${Number(v.mileage).toLocaleString()} km` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#7d8494' }}>
                  {v.jobs_completed > 0
                    ? `${v.jobs_completed} job${v.jobs_completed === 1 ? '' : 's'} · last ${String(v.last_service_at || '').slice(0, 10)}`
                    : 'Never serviced here'}
                </div>
              </div>
            ))}
          </Panel>

          <Panel title={`Open tasks · ${tasks.length}`} Icon={ClipboardCheck}>
            {tasks.length === 0 ? <Muted>Nothing outstanding.</Muted> : tasks.map(tk => (
              <div key={tk.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
                <div style={{ fontSize: 14 }}>{tk.title}</div>
                <div style={{ fontSize: 12, color: '#7d8494' }}>
                  {tk.due_at ? `due ${String(tk.due_at).slice(0, 10)}` : 'no due date'} · {tk.priority}
                </div>
              </div>
            ))}
            <Link to="/crm/tasks" style={{ fontSize: 13, display: 'inline-block', marginTop: 8 }}>
              All tasks →
            </Link>
          </Panel>

          <Panel title={`Reminders · ${reminders.length}`} Icon={Bell}>
            {reminders.length === 0 ? <Muted>None scheduled.</Muted> : reminders.map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
                <div style={{ fontSize: 14 }}>{String(r.service_type).replace(/_/g, ' ')}</div>
                <div style={{ fontSize: 12, color: '#7d8494' }}>
                  {[r.make, r.model].filter(Boolean).join(' ')} · due {String(r.due_at || '').slice(0, 10)} · {r.status}
                </div>
              </div>
            ))}
            <Link to="/crm/reminders" style={{ fontSize: 13, display: 'inline-block', marginTop: 8 }}>
              All reminders →
            </Link>
          </Panel>

          {feedback && Number(feedback.responses) > 0 && (
            <Panel title="Feedback" Icon={EmojiSatisfied}>
              <div style={{ fontSize: 14 }}>
                {feedback.responses} response{Number(feedback.responses) === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: 12, color: '#7d8494' }}>
                {feedback.avg_nps !== null && <>NPS <bdi>{feedback.avg_nps}</bdi> · </>}
                {feedback.avg_csat !== null && <>CSAT <bdi>{feedback.avg_csat}</bdi></>}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {showLog && (
        <div className="modal-overlay" onClick={() => setShowLog(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Log a call or note</h2>
              <button className="modal-close" onClick={() => setShowLog(false)} aria-label="Close">
                <Plus width={18} height={18} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            <form onSubmit={logActivity}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">What happened</label>
                  <select className="form-control" value={logForm.activity_type}
                    onChange={e => setLogForm({ ...logForm, activity_type: e.target.value })}>
                    {ACTIVITY_TYPES.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Summary</label>
                  <input className="form-control" autoFocus value={logForm.subject}
                    onChange={e => setLogForm({ ...logForm, subject: e.target.value })}
                    placeholder="Called about the AC quote" />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={4} value={logForm.body}
                    onChange={e => setLogForm({ ...logForm, body: e.target.value })}
                    placeholder="What was agreed, and anything to pick up next time" />
                </div>
                <p className="form-hint">
                  Whoever opens this customer next will see it on the timeline.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowLog(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, Icon, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e8ef', borderRadius: 10, padding: '12px 14px' }}>
      <h3 style={{
        fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7d8494',
        margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Icon width={14} height={14} /> {title}
      </h3>
      {children}
    </div>
  );
}

function Muted({ children }) {
  return <div style={{ fontSize: 13, color: '#9aa0aa' }}>{children}</div>;
}
