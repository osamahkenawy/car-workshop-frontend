import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell, Calendar, Send, Clock, CheckCircle, WarningTriangle,
  Refresh, Search, Phone, Mail, ChatBubble, Xmark, Car,
} from 'iconoir-react';
import api from '../lib/api';
import './CRMPages.css';

/**
 * Service Reminders — the CRM module with a revenue case rather than a
 * time-saving one: it brings cars back.
 *
 * The engine works out which vehicles are due from the last completed job of
 * each service type. Sending is a deliberate act here rather than automatic —
 * a cron that messages customers unattended is how a workshop texts three
 * hundred people at 3am.
 */

const NAVY = '#1e3a6b';

const STATUS_META = {
  scheduled: { label: 'Upcoming',  color: '#4C5C64', bg: '#EDEEEA' },
  due:       { label: 'Due now',   color: '#B77900', bg: '#FDF2D6' },
  sent:      { label: 'Sent',      color: '#2E5E7E', bg: '#E6EEF4' },
  snoozed:   { label: 'Snoozed',   color: '#6B5B95', bg: '#EFEAF6' },
  booked:    { label: 'Booked',    color: '#1C6B52', bg: '#E7F0EB' },
  converted: { label: 'Converted', color: '#1C6B52', bg: '#E7F0EB' },
  dismissed: { label: 'Dismissed', color: '#8A8A8A', bg: '#F0F0F0' },
  expired:   { label: 'Expired',   color: '#8A8A8A', bg: '#F0F0F0' },
};

const SERVICE_LABELS = {
  oil_change: 'Oil change',
  general_maintenance: 'Periodic maintenance',
  tire_service: 'Tyre check / rotation',
  brake_repair: 'Brake inspection',
  diagnostic: 'Diagnostic check',
  electrical: 'Battery / electrical',
  transmission: 'Transmission service',
};

const CHANNEL_ICON = { whatsapp: ChatBubble, sms: ChatBubble, email: Mail, call: Phone, none: Xmark };

const VIEWS = [
  { key: 'due',      label: 'Due now' },
  { key: 'overdue',  label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'sent',     label: 'Awaiting reply' },
  { key: 'won',      label: 'Booked' },
  { key: '',         label: 'All open' },
];

export default function CrmReminders() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState('due');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (view) qs.set('view', view);
      if (search.trim()) qs.set('search', search.trim());
      const [list, s] = await Promise.all([
        api.get(`/crm/reminders?${qs}`),
        api.get('/crm/reminders/stats'),
      ]);
      if (list?.success) setRows(list.data || []);
      if (s?.success) setStats(s.data);
    } catch (e) {
      setBanner({ kind: 'error', text: 'Could not load reminders. Try again.' });
    } finally {
      setLoading(false);
    }
  }, [view, search]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setGenerating(true);
    setBanner(null);
    try {
      // 400 days rather than the default 45: a workshop whose service history
      // is recent has nothing due inside six weeks, and an empty list looks
      // like a broken feature rather than an accurate one.
      const res = await api.post('/crm/reminders/generate', { horizon_days: 400 });
      if (res?.success) {
        const d = res.data || {};
        setBanner({
          kind: d.created ? 'ok' : 'info',
          text: d.created
            ? `${d.created} reminder${d.created === 1 ? '' : 's'} added from ${d.vehicles_considered} vehicles.`
            : `Nothing new — all ${d.vehicles_considered} vehicles already have their reminders.`,
        });
        load();
      }
    } catch (e) {
      setBanner({ kind: 'error', text: 'Could not generate reminders.' });
    } finally {
      setGenerating(false);
    }
  }

  async function send(row) {
    setBusyId(row.id);
    setBanner(null);
    try {
      const res = await api.post(`/crm/reminders/${row.id}/send`);
      setBanner({
        kind: res?.success ? 'ok' : 'error',
        text: res?.message || 'Sent.',
      });
      load();
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message || 'Could not send that reminder.' });
    } finally {
      setBusyId(null);
    }
  }

  async function patch(row, body, okText) {
    setBusyId(row.id);
    try {
      const res = await api.patch(`/crm/reminders/${row.id}`, body);
      if (res?.success) setBanner({ kind: 'ok', text: okText });
      load();
    } catch (e) {
      setBanner({ kind: 'error', text: 'Could not update that reminder.' });
    } finally {
      setBusyId(null);
    }
  }

  const T = stats?.totals || {};

  const cards = [
    { key: 'due_now',  label: 'Due now',       value: T.due_now,  Icon: Bell,      accent: '#B77900' },
    { key: 'overdue',  label: 'Overdue',       value: T.overdue,  Icon: WarningTriangle, accent: '#B3341F' },
    { key: 'upcoming', label: 'Upcoming',      value: T.upcoming, Icon: Calendar,  accent: '#4C5C64' },
    { key: 'sent',     label: 'Awaiting reply', value: T.awaiting_reply, Icon: Send, accent: '#2E5E7E' },
    { key: 'won',      label: 'Booked',        value: T.won,      Icon: CheckCircle, accent: '#1C6B52',
      sub: T.sent_total > 0 ? `${T.conversion_rate}% of sent` : null },
  ];

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">{t('common.service_reminders', 'Service Reminders')}</h1>
          <p className="page-subheading">
            Cars due for service, and whether the reminder brought them back
          </p>
        </div>
        <button className="btn-primary-action" onClick={generate} disabled={generating}>
          <Refresh width={16} height={16} />
          {generating ? 'Working…' : 'Find due services'}
        </button>
      </div>

      {banner && (
        <div
          role="status"
          style={{
            margin: '0 0 16px', padding: '10px 14px', borderRadius: 8, fontSize: 14,
            border: '1px solid',
            borderColor: banner.kind === 'error' ? '#B3341F' : banner.kind === 'ok' ? '#1C6B52' : '#B77900',
            background: banner.kind === 'error' ? '#FDECEA' : banner.kind === 'ok' ? '#E7F0EB' : '#FDF2D6',
            color: banner.kind === 'error' ? '#8C2818' : banner.kind === 'ok' ? '#14503D' : '#7A5200',
          }}
        >
          {banner.text}
        </div>
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
              {c.sub && <p style={{ fontSize: 11, color: '#8A8A8A', margin: 0 }}>{c.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIEWS.map(v => (
            <button
              key={v.key || 'all'}
              onClick={() => setView(v.key)}
              className={view === v.key ? 'btn-sm-primary' : 'btn-sm-outline'}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search
            width={16} height={16}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9aa0aa' }}
          />
          <input
            className="form-control"
            style={{ paddingInlineStart: 32 }}
            placeholder="Search name, phone or plate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>Service</th>
              <th>Due</th>
              <th>Channel</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="empty-col">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <Bell className="empty-icon" width={40} height={40} />
                    {/* An empty "Due now" tab while dozens sit under Upcoming reads
                        as a broken feature. Say where they are, and offer the jump. */}
                    {view === 'due' && Number(T.upcoming) > 0 ? (
                      <>
                        <p>Nothing due today — and that is the point of getting ahead of it.</p>
                        <p>
                          <strong>{Number(T.upcoming)}</strong> reminder{Number(T.upcoming) === 1 ? '' : 's'} scheduled
                          for later.
                        </p>
                        <button className="btn-sm-primary" onClick={() => setView('upcoming')}>
                          See what is coming
                        </button>
                      </>
                    ) : Number(T.total) === 0 ? (
                      <p>
                        Nothing yet. Press <strong>Find due services</strong> to work out which cars
                        are due, from the last job on each vehicle.
                      </p>
                    ) : (
                      <p>No reminders in this view.</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : rows.map(r => {
              const meta = STATUS_META[r.status] || STATUS_META.scheduled;
              const ChannelIcon = CHANNEL_ICON[r.send_channel] || ChatBubble;
              const overdue = Number(r.is_overdue) === 1;
              const busy = busyId === r.id;
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.customer_name || '—'}</strong>
                    <div style={{ fontSize: 12, color: '#7d8494' }}>{r.customer_phone || r.customer_email || ''}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Car width={14} height={14} style={{ color: '#9aa0aa', flex: 'none' }} />
                      <span>{[r.make, r.model].filter(Boolean).join(' ') || '—'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#7d8494' }}>
                      {r.plate_number || ''}
                      {r.vehicle_mileage ? ` · ${Number(r.vehicle_mileage).toLocaleString()} km` : ''}
                    </div>
                  </td>
                  <td>
                    {SERVICE_LABELS[r.service_type] || r.service_type?.replace(/_/g, ' ')}
                    {r.due_mileage && (
                      <div style={{ fontSize: 12, color: '#7d8494' }}>
                        or {Number(r.due_mileage).toLocaleString()} km
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: overdue ? '#B3341F' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                      {String(r.due_at || '').slice(0, 10)}
                    </span>
                    {r.days_until_due !== null && r.days_until_due !== undefined && (
                      <div style={{ fontSize: 12, color: overdue ? '#B3341F' : '#7d8494' }}>
                        {Number(r.days_until_due) < 0
                          ? `${Math.abs(r.days_until_due)} days late`
                          : Number(r.days_until_due) === 0 ? 'today' : `in ${r.days_until_due} days`}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                      <ChannelIcon width={14} height={14} style={{ color: '#7d8494' }} />
                      {r.send_channel}
                    </span>
                  </td>
                  <td>
                    <span className="status-badge" style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {['scheduled', 'due', 'snoozed'].includes(r.status) && (
                      <button className="btn-sm-primary" disabled={busy} onClick={() => send(r)}>
                        <Send width={13} height={13} /> {busy ? '…' : 'Send'}
                      </button>
                    )}
                    {r.status === 'sent' && (
                      <button className="btn-sm-primary" disabled={busy}
                        onClick={() => patch(r, { status: 'booked' }, 'Marked as booked.')}>
                        <CheckCircle width={13} height={13} /> Booked
                      </button>
                    )}
                    {!['dismissed', 'expired', 'converted'].includes(r.status) && (
                      <>
                        <button className="btn-sm-outline" disabled={busy}
                          onClick={() => patch(r, { snooze_days: 30 }, 'Snoozed for 30 days.')}
                          title="Snooze 30 days">
                          <Clock width={13} height={13} />
                        </button>
                        <button className="btn-sm-danger" disabled={busy}
                          onClick={() => patch(r, { status: 'dismissed' }, 'Dismissed.')}
                          title="Dismiss">
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

      {stats?.by_type?.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7d8494' }}>
            By service
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {stats.by_type.map(x => (
              <span key={x.service_type} className="status-badge"
                style={{ background: '#F4F6FA', color: NAVY, fontWeight: 500 }}>
                {SERVICE_LABELS[x.service_type] || x.service_type}
                {' · '}{x.total}
                {Number(x.due_now) > 0 && <strong style={{ color: '#B77900' }}> · {x.due_now} due</strong>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
