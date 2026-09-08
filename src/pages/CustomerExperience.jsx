import { useState, useEffect, useCallback } from 'react';
import {
  StarSolid, Check, User, SendMail, ClipboardCheck,
  WarningTriangle, Refresh, Phone, ChatBubble,
} from 'iconoir-react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import './Reports.css';
import './CustomerExperience.css';

/**
 * Customer Experience dashboard — KPI matrix category "Customer Experience"
 * (rows 36-37: NPS, survey response rate), widened to include the adjacent
 * rows that are genuinely about the customer's experience even though the
 * matrix filed them under "Customer & CRM": booking conversion and show-up
 * rate (row 1-3 — did their booking go smoothly), and repeat rate (row 4-5 —
 * did they come back). Contact channel volume (row 9) sits here too, since
 * it is which door the customer walked through, not an operational metric.
 *
 * Everything on this page reads from endpoints that already exist — nothing
 * new was added on the backend to build it. The one new piece of behaviour is
 * "Needs attention": survey_responses already tracks is_flagged/followed_up_at,
 * and PATCH /customer-survey/:id/follow-up already exists (Customer Feedback
 * uses it), but nothing surfaced that queue anywhere a person would act on it
 * in one sitting — this dashboard is where that happens.
 *
 * Complaints (KPI rows 7/8/10/11) are shown as a single "Coming soon" card
 * rather than omitted, so the page states plainly what it does not yet cover
 * instead of leaving a silent gap. They stay blocked on a category taxonomy
 * from GM Pioneer — nothing to build here without that.
 */

export default function CustomerExperience() {
  const { t } = useTranslation();

  const [range, setRange] = useState(() => {
    const iso = d => d.toISOString().slice(0, 10);
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    return { from: iso(from), to: iso(to) };
  });

  const [survey, setSurvey] = useState(null);
  const [booking, setBooking] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [attention, setAttention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null);
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `from=${range.from}&to=${range.to}`;
      const [s, b, c, ct, a] = await Promise.all([
        api.get(`/customer-survey/stats?${qs}`),
        api.get(`/appointments/stats?${qs}`),
        api.get(`/customers/stats?${qs}`),
        api.get(`/crm/customers/activities/stats?${qs}`),
        // Unresolved detractors and partial resolutions, most recent first —
        // the queue a person should actually clear, not every response ever.
        api.get(`/customer-survey?flagged=1&${qs}&limit=8`),
      ]);
      setSurvey(s.success ? s.data : null);
      setBooking(b.success ? b.data : null);
      setCustomer(c.success ? c.data.period : null);
      setContacts(ct.success ? ct.data : null);
      setAttention(a.success ? a.data : []);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  async function markFollowedUp(id) {
    setActioning(id);
    try {
      const res = await api.patch(`/customer-survey/${id}/follow-up`, {});
      if (res?.success) {
        setBanner({ kind: 'ok', text: t('cx.followup_ok') });
        setAttention(prev => (prev || []).filter(r => r.id !== id));
        // The headline card would otherwise sit one stale until the next
        // full reload — decrement it in step with the list it summarises.
        setSurvey(prev => prev && {
          ...prev,
          headline: { ...prev.headline, needsFollowUp: Math.max(0, (prev.headline.needsFollowUp || 0) - 1) },
        });
      } else {
        setBanner({ kind: 'error', text: res?.message || t('cx.followup_err') });
      }
    } catch (e) {
      setBanner({ kind: 'error', text: e?.message || t('cx.followup_err') });
    } finally {
      setActioning(null);
    }
  }

  const nps = survey?.headline?.nps;
  const csat = survey?.headline?.csatAvg;
  const ces = survey?.headline?.cesAvg;
  const responseRate = survey?.headline?.responseRate;
  const resolvedPct = survey?.resolution?.resolvedPercent;
  const needsFollowUp = survey?.headline?.needsFollowUp;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">{t('cx.title')}</h1>
          <p className="page-subheading">{t('cx.subtitle')}</p>
        </div>
      </div>

      {banner && (
        <div role="status" className={`cx-banner is-${banner.kind}`}>{banner.text}</div>
      )}

      <div className="rpt-controls-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            {t('reports.kpi.range_from')}
          </label>
          <input type="date" className="filter-date" value={range.from}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            {t('reports.kpi.range_to')}
          </label>
          <input type="date" className="filter-date" value={range.to}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
        </div>
        <button className="rpt-btn" onClick={load} disabled={loading}>
          <Refresh width={14} height={14} /> {t('reports.refresh')}
        </button>
      </div>

      {loading && !survey ? (
        <div className="rpt-loading">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-pulse" style={{ height: 120, borderRadius: 16 }} />)}
        </div>
      ) : (
        <>
          {/* ── Survey experience: rows 6, 36, 37 ─────────────────────── */}
          <h2 className="cx-section-title">{t('cx.section_survey')}</h2>
          <div className="rpt-kpi-grid" style={{ marginBottom: 24 }}>
            <KPI label={t('reports.kpi.nps')} value={nps != null ? (nps > 0 ? `+${nps}` : `${nps}`) : '—'}
              color="#22c55e" icon={StarSolid} />
            <KPI label={t('reports.kpi.csat')} value={csat != null ? `${csat}/5` : '—'}
              color="#f59e0b" icon={Check} />
            <KPI label={t('cx.ces')} value={ces != null ? `${ces}/5` : '—'}
              color="#0ea5e9" icon={Check} />
            <KPI label={t('reports.kpi.survey_response_rate')}
              value={responseRate != null ? `${responseRate}%` : '—'}
              sub={survey ? t('reports.kpi.invites_sent_count', { n: survey.headline.invitesSent }) : ''}
              color="#8b5cf6" icon={SendMail} />
            <KPI label={t('cx.resolved_pct')} value={resolvedPct != null ? `${resolvedPct}%` : '—'}
              color="#1e3a6b" icon={ClipboardCheck} />
            <KPI label={t('cx.needs_followup')} value={needsFollowUp ?? '—'}
              color={Number(needsFollowUp) > 0 ? '#ef4444' : '#22c55e'} icon={WarningTriangle} />
          </div>

          {/* ── Booking experience + loyalty: rows 1-3, 4-5 ───────────── */}
          <h2 className="cx-section-title">{t('cx.section_booking_loyalty')}</h2>
          <div className="rpt-kpi-grid" style={{ marginBottom: 24 }}>
            <KPI label={t('reports.kpi.booking_conversion')}
              value={booking?.totals?.conversion_rate_pct != null ? `${booking.totals.conversion_rate_pct}%` : '—'}
              sub={booking ? t('reports.kpi.confirmed_count', { n: booking.totals.confirmed }) : ''}
              color="#0ea5e9" icon={Check} />
            <KPI label={t('reports.kpi.show_up_rate')}
              value={booking?.totals?.show_up_rate_pct != null ? `${booking.totals.show_up_rate_pct}%` : '—'}
              color="#22c55e" icon={User} />
            <KPI label={t('reports.kpi.new_customers')} value={customer?.new_customers ?? '—'}
              sub={customer ? t('reports.kpi.of_customers_served', { n: customer.customers_served }) : ''}
              color="#f97316" icon={User} />
            <KPI label={t('reports.kpi.repeat_customer_rate')}
              value={customer?.repeat_rate_pct != null ? `${customer.repeat_rate_pct}%` : '—'}
              sub={customer ? t('reports.kpi.repeat_count', { n: customer.repeat_customers }) : ''}
              color="#8b5cf6" icon={User} />
          </div>

          <div className="rpt-chart-row" style={{ marginBottom: 24 }}>
            {/* ── Needs attention: the actual detractor follow-up queue ── */}
            <div className="rpt-table-card" style={{ flex: '1 1 380px' }}>
              <div className="rpt-chart-header"><h4>{t('cx.needs_attention_title')}</h4></div>
              {attention === null ? (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>{t('cx.loading')}</p>
              ) : attention.length === 0 ? (
                <div className="rpt-empty">
                  <p>{t('cx.needs_attention_empty')}</p>
                </div>
              ) : (
                <div className="cx-attention-list">
                  {attention.map(r => (
                    <div className="cx-attention-row" key={r.id}>
                      <div className="cx-attention-main">
                        <div className="cx-attention-name">
                          {r.contact_name || t('cx.anonymous')}
                          {r.nps_score != null && (
                            <span className={`cx-nps-chip cx-nps-${r.nps_category}`}>
                              {t('cx.nps_score_label')} {r.nps_score}
                            </span>
                          )}
                        </div>
                        {r.nps_reason && <div className="cx-attention-reason">"{r.nps_reason}"</div>}
                        <div className="cx-attention-meta">
                          {r.contact_phone && <span><Phone width={12} height={12} /> {r.contact_phone}</span>}
                          {r.resolution && r.resolution !== 'yes' && (
                            <span className="cx-unresolved-chip">
                              {r.resolution === 'no' ? t('cx.not_resolved') : t('cx.partially_resolved')}
                            </span>
                          )}
                        </div>
                      </div>
                      <button className="rpt-btn cx-followup-btn" disabled={actioning === r.id}
                        onClick={() => markFollowedUp(r.id)}>
                        <Check width={13} height={13} />
                        {actioning === r.id ? t('cx.saving') : t('cx.mark_followed_up')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Contact channels: row 9 ──────────────────────────────── */}
            <div className="rpt-table-card" style={{ flex: '1 1 260px' }}>
              <div className="rpt-chart-header"><h4>{t('reports.kpi.by_contact_channel_title')}</h4></div>
              {contacts?.by_channel?.length > 0 ? (
                <table className="od-items-table">
                  <thead>
                    <tr>
                      <th>{t('reports.kpi.col_channel')}</th>
                      <th>{t('reports.kpi.col_contacts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.by_channel.map(row => (
                      <tr key={row.channel}>
                        <td><ChatBubble width={13} height={13} style={{ marginRight: 6, color: '#94a3b8' }} />
                          {t(`reports.kpi.channel_${row.channel}`)}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="rpt-empty"><p>{t('reports.kpi.no_data')}</p></div>}
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, marginBottom: 0 }}>
                {t('reports.kpi.contact_channel_note')}
              </p>
            </div>
          </div>

          {/* ── Complaints: rows 7/8/10/11, explicitly not built yet ──── */}
          <div className="cx-coming-soon">
            <WarningTriangle width={20} height={20} style={{ color: '#b26a00', flex: 'none' }} />
            <div>
              <strong>{t('cx.complaints_title')}</strong>
              <p>{t('cx.complaints_note')}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const KPI = ({ label, value, sub, color, icon: Icon }) => (
  <div className="rpt-kpi-card">
    <div className="rpt-kpi-icon" style={{ background: color + '18', color }}>
      <Icon width={20} height={20} />
    </div>
    <div className="rpt-kpi-body">
      <div className="rpt-kpi-value">{value}</div>
      <div className="rpt-kpi-label">{label}</div>
      {sub && <div className="rpt-kpi-sub">{sub}</div>}
    </div>
  </div>
);
