import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StatsUpSquare, EmojiSatisfied, Flash, WarningTriangle, Xmark, Link as LinkIcon,
  Copy, CheckCircle, Search, Refresh, MessageText, Building, Wrench, QrCode,
} from 'iconoir-react';
import api from '../lib/api';

/**
 * Customer Feedback — CES / NPS / CSAT analysis.
 *
 * Every survey response lands here with its scores already derived, plus the
 * three headline metrics the business asked for. The survey itself is the
 * public page at /survey; this is where the results are read.
 *
 * Two things are deliberately prominent:
 *   - the NPS split, because a bare NPS number hides whether it moved because
 *     promoters grew or detractors shrank;
 *   - the follow-up queue, because a detractor or an unresolved job is only
 *     worth collecting if somebody actually calls the customer back.
 */

const NAVY   = '#1e3a6b';
const TEAL   = '#0d6273';
const GREEN  = '#16a34a';
const AMBER  = '#d97706';
const RED    = '#dc2626';

const CATEGORY = {
  promoter:  { label: 'Promoter',  color: GREEN, bg: '#dcfce7' },
  passive:   { label: 'Passive',   color: AMBER, bg: '#fef3c7' },
  detractor: { label: 'Detractor', color: RED,   bg: '#fee2e2' },
};

const RESOLUTION = {
  yes:       { label: 'Resolved',  color: GREEN },
  partially: { label: 'Partially', color: AMBER },
  no:        { label: 'Not resolved', color: RED },
};

const fmtDate = (d) => d
  ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

/** NPS runs -100..100, so it needs its own banding rather than a 1-5 scale. */
function npsColor(nps) {
  if (nps === null || nps === undefined) return '#94a3b8';
  if (nps >= 50) return GREEN;
  if (nps >= 0)  return AMBER;
  return RED;
}
/** CES and CSAT are both 1-5, where 4+ is the accepted "good" threshold. */
function scoreColor(v) {
  if (v === null || v === undefined) return '#94a3b8';
  if (v >= 4)   return GREEN;
  if (v >= 3)   return AMBER;
  return RED;
}

function KPICard({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', flex: 1, minWidth: 150,
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderTop: `3px solid ${color}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Icon width={18} height={18} color={color} strokeWidth={1.8} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#1e293b', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, subtitle, right, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      padding: '16px 18px', marginBottom: 18 }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 14.5, fontWeight: 800, color: NAVY, margin: 0 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Horizontal bar used for both the per-question averages and the NPS split. */
function Bar({ label, value, max, display, color, note }) {
  const pct = max ? Math.max(0, Math.min(100, (Number(value) / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.35 }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color, whiteSpace: 'nowrap' }}>
          {display}{note && <span style={{ color: '#94a3b8', fontWeight: 500 }}> {note}</span>}
        </span>
      </div>
      <div style={{ height: 7, background: '#eef2f5', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

export default function CustomerFeedback() {
  const [stats, setStats]     = useState(null);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filters, setFilters] = useState({ from: '', to: '', branch: '', category: '', flagged: '' });
  const [search, setSearch]   = useState('');
  const [detail, setDetail]   = useState(null);
  const [inviteLink, setLink] = useState(null);
  const [copied, setCopied]   = useState(false);
  const [compose, setCompose] = useState(null);
  const [creating, setCreating] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, l] = await Promise.all([
        api.get(`/customer-survey/stats${qs ? `?${qs}` : ''}`),
        api.get(`/customer-survey?limit=100${qs ? `&${qs}` : ''}`),
      ]);
      if (s.success) setStats(s.data);
      else setError(s.message || 'Could not load the feedback analysis');
      if (l.success) setRows(l.data || []);
    } catch {
      setError('Network error loading feedback');
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  // Client-side text search over the already-fetched page: the server filters
  // by date / branch / category, this narrows what is on screen.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.contact_name, r.contact_phone, r.branch, r.service_requested, r.nps_reason, r.work_order_number]
        .some(v => v && String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  async function createLink(e) {
    e?.preventDefault();
    setError('');
    if (!compose?.contact_name?.trim() && !compose?.contact_phone?.trim()) {
      setError('Enter a customer name or mobile number so the response can be attributed.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/customer-survey/invites', {
        channel: compose.channel || 'whatsapp',
        contact_name: compose.contact_name?.trim() || undefined,
        contact_phone: compose.contact_phone?.trim() || undefined,
        branch: compose.branch?.trim() || undefined,
      });
      if (res.success) {
        setLink(`${window.location.origin}${res.data.path}`);
        setCopied(false);
        setCompose(null);
      } else {
        setError(res.message || 'Could not create a survey link');
      }
    } catch {
      setError('Network error creating the survey link');
    } finally {
      setCreating(false);
    }
  }

  async function openDetail(id) {
    try {
      const res = await api.get(`/customer-survey/${id}`);
      if (res.success) setDetail(res.data);
      else setError(res.message || 'Could not load that response');
    } catch { setError('Could not load that response'); }
  }

  async function markFollowedUp(id) {
    try {
      const res = await api.patch(`/customer-survey/${id}/follow-up`, {});
      if (!res.success) { setError(res.message || 'Could not record the follow-up'); return; }
      setDetail(null);
      load();
    } catch {
      setError('Network error recording the follow-up');
    }
  }

  const h  = stats?.headline || {};
  const nb = stats?.npsBreakdown || {};
  const rz = stats?.resolution || {};

  const publicSurveyUrl = `${window.location.origin}/survey`;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>Customer Feedback</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>
            CES, NPS and CSAT from the customer survey — every response and what it scores
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={load} style={st.ghostBtn}><Refresh width={15} height={15} /> Refresh</button>
          <button
            onClick={() => { setLink(`${window.location.origin}/survey`); setCopied(false); }}
            style={st.ghostBtn}
          >
            <QrCode width={15} height={15} /> Public link / QR
          </button>
          <button
            onClick={() => setCompose({ contact_name: '', contact_phone: '', branch: '', channel: 'whatsapp' })}
            style={st.primaryBtn}
          >
            <LinkIcon width={15} height={15} /> Send to a customer
          </button>
        </div>
      </div>

      {error && (
        <div style={st.errorBar}>
          <WarningTriangle width={16} height={16} /> {error}
          <button onClick={() => setError('')} style={st.barClose}><Xmark width={14} height={14} /></button>
        </div>
      )}

      {inviteLink && (
        <div style={st.linkBar}>
          <CheckCircle width={16} height={16} color={GREEN} />
          <span style={{ fontWeight: 600 }}>Survey link ready:</span>
          <code style={st.code}>{inviteLink}</code>
          <button
            onClick={() => { navigator.clipboard?.writeText(inviteLink); setCopied(true); }}
            style={st.ghostBtn}
          >
            <Copy width={14} height={14} /> {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={() => setLink(null)} style={st.barClose}><Xmark width={14} height={14} /></button>
        </div>
      )}

      {/* ── Headline scores ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <KPICard
          icon={StatsUpSquare}
          label="Net Promoter Score"
          value={h.nps === null || h.nps === undefined ? '—' : h.nps}
          sub={`from ${h.npsScored || 0} scored · range −100 to +100`}
          color={npsColor(h.nps)}
        />
        <KPICard
          icon={EmojiSatisfied}
          label="CSAT average"
          value={h.csatAvg ? `${h.csatAvg} / 5` : '—'}
          sub={`${h.csatPercent || 0}% rated 4 or 5`}
          color={scoreColor(h.csatAvg)}
        />
        <KPICard
          icon={Flash}
          label="Customer Effort Score"
          value={h.cesAvg ? `${h.cesAvg} / 5` : '—'}
          sub={`${h.cesEasyPercent || 0}% found us easy`}
          color={scoreColor(h.cesAvg)}
        />
        <KPICard
          icon={CheckCircle}
          label="Fully resolved"
          value={`${rz.resolvedPercent || 0}%`}
          sub={`${rz.partially || 0} partially · ${rz.no || 0} not resolved`}
          color={scoreColor((rz.resolvedPercent || 0) / 20)}
        />
        <KPICard
          icon={WarningTriangle}
          label="Needs follow-up"
          value={h.needsFollowUp || 0}
          sub="Detractors & unresolved jobs"
          color={Number(h.needsFollowUp) > 0 ? RED : '#94a3b8'}
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={st.field}>
            <span style={st.fieldLabel}>From</span>
            <input type="date" value={filters.from} style={st.input}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          </label>
          <label style={st.field}>
            <span style={st.fieldLabel}>To</span>
            <input type="date" value={filters.to} style={st.input}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </label>
          <label style={st.field}>
            <span style={st.fieldLabel}>Branch</span>
            <select value={filters.branch} style={st.input}
              onChange={e => setFilters(f => ({ ...f, branch: e.target.value }))}>
              <option value="">All branches</option>
              {(stats?.byBranch || []).map(b => (
                <option key={b.branch} value={b.branch === 'Unspecified' ? '' : b.branch}>{b.branch}</option>
              ))}
            </select>
          </label>
          <label style={st.field}>
            <span style={st.fieldLabel}>Category</span>
            <select value={filters.category} style={st.input}
              onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
              <option value="">All</option>
              <option value="promoter">Promoters</option>
              <option value="passive">Passives</option>
              <option value="detractor">Detractors</option>
            </select>
          </label>
          <button
            onClick={() => setFilters(f => ({ ...f, flagged: f.flagged === '1' ? '' : '1' }))}
            style={filters.flagged === '1' ? st.toggleOn : st.toggleOff}
          >
            <WarningTriangle width={14} height={14} /> Needs follow-up only
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', minWidth: 210 }}>
            <Search width={15} height={15} color="#94a3b8"
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              placeholder="Search name, phone, comment…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...st.input, width: '100%', paddingLeft: 34, boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </Card>

      {loading && <Card><div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div></Card>}

      {!loading && stats && (
        <>
          {/* ── NPS split ────────────────────────────────────────────── */}
          <Card
            title="NPS breakdown"
            subtitle="Promoters 9–10 · Passives 7–8 · Detractors 0–6. NPS = % promoters − % detractors"
          >
            {h.npsScored ? (
              <>
                <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  {[
                    ['promoter', nb.promoterPct, nb.promoters],
                    ['passive', nb.passivePct, nb.passives],
                    ['detractor', nb.detractorPct, nb.detractors],
                  ].map(([k, pct, n]) => pct > 0 && (
                    <div key={k} title={`${CATEGORY[k].label}: ${n} (${pct}%)`}
                      style={{ width: `${pct}%`, background: CATEGORY[k].color, color: '#fff',
                        fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
                        justifyContent: 'center' }}>
                      {pct >= 8 ? `${pct}%` : ''}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {['promoter', 'passive', 'detractor'].map(k => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORY[k].color }} />
                      <span style={{ color: '#475569' }}>{CATEGORY[k].label}</span>
                      <strong style={{ color: '#1e293b' }}>{nb[`${k}s`] ?? 0}</strong>
                      <span style={{ color: '#94a3b8' }}>({nb[`${k}Pct`] ?? 0}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <div style={st.empty}>No scored responses in this period yet.</div>}
          </Card>

          {/* ── Per-question averages ────────────────────────────────── */}
          <Card title="Score by question" subtitle="Average out of 5 — the lowest bars are where to look first">
            {h.responses ? (stats.questions || []).map(q => (
              <Bar
                key={q.key}
                label={`[${q.section}] ${q.label}`}
                value={q.avg}
                max={5}
                display={q.avg === null ? '—' : `${q.avg} / 5`}
                color={scoreColor(q.avg)}
              />
            )) : <div style={st.empty}>No responses in this period yet.</div>}
          </Card>

          {/* ── Branch / service breakdown ───────────────────────────── */}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 340px' }}>
              <Card title="By branch" subtitle="Where experience differs between locations">
                {(stats.byBranch || []).length ? (
                  <table style={st.table}>
                    <thead><tr>
                      <th style={st.th}><Building width={13} height={13} /> Branch</th>
                      <th style={st.thNum}>n</th><th style={st.thNum}>NPS</th><th style={st.thNum}>CSAT</th>
                    </tr></thead>
                    <tbody>
                      {stats.byBranch.map(b => (
                        <tr key={b.branch}>
                          <td style={st.td}>{b.branch}</td>
                          <td style={st.tdNum}>{b.responses}</td>
                          <td style={{ ...st.tdNum, color: npsColor(b.nps), fontWeight: 800 }}>
                            {b.nps === null ? '—' : b.nps}
                          </td>
                          <td style={{ ...st.tdNum, color: scoreColor(b.csat_avg), fontWeight: 700 }}>
                            {b.csat_avg ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={st.empty}>No data yet.</div>}
              </Card>
            </div>
            <div style={{ flex: '1 1 340px' }}>
              <Card title="By service" subtitle="Top 10 by response volume">
                {(stats.byService || []).length ? (
                  <table style={st.table}>
                    <thead><tr>
                      <th style={st.th}><Wrench width={13} height={13} /> Service</th>
                      <th style={st.thNum}>n</th><th style={st.thNum}>NPS</th><th style={st.thNum}>CSAT</th>
                    </tr></thead>
                    <tbody>
                      {stats.byService.map(s => (
                        <tr key={s.service}>
                          <td style={st.td}>{s.service}</td>
                          <td style={st.tdNum}>{s.responses}</td>
                          <td style={{ ...st.tdNum, color: npsColor(s.nps), fontWeight: 800 }}>
                            {s.nps === null ? '—' : s.nps}
                          </td>
                          <td style={{ ...st.tdNum, color: scoreColor(s.csat_avg), fontWeight: 700 }}>
                            {s.csat_avg ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={st.empty}>No data yet.</div>}
              </Card>
            </div>
          </div>

          {/* ── Trend ───────────────────────────────────────────────── */}
          {(stats.trend || []).length > 1 && (
            <Card title="Trend" subtitle="Last 12 months">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 4 }}>
                {stats.trend.map(m => {
                  // NPS spans -100..100; map onto a 0..100% column height.
                  const height = m.nps === null ? 0 : Math.max(2, ((m.nps + 100) / 200) * 100);
                  return (
                    <div key={m.month} style={{ minWidth: 54, textAlign: 'center' }}>
                      <div style={{ height: 92, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div
                          title={`NPS ${m.nps ?? '—'} · CSAT ${m.csat_avg ?? '—'} · ${m.responses} responses`}
                          style={{ width: 24, height: `${height}%`, background: npsColor(m.nps),
                            borderRadius: '5px 5px 0 0', minHeight: 3 }}
                        />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: npsColor(m.nps), marginTop: 5 }}>
                        {m.nps ?? '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.month?.slice(2)}</div>
                      <div style={{ fontSize: 9.5, color: '#cbd5e1' }}>n={m.responses}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Verbatims ───────────────────────────────────────────── */}
          <Card
            title="What customers said"
            subtitle="Reasons given for the NPS score — detractors first"
          >
            {(stats.verbatims || []).length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stats.verbatims.map(v => {
                  const c = CATEGORY[v.nps_category] || CATEGORY.passive;
                  return (
                    <div key={v.id} onClick={() => openDetail(v.id)}
                      style={{ border: '1px solid #e8edf1', borderLeft: `3px solid ${c.color}`,
                        borderRadius: 9, padding: '11px 13px', cursor: 'pointer', background: '#fcfdfe' }}>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ ...st.chip, background: c.bg, color: c.color }}>
                          {c.label} · {v.nps_score}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                          {v.contact_name || 'Anonymous'}
                        </span>
                        {v.branch && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>· {v.branch}</span>}
                        {v.service_requested && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>· {v.service_requested}</span>}
                        <span style={{ fontSize: 11.5, color: '#cbd5e1', marginLeft: 'auto' }}>{fmtDate(v.submitted_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                        <MessageText width={13} height={13} style={{ verticalAlign: -2, marginRight: 5, color: '#cbd5e1' }} />
                        {v.nps_reason}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={st.empty}>No written comments in this period yet.</div>}
          </Card>

          {/* ── All responses ───────────────────────────────────────── */}
          <Card
            title="All responses"
            subtitle={`${visible.length} shown${search ? ` of ${rows.length}` : ''}`}
          >
            {visible.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={st.table}>
                  <thead><tr>
                    <th style={st.th}>Customer</th>
                    <th style={st.th}>Branch / Service</th>
                    <th style={st.thNum}>NPS</th>
                    <th style={st.thNum}>CSAT</th>
                    <th style={st.thNum}>CES</th>
                    <th style={st.th}>Resolved</th>
                    <th style={st.th}>Received</th>
                    <th style={st.th}></th>
                  </tr></thead>
                  <tbody>
                    {visible.map(r => {
                      const c = CATEGORY[r.nps_category];
                      const rr = RESOLUTION[r.resolution];
                      // Coerce: is_flagged arrives as 0/1, and a bare 0 would render as "0".
                      const needsFollowUp = Boolean(r.is_flagged) && !r.followed_up_at;
                      return (
                        <tr key={r.id} style={needsFollowUp ? { background: '#fffbfa' } : undefined}>
                          <td style={st.td}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{r.contact_name || 'Anonymous'}</div>
                            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                              {r.contact_phone || (r.work_order_number ? r.work_order_number : '—')}
                            </div>
                          </td>
                          <td style={st.td}>
                            <div>{r.branch || '—'}</div>
                            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{r.service_requested || '—'}</div>
                          </td>
                          <td style={st.tdNum}>
                            {c ? <span style={{ ...st.chip, background: c.bg, color: c.color }}>{r.nps_score}</span> : '—'}
                          </td>
                          <td style={{ ...st.tdNum, color: scoreColor(r.csat_avg), fontWeight: 700 }}>{r.csat_avg ?? '—'}</td>
                          <td style={{ ...st.tdNum, color: scoreColor(r.ces_avg), fontWeight: 700 }}>{r.ces_avg ?? '—'}</td>
                          <td style={st.td}>
                            {rr ? <span style={{ color: rr.color, fontWeight: 600, fontSize: 12 }}>{rr.label}</span> : '—'}
                          </td>
                          <td style={{ ...st.td, whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>
                            {fmtDate(r.submitted_at)}
                          </td>
                          <td style={st.td}>
                            {needsFollowUp && (
                              <span style={{ ...st.chip, background: '#fee2e2', color: RED }}>Follow up</span>
                            )}
                            <button onClick={() => openDetail(r.id)} style={st.linkBtn}>View</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={st.empty}>
                No responses yet. Share the survey to start collecting:
                <code style={{ ...st.code, marginLeft: 8 }}>{publicSurveyUrl}</code>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Compose a personalised survey link ────────────────────────── */}
      {compose && (
        <div style={st.overlay} onClick={() => setCompose(null)}>
          <form style={{ ...st.modal, maxWidth: 460 }} onClick={e => e.stopPropagation()} onSubmit={createLink}>
            <div style={st.modalHead}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: NAVY }}>Send survey to a customer</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Creates a one-time link so the response is attributed to them
                </p>
              </div>
              <button type="button" onClick={() => setCompose(null)} style={st.barClose}>
                <Xmark width={16} height={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={st.field}>
                <span style={st.fieldLabel}>Customer name</span>
                <input
                  autoFocus
                  style={st.input}
                  value={compose.contact_name}
                  onChange={e => setCompose(c => ({ ...c, contact_name: e.target.value }))}
                  placeholder="e.g. Ahmed Al Mansouri"
                />
              </label>
              <label style={st.field}>
                <span style={st.fieldLabel}>Mobile number</span>
                <input
                  style={st.input}
                  value={compose.contact_phone}
                  onChange={e => setCompose(c => ({ ...c, contact_phone: e.target.value }))}
                  placeholder="+971 50 123 4567"
                />
              </label>
              <label style={st.field}>
                <span style={st.fieldLabel}>Branch</span>
                <input
                  style={st.input}
                  value={compose.branch}
                  onChange={e => setCompose(c => ({ ...c, branch: e.target.value }))}
                  placeholder="e.g. Dubai"
                />
              </label>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                A name or mobile number is required. The link expires in 30 days and can only be answered once.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="submit" style={st.primaryBtn} disabled={creating}>
                <LinkIcon width={15} height={15} /> {creating ? 'Creating…' : 'Create link'}
              </button>
              <button type="button" onClick={() => setCompose(null)} style={st.ghostBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Response detail ───────────────────────────────────────────── */}
      {detail && (
        <div style={st.overlay} onClick={() => setDetail(null)}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>
            <div style={st.modalHead}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: NAVY }}>
                  {detail.contact_name || 'Anonymous'}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  {[detail.work_order_number, detail.branch, detail.service_requested]
                    .filter(Boolean).join(' · ') || 'No visit details'} · {fmtDate(detail.submitted_at)}
                </p>
              </div>
              <button onClick={() => setDetail(null)} style={st.barClose}><Xmark width={16} height={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                ['NPS', detail.nps_score, npsColor(detail.nps_score >= 9 ? 60 : detail.nps_score >= 7 ? 10 : -40)],
                ['CSAT', detail.csat_avg ? `${detail.csat_avg}/5` : '—', scoreColor(detail.csat_avg)],
                ['CES', detail.ces_avg ? `${detail.ces_avg}/5` : '—', scoreColor(detail.ces_avg)],
              ].map(([l, v, col]) => (
                <div key={l} style={{ flex: 1, minWidth: 90, border: '1px solid #e8edf1', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.3 }}>{l}</div>
                  <div style={{ fontSize: 19, fontWeight: 900, color: col }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>

            {['CES', 'NPS', 'CSAT'].map(section => {
              const items = (detail.answers || []).filter(a => a.section === section);
              if (!items.length) return null;
              return (
                <div key={section} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: TEAL, letterSpacing: 0.5, marginBottom: 8 }}>
                    {section}
                  </div>
                  {items.map(a => (
                    <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 14,
                      padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12.5 }}>
                      <span style={{ color: '#475569', lineHeight: 1.4 }}>{a.label}</span>
                      <span style={{ fontWeight: 700, color: '#1e293b', whiteSpace: a.max ? 'nowrap' : 'normal',
                        textAlign: 'right', maxWidth: a.max ? undefined : '55%' }}>
                        {a.value === null || a.value === undefined || a.value === ''
                          ? '—'
                          : a.max ? `${a.value} / ${a.max}` : String(a.value)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            {detail.is_flagged === 1 && !detail.followed_up_at && (
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9,
                padding: '11px 13px', marginTop: 6 }}>
                <div style={{ fontSize: 12.5, color: '#9a3412', marginBottom: 9 }}>
                  Flagged for follow-up — a detractor score or a job that was not fully resolved.
                </div>
                <button onClick={() => markFollowedUp(detail.id)} style={st.primaryBtn}>
                  <CheckCircle width={15} height={15} /> Mark as followed up
                </button>
              </div>
            )}
            {detail.followed_up_at && (
              <div style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>
                <CheckCircle width={13} height={13} style={{ verticalAlign: -2 }} /> Followed up {fmtDate(detail.followed_up_at)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, background: NAVY, color: '#fff',
    border: 'none', borderRadius: 9, padding: '9px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  ghostBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#475569',
    border: '1px solid #dbe3ea', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: NAVY, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', padding: '2px 6px', textDecoration: 'underline' },
  toggleOn: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fee2e2', color: RED,
    border: '1px solid #fca5a5', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' },
  toggleOff: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: '#64748b',
    border: '1px solid #dbe3ea', borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' },
  errorBar: { display: 'flex', alignItems: 'center', gap: 9, background: '#fef2f2', border: '1px solid #fecaca',
    color: '#b91c1c', borderRadius: 10, padding: '11px 14px', fontSize: 13, marginBottom: 16 },
  linkBar: { display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', border: '1px solid #bbf7d0',
    color: '#166534', borderRadius: 10, padding: '11px 14px', fontSize: 13, marginBottom: 16, flexWrap: 'wrap' },
  barClose: { marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.7 },
  code: { background: '#fff', border: '1px solid #d7e3da', borderRadius: 6, padding: '3px 8px',
    fontSize: 12, fontFamily: 'ui-monospace, monospace', color: '#334155', wordBreak: 'break-all' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 11.5, fontWeight: 700, color: '#64748b' },
  input: { border: '1px solid #dbe3ea', borderRadius: 8, padding: '8px 11px', fontSize: 13, color: '#1e293b', background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 0.4, padding: '0 10px 9px', borderBottom: '1px solid #eef2f5', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase',
    letterSpacing: 0.4, padding: '0 10px 9px', borderBottom: '1px solid #eef2f5' },
  td: { padding: '10px', borderBottom: '1px solid #f4f7f9', color: '#334155', verticalAlign: 'middle' },
  tdNum: { padding: '10px', borderBottom: '1px solid #f4f7f9', textAlign: 'center', verticalAlign: 'middle' },
  chip: { display: 'inline-block', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800 },
  empty: { color: '#94a3b8', fontSize: 13, padding: '10px 0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999,
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' },
  modal: { background: '#fff', borderRadius: 16, padding: '20px 22px', width: '100%', maxWidth: 560,
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
};
