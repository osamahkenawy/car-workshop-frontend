import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, User, SendMail, ClipboardCheck,
  WarningTriangle, Refresh, Phone, ChatBubble, Quote, Calendar, ArrowRight,
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
 * NPS gets a hero gauge instead of a plain stat card: it's the one number
 * this page exists to answer, and a bounded score reads better against a
 * "where does this sit" arc than as an isolated digit. The promoter/passive/
 * detractor split (npsBreakdown, already returned by /customer-survey/stats
 * but never rendered before) sits under it as the same story in more detail.
 *
 * Complaints (KPI rows 7/8/10/11) now read real data from /api/disputes/
 * stats — volume, ack SLA, resolution time — with a link through to the
 * full Complaints page. The one thing still missing is a categorised
 * breakdown, blocked on a category taxonomy from GM Pioneer; the note under
 * the card says so rather than the card pretending nothing is missing.
 */

/** -100..100 → a verdict band, each with its own colour, so the score reads
 *  with context rather than in isolation. Bands follow the informal NPS
 *  convention (below 0 poor, 0-30 good, 30-70 great, 70+ excellent) — not a
 *  regulatory scale, just a common enough read for a quick glance. */
function npsBand(v) {
  if (v == null) return { label: '', color: '#94a3b8', bg: '#f1f5f9' };
  if (v < 0) return { label: 'cx.band_needs_work', color: '#dc2626', bg: '#fdeeea' };
  if (v < 30) return { label: 'cx.band_good', color: '#d97706', bg: '#fdf2e0' };
  if (v < 70) return { label: 'cx.band_great', color: '#16a34a', bg: '#e7f3ec' };
  return { label: 'cx.band_excellent', color: '#0d9488', bg: '#e0f5f3' };
}

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx, cy, r, startDeg, endDeg) {
  const s = polar(cx, cy, r, endDeg);
  const e = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

/** A half-dome gauge for a -100..100 score: a thin zoned reference band
 *  (the same red/amber/green/teal bands npsBand uses) under a bold value
 *  arc that stops exactly at the score, with the number in the middle of
 *  the dome rather than bolted on beside it. */
function NpsGauge({ value }) {
  const size = 220, cx = size / 2, cy = size / 2 + 6, r = 86;
  const zones = [
    { from: -100, to: 0, color: '#dc2626' },
    { from: 0, to: 30, color: '#d97706' },
    { from: 30, to: 70, color: '#16a34a' },
    { from: 70, to: 100, color: '#0d9488' },
  ];
  const toAngle = v => -90 + ((v + 100) / 200) * 180;
  const band = npsBand(value);
  const valueAngle = value != null ? toAngle(Math.max(-100, Math.min(100, value))) : -90;

  return (
    <svg width={size} height={size / 2 + 34} viewBox={`0 0 ${size} ${size / 2 + 34}`} className="cx-gauge-svg">
      {zones.map(z => (
        <path key={z.from} d={arcPath(cx, cy, r, toAngle(z.from), toAngle(z.to))}
          stroke={z.color} strokeWidth={6} strokeLinecap="butt" fill="none" opacity={0.28} />
      ))}
      {value != null && (
        <path d={arcPath(cx, cy, r, -90, valueAngle)}
          stroke={band.color} strokeWidth={11} strokeLinecap="round" fill="none" className="cx-gauge-value-arc" />
      )}
      {value != null && (() => {
        const tip = polar(cx, cy, r, valueAngle);
        return <circle cx={tip.x} cy={tip.y} r={7} fill="#fff" stroke={band.color} strokeWidth={4} />;
      })()}
      <text x={cx} y={cy - 16} textAnchor="middle" className="cx-gauge-number">
        {value != null ? (value > 0 ? `+${value}` : value) : '—'}
      </text>
      <text x={cx} y={cy + 6} textAnchor="middle" className="cx-gauge-caption">NPS</text>
      <text x={20} y={cy + 22} textAnchor="start" className="cx-gauge-endlabel">-100</text>
      <text x={size - 20} y={cy + 22} textAnchor="end" className="cx-gauge-endlabel">+100</text>
    </svg>
  );
}

const fmtDaysAgo = (iso, t) => {
  if (!iso) return '';
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return t('cx.today');
  if (days === 1) return t('cx.yesterday');
  return t('cx.days_ago', { n: days });
};

const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2)
  .map(w => w[0]).join('').toUpperCase() || '?';

export default function CustomerExperience() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [range, setRange] = useState(() => {
    // Local calendar date, not toISOString()'s UTC one — in UAE (UTC+4)
    // that string still reads "yesterday" until 4am local, so "today"
    // silently dropped out of the default range for a third of every day.
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    return { from: iso(from), to: iso(to) };
  });

  const [survey, setSurvey] = useState(null);
  const [booking, setBooking] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [complaints, setComplaints] = useState(null);
  const [attention, setAttention] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null);
  const [resolving, setResolving] = useState(() => new Set());
  const [banner, setBanner] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = `from=${range.from}&to=${range.to}`;
      const [s, b, c, ct, a, cp] = await Promise.all([
        api.get(`/customer-survey/stats?${qs}`),
        api.get(`/appointments/stats?${qs}`),
        api.get(`/customers/stats?${qs}`),
        api.get(`/crm/customers/activities/stats?${qs}`),
        // Unresolved detractors and partial resolutions, most recent first —
        // the queue a person should actually clear, not every response ever.
        api.get(`/customer-survey?flagged=1&${qs}&limit=8`),
        api.get(`/disputes/stats?${qs}`),
      ]);
      setSurvey(s.success ? s.data : null);
      setBooking(b.success ? b.data : null);
      setCustomer(c.success ? c.data.period : null);
      setContacts(ct.success ? ct.data : null);
      setAttention(a.success ? a.data : []);
      setComplaints(cp.success ? cp.data : null);
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
        // Sit in a "resolved" state briefly before leaving the list — an
        // instant disappearance reads as the row breaking, not as done.
        setResolving(prev => new Set(prev).add(id));
        setTimeout(() => {
          setAttention(prev => (prev || []).filter(r => r.id !== id));
          setResolving(prev => { const n = new Set(prev); n.delete(id); return n; });
        }, 650);
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

  const h = survey?.headline || {};
  const npsBreakdown = survey?.npsBreakdown;
  const band = npsBand(h.nps);
  const resolvedPct = survey?.resolution?.resolvedPercent;

  return (
    <div className="page-container cx">
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">{t('cx.title')}</h1>
          <p className="page-subheading">{t('cx.subtitle')}</p>
        </div>
      </div>

      {banner && <div role="status" className={`cx-banner is-${banner.kind}`}>{banner.text}</div>}

      <div className="cx-controls">
        <div className="cx-daterange">
          <div className="cx-date-field">
            <Calendar width={15} height={15} className="cx-date-icon" />
            <div>
              <span className="cx-date-field-label">{t('reports.kpi.range_from')}</span>
              <input type="date" className="cx-date-input" value={range.from}
                onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
            </div>
          </div>
          <span className="cx-daterange-arrow">→</span>
          <div className="cx-date-field">
            <Calendar width={15} height={15} className="cx-date-icon" />
            <div>
              <span className="cx-date-field-label">{t('reports.kpi.range_to')}</span>
              <input type="date" className="cx-date-input" value={range.to}
                onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
            </div>
          </div>
        </div>
        <button className="cx-refresh-btn" onClick={load} disabled={loading}>
          <Refresh width={14} height={14} className={loading ? 'cx-spin' : ''} /> {t('reports.refresh')}
        </button>
      </div>

      {loading && !survey ? (
        <div className="rpt-loading">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton-pulse" style={{ height: 120, borderRadius: 16 }} />)}
        </div>
      ) : (
        <>
          {/* ── Hero: NPS gauge + promoter/passive/detractor split + vitals ── */}
          <div className="cx-hero">
            <div className="cx-hero-gauge" style={{ '--band-bg': band.bg, '--band-color': band.color }}>
              <NpsGauge value={h.nps} />
              {h.nps != null && (
                <div className="cx-band-pill" style={{ color: band.color, background: band.bg }}>
                  {t(band.label)}
                </div>
              )}
              {npsBreakdown && (
                <div className="cx-nps-split">
                  <div className="cx-nps-split-bar">
                    <span style={{ width: `${npsBreakdown.promoterPct}%`, background: '#16a34a' }} title="Promoters" />
                    <span style={{ width: `${npsBreakdown.passivePct}%`, background: '#d97706' }} title="Passives" />
                    <span style={{ width: `${npsBreakdown.detractorPct}%`, background: '#dc2626' }} title="Detractors" />
                  </div>
                  <div className="cx-nps-split-legend">
                    <span><i style={{ background: '#16a34a' }} />{t('cx.promoters')} {npsBreakdown.promoterPct}%</span>
                    <span><i style={{ background: '#d97706' }} />{t('cx.passives')} {npsBreakdown.passivePct}%</span>
                    <span><i style={{ background: '#dc2626' }} />{t('cx.detractors')} {npsBreakdown.detractorPct}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="cx-hero-vitals">
              <VitalCard icon={Check} color="#f59e0b" label={t('reports.kpi.csat')}
                value={h.csatAvg != null ? `${h.csatAvg}` : '—'} unit="/5" />
              <VitalCard icon={Check} color="#0ea5e9" label={t('cx.ces')}
                value={h.cesAvg != null ? `${h.cesAvg}` : '—'} unit="/5" />
              <VitalCard icon={SendMail} color="#8b5cf6" label={t('reports.kpi.survey_response_rate')}
                value={h.responseRate != null ? `${h.responseRate}` : '—'} unit="%"
                sub={survey ? t('reports.kpi.invites_sent_count', { n: h.invitesSent }) : ''} />
              <VitalCard icon={ClipboardCheck} color="#1e3a6b" label={t('cx.resolved_pct')}
                value={resolvedPct != null ? `${resolvedPct}` : '—'} unit="%" />
              <VitalCard icon={WarningTriangle} color={Number(h.needsFollowUp) > 0 ? '#dc2626' : '#16a34a'}
                label={t('cx.needs_followup')} value={h.needsFollowUp ?? '—'} unit=""
                pulse={Number(h.needsFollowUp) > 0} />
            </div>
          </div>

          {/* ── Needs attention: the actual follow-up queue ───────────────── */}
          <div className="cx-section-head cx-section-head--warm">
            <span className="cx-section-dot" />
            <h2>{t('cx.needs_attention_title')}</h2>
            {attention?.length > 0 && <span className="cx-section-count">{attention.length}</span>}
          </div>
          {attention === null ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>{t('cx.loading')}</p>
          ) : attention.length === 0 ? (
            <div className="cx-all-clear">
              <div className="cx-all-clear-icon"><Check width={26} height={26} /></div>
              <p>{t('cx.needs_attention_empty')}</p>
            </div>
          ) : (
            <div className="cx-attention-grid">
              {attention.map(r => {
                const sev = r.nps_category === 'detractor' ? 'red' : r.nps_category === 'passive' ? 'amber' : 'green';
                return (
                  <div key={r.id} className={`cx-ticket cx-ticket--${sev}${resolving.has(r.id) ? ' is-resolving' : ''}`}>
                    <div className="cx-ticket-top">
                      <div className="cx-avatar" style={{ background: `var(--cx-${sev}-tint)`, color: `var(--cx-${sev})` }}>
                        {initials(r.contact_name)}
                      </div>
                      <div className="cx-ticket-who">
                        <div className="cx-ticket-name">{r.contact_name || t('cx.anonymous')}</div>
                        <div className="cx-ticket-meta">
                          {r.contact_phone && <span><Phone width={11} height={11} /> {r.contact_phone}</span>}
                          <span><Calendar width={11} height={11} /> {fmtDaysAgo(r.submitted_at, t)}</span>
                        </div>
                      </div>
                      {r.nps_score != null && (
                        <div className="cx-score-badge" style={{ borderColor: `var(--cx-${sev})`, color: `var(--cx-${sev})` }}>
                          {r.nps_score}
                        </div>
                      )}
                    </div>

                    {r.nps_reason && (
                      <div className="cx-ticket-quote">
                        <Quote width={16} height={16} className="cx-quote-mark" />
                        <p>{r.nps_reason}</p>
                      </div>
                    )}

                    <div className="cx-ticket-bottom">
                      {r.resolution && r.resolution !== 'yes' && (
                        <span className="cx-resolution-chip">
                          {r.resolution === 'no' ? t('cx.not_resolved') : t('cx.partially_resolved')}
                        </span>
                      )}
                      <button className="cx-resolve-btn" disabled={actioning === r.id || resolving.has(r.id)}
                        onClick={() => markFollowedUp(r.id)}>
                        <Check width={13} height={13} />
                        {resolving.has(r.id) ? t('cx.followup_ok') : actioning === r.id ? t('cx.saving') : t('cx.mark_followed_up')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Booking experience + loyalty: rows 1-3, 4-5 ─────────────── */}
          <div className="cx-section-head cx-section-head--cool">
            <span className="cx-section-dot" />
            <h2>{t('cx.section_booking_loyalty')}</h2>
          </div>
          <div className="cx-cool-panel">
            <div className="cx-vitals-row">
              <VitalCard icon={Check} color="#0ea5e9" label={t('reports.kpi.booking_conversion')}
                value={booking?.totals?.conversion_rate_pct != null ? `${booking.totals.conversion_rate_pct}` : '—'} unit="%"
                sub={booking ? t('reports.kpi.confirmed_count', { n: booking.totals.confirmed }) : ''} />
              <VitalCard icon={User} color="#22c55e" label={t('reports.kpi.show_up_rate')}
                value={booking?.totals?.show_up_rate_pct != null ? `${booking.totals.show_up_rate_pct}` : '—'} unit="%" />
              <VitalCard icon={User} color="#f97316" label={t('reports.kpi.new_customers')}
                value={customer?.new_customers ?? '—'} unit=""
                sub={customer ? t('reports.kpi.of_customers_served', { n: customer.customers_served }) : ''} />
              <VitalCard icon={User} color="#8b5cf6" label={t('reports.kpi.repeat_customer_rate')}
                value={customer?.repeat_rate_pct != null ? `${customer.repeat_rate_pct}` : '—'} unit="%"
                sub={customer ? t('reports.kpi.repeat_count', { n: customer.repeat_customers }) : ''} />
            </div>
          </div>

          {/* ── Contact channels + complaints roadmap ───────────────────── */}
          <div className="cx-footer-row">
            <div className="cx-channel-card">
              <div className="cx-footer-card-head"><h4>{t('reports.kpi.by_contact_channel_title')}</h4></div>
              {contacts?.by_channel?.length > 0 ? (
                <div className="cx-channel-bars">
                  {(() => {
                    const max = Math.max(1, ...contacts.by_channel.map(row => row.count));
                    return contacts.by_channel.map(row => (
                      <div className="cx-channel-bar-row" key={row.channel}>
                        <span className="cx-channel-bar-label">
                          <ChatBubble width={13} height={13} /> {t(`reports.kpi.channel_${row.channel}`)}
                        </span>
                        <div className="cx-channel-bar-track">
                          <div className="cx-channel-bar-fill" style={{ width: `${(row.count / max) * 100}%` }} />
                        </div>
                        <span className="cx-channel-bar-count">{row.count}</span>
                      </div>
                    ));
                  })()}
                </div>
              ) : <div className="rpt-empty"><p>{t('reports.kpi.no_data')}</p></div>}
              <p className="cx-footnote">{t('reports.kpi.contact_channel_note')}</p>
            </div>

            <div className="cx-roadmap-card">
              <div className="cx-roadmap-card-head">
                <strong>{t('cx.complaints_title')}</strong>
                <button className="cx-roadmap-link" onClick={() => navigate('/complaints')}>
                  {t('cx.view_complaints')} <ArrowRight width={13} height={13} />
                </button>
              </div>
              {complaints?.headline ? (
                <>
                  <div className="cx-mini-vitals">
                    <div className="cx-mini-vital">
                      <span className="cx-mini-vital-value" style={{ color: complaints.headline.stillOpen > 0 ? '#dc2626' : '#16a34a' }}>
                        {complaints.headline.stillOpen}
                      </span>
                      <span className="cx-mini-vital-label">{t('cx.complaints_still_open')}</span>
                    </div>
                    <div className="cx-mini-vital">
                      <span className="cx-mini-vital-value">{complaints.headline.ackSlaPct != null ? `${complaints.headline.ackSlaPct}%` : '—'}</span>
                      <span className="cx-mini-vital-label">{t('cx.complaints_ack_sla')}</span>
                    </div>
                    <div className="cx-mini-vital">
                      <span className="cx-mini-vital-value">{complaints.headline.avgResolutionDays != null ? `${complaints.headline.avgResolutionDays}d` : '—'}</span>
                      <span className="cx-mini-vital-label">{t('cx.complaints_avg_resolution')}</span>
                    </div>
                  </div>
                  <p className="cx-footnote">{t('cx.complaints_note')}</p>
                </>
              ) : <p>{t('cx.complaints_note')}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const VitalCard = ({ icon: Icon, color, label, value, unit, sub, pulse }) => (
  <div className={`cx-vital${pulse ? ' cx-vital--pulse' : ''}`}>
    <div className="cx-vital-icon" style={{ background: color + '18', color }}>
      <Icon width={18} height={18} />
    </div>
    <div className="cx-vital-body">
      <div className="cx-vital-value">{value}<span className="cx-vital-unit">{unit}</span></div>
      <div className="cx-vital-label">{label}</div>
      {sub && <div className="cx-vital-sub">{sub}</div>}
    </div>
  </div>
);
