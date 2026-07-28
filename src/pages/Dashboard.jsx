import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Loader, { DashboardSkeleton } from '../components/Loader';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { 
  Package, DeliveryTruck, Check, WarningTriangle, DollarCircle,
  Clock, MapPin, StatUp, StatDown, ArrowRight, Plus, Activity,
  Timer, Wallet, Refresh, CreditCard, Settings, Wrench
} from 'iconoir-react';
import { AuthContext } from '../context/AuthContext';
import api from '../lib/api';
import { fmtCurrency } from '../utils/currency';
import './Dashboard.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const AUTO_REFRESH_MS = 30000; // 30 seconds

const WIDGET_DEFS = [
  { key: 'metrics',      label: 'dashboard.widgets.metrics' },
  { key: 'cod',          label: 'dashboard.widgets.cod' },
  { key: 'charts',       label: 'dashboard.widgets.charts' },
  { key: 'hourly',       label: 'dashboard.widgets.hourly' },
  { key: 'mechanics_util', label: 'dashboard.widgets.mechanics_util' },
  { key: 'service_bays',        label: 'dashboard.widgets.service_bays' },
  { key: 'mechanics',      label: 'dashboard.widgets.mechanics' },
  { key: 'recent',       label: 'dashboard.widgets.recent' },
];
const DEFAULT_VISIBLE = () => WIDGET_DEFS.reduce((acc, w) => ({ ...acc, [w.key]: true }), {});
const STORAGE_KEY = 'dashboard_widgets';
const loadWidgets = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_VISIBLE(); } catch { return DEFAULT_VISIBLE(); } };

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState({});
  const [chart, setChart] = useState([]);
  const [topServiceBays, setTopServiceBays] = useState([]);
  const [topMechanics, setTopMechanics] = useState([]);
  const [recentWorkOrders, setRecentWorkOrders] = useState([]);
  const [mechanicUtil, setMechanicUtil] = useState([]);
  const [mechanicWorkload, setMechanicWorkload] = useState([]);
  const [ordersByHour, setWorkOrdersByHour] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [widgetVis, setWidgetVis] = useState(loadWidgets);
  const [showWidgetPanel, setShowWidgetPanel] = useState(false);
  const { user, workshop } = useContext(AuthContext);
  const refreshTimer = useRef(null);

  const toggleWidget = (key) => {
    setWidgetVis(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const fetchStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/stats');
      if (res.success) {
        setStats(res.data?.kpis || {});
        setChart(res.data?.daily_chart || []);
        setTopServiceBays(res.data?.top_zones || []);
        setTopMechanics(res.data?.top_mechanics || []);
        setRecentWorkOrders(res.data?.recent_orders || []);
        setMechanicUtil(res.data?.mechanic_utilization || []);
        setMechanicWorkload(res.data?.mechanic_workload || []);
        setWorkOrdersByHour(res.data?.orders_by_hour || []);
        setLastRefreshed(new Date());
      }
    } catch (e) {
      console.error('Stats error:', e);
    } finally {
      if (!silent) {
        setLoading(false);
        // After loading finishes and charts render, trigger resize for Chart.js
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      }
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 60000);
    // Trigger resize so Chart.js recalculates canvas size after CSS layout settles
    const resizeTimer = setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    return () => { clearInterval(clockTimer); clearTimeout(resizeTimer); };
  }, [fetchStats]);

  // Auto-refresh (#44)
  useEffect(() => {
    if (autoRefresh) {
      refreshTimer.current = setInterval(() => fetchStats(true), AUTO_REFRESH_MS);
    }
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [autoRefresh, fetchStats]);

  const getGreeting = () => {
    const h = currentTime.getHours();
    if (h >= 5 && h < 12) return t('dashboard.good_morning');
    if (h >= 12 && h < 17) return t('dashboard.good_afternoon');
    if (h >= 17 && h < 21) return t('dashboard.good_evening');
    return t('dashboard.good_night');
  };

  const formatTime = () => currentTime.toLocaleTimeString(i18n.language === 'ar' ? 'ar-AE' : 'en-AE', { hour: '2-digit', minute: '2-digit', hour12: true });
  const formatDate = () => currentTime.toLocaleDateString(i18n.language === 'ar' ? 'ar-AE' : 'en-AE', { weekday: 'long', month: 'long', day: 'numeric' });
  const cur = workshop?.currency || 'AED';
  const fmtAED = (v) => fmtCurrency(v, cur);
  const fmtMins = (m) => {
    if (!m || m <= 0) return '—';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${h}h ${r}m` : `${h}h`;
  };

  const DeltaBadge = ({ delta }) => {
    if (delta === undefined || delta === null) return null;
    const isUp = delta >= 0;
    return (
      <span className={`delta-badge ${isUp ? 'up' : 'down'}`}>
        {isUp ? <StatUp width={11} height={11} /> : <StatDown width={11} height={11} />}
        {Math.abs(delta)}% {t('dashboard.vs_yesterday')}
      </span>
    );
  };

  const lineData = {
    labels: chart.map(d => new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })),
    datasets: [
      {
        label: t('dashboard.chart_orders'),
        data: chart.map(d => d.orders || 0),
        borderColor: '#1e3a6b',
        backgroundColor: 'rgba(36,64,102,0.08)',
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#1e3a6b',
      },
      {
        label: t('dashboard.chart_delivered'),
        data: chart.map(d => d.delivered || 0),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true, tension: 0.4, pointRadius: 3,
        pointBackgroundColor: '#22c55e',
        borderDash: [5, 3],
      },
    ]
  };
  const lineOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } }, tooltip: { backgroundColor: '#1e3a6b', cornerRadius: 8, padding: 12 } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
      x: { grid: { display: false } }
    }
  };

  const statusData = {
    labels: [t('statuses.delivered'), t('statuses.in_transit'), t('statuses.pending'), t('statuses.failed')],
    datasets: [{
      data: [stats.delivered_today || 0, stats.active_orders || 0, stats.pending_orders || 0, stats.failed_today || 0],
      backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'],
      borderWidth: 0,
    }]
  };
  const doughnutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: '70%',
    plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 12 } } }
  };

  const statusLabel = (s) => t(`statuses.${s}`, s);
  const statusColor = (s) => {
    const map = { delivered: '#22c55e', failed: '#ef4444', returned: '#f97316', in_transit: '#3b82f6', assigned: '#8b5cf6', pending: '#d97706', picked_up: '#0ea5e9' };
    return map[s] || '#64748b';
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="dashboard">
      {/* Welcome Header */}
      <div className="dashboard-header">
        <div className="welcome-section">
          <div className="greeting-time">
            <Clock width={16} height={16} />
            <span>{formatTime()}</span>
            <span className="date-divider">&bull;</span>
            <span>{formatDate()}</span>
          </div>
          <h1>{getGreeting()}, {user?.full_name || user?.username}</h1>
          <p className="welcome-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className={`btn-auto-refresh ${autoRefresh ? 'active' : ''}`}
            onClick={() => setAutoRefresh(prev => !prev)}
            title={autoRefresh ? t('dashboard.auto_refresh_on') : t('dashboard.auto_refresh_off')}
          >
            <Refresh width={15} height={15} className={autoRefresh ? 'spin-slow' : ''} />
            {autoRefresh ? t('dashboard.live_label') : t('dashboard.paused_label')}
          </button>
          {lastRefreshed && (
            <span className="last-refreshed">
              {t('dashboard.updated')} {lastRefreshed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </span>
          )}
          <Link to="/work-orders" className="btn-primary">
            <Plus width={18} height={18} />
            {t('dashboard.new_order')}
          </Link>
          <div style={{ position: 'relative' }}>
            <button className="btn-auto-refresh" onClick={() => setShowWidgetPanel(v => !v)} title={t('dashboard.settings.customize_widgets')}>
              <Settings width={15} height={15} /> {t('dashboard.settings.customize_widgets')}
            </button>
            {showWidgetPanel && (
              <div className="widget-panel">
                <div className="widget-panel-header">
                  <strong>{t('dashboard.toggle_widgets')}</strong>
                  <button className="widget-panel-close" onClick={() => setShowWidgetPanel(false)}>&times;</button>
                </div>
                {WIDGET_DEFS.map(w => (
                  <label key={w.key} className="widget-panel-item">
                    <input type="checkbox" checked={!!widgetVis[w.key]} onChange={() => toggleWidget(w.key)} />
                    <span>{t(w.label)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Key Metrics Row — 6 cards now (#42 monthly revenue, #48 avg delivery time) */}
      {widgetVis.metrics && <div className="metrics-row">
        <div className="metric-card primary">
          <div className="metric-icon" style={{ background: 'rgba(242,66,27,0.1)', color: '#159fd9' }}>
            <Package width={24} height={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{stats.orders_today || 0}</span>
            <span className="metric-label">{t('dashboard.kpiCards.orders_today')}</span>
          </div>
          <DeltaBadge delta={stats.delta_orders} />
          <div className="metric-trend positive">
            <StatUp width={14} height={14} />
            <span>{t('dashboard.active_label')}: {stats.active_orders || 0}</span>
          </div>
        </div>

        <div className="metric-card success">
          <div className="metric-icon" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
            <Check width={24} height={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{stats.delivered_today || 0}</span>
            <span className="metric-label">{t('dashboard.kpiCards.completed_orders')}</span>
          </div>
          <DeltaBadge delta={stats.delta_delivered} />
          <div className="metric-trend positive">
            <StatUp width={14} height={14} />
            <span>{t('dashboard.rate_label')}: {stats.success_rate || 0}%</span>
          </div>
        </div>

        <div className="metric-card tertiary">
          <div className="metric-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
            <Wrench width={24} height={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{stats.available_mechanics || 0}<span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/{stats.total_mechanics || 0}</span></span>
            <span className="metric-label">{t('dashboard.kpiCards.active_mechanics')}</span>
          </div>
          <div className="metric-trend">
            <Activity width={14} height={14} />
            <span>{t('dashboard.pending_label')}: {stats.pending_orders || 0}</span>
          </div>
        </div>

        <div className="metric-card info">
          <div className="metric-icon" style={{ background: 'rgba(102,126,234,0.1)', color: '#667eea' }}>
            <Timer width={24} height={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{fmtMins(stats.avg_delivery_minutes)}</span>
            <span className="metric-label">{t('dashboard.kpiCards.delivery_time')}</span>
          </div>
          <div className="metric-trend">
            <Clock width={14} height={14} />
            <span>{t('dashboard.todays_avg')}</span>
          </div>
        </div>

        <div className="metric-card secondary">
          <div className="metric-icon" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
            <DollarCircle width={24} height={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value" style={{ fontSize: 17 }}>{fmtAED(stats.revenue_today)}</span>
            <span className="metric-label">{t('dashboard.kpiCards.revenue_today')}</span>
          </div>
          <DeltaBadge delta={stats.delta_revenue} />
        </div>

        <div className="metric-card accent">
          <div className="metric-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <Wallet width={24} height={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value" style={{ fontSize: 17 }}>{fmtAED(stats.revenue_month)}</span>
            <span className="metric-label">{t('dashboard.kpiCards.revenue_month')}</span>
          </div>
          <div className="metric-trend">
            <StatUp width={14} height={14} />
            <span>{t('dashboard.failed_count')}: {stats.failed_today || 0}</span>
          </div>
        </div>
      </div>}

      {/* COD Widget (#47) */}
      {widgetVis.cod && <div className="cod-widget-row">
        <div className="cod-widget">
          <div className="cod-widget-header">
            <CreditCard width={18} height={18} />
            <h3>{t('dashboard.widgets.cod')}</h3>
            <Link to="/cash-payments" className="view-all">{t('dashboard.reconcile')} <ArrowRight width={14} height={14} /></Link>
          </div>
          <div className="cod-widget-body">
            <div className="cod-stat">
              <span className="cod-stat-val outstanding">{fmtAED(stats.cod_outstanding)}</span>
              <span className="cod-stat-lbl">{t('dashboard.cod_outstanding')} ({stats.cod_outstanding_count || 0})</span>
            </div>
            <div className="cod-divider" />
            <div className="cod-stat">
              <span className="cod-stat-val settled">{fmtAED(stats.cod_settled_today)}</span>
              <span className="cod-stat-lbl">{t('dashboard.cod_settled_today')} ({stats.cod_settled_today_count || 0})</span>
            </div>
            <div className="cod-divider" />
            <div className="cod-stat">
              <span className="cod-stat-val month">{fmtAED(stats.cod_month_total)}</span>
              <span className="cod-stat-lbl">{t('dashboard.cod_this_month')}</span>
            </div>
          </div>
        </div>
      </div>}

      {/* Mechanic Utilization Widget (#52) */}
      {widgetVis.mechanics_util && <div className="mechanic-util-row">
        <div className="util-card">
          <div className="util-header">
            <DeliveryTruck width={18} height={18} />
            <h3>{t('dashboard.mechanic_utilization')}</h3>
          </div>
          <div className="util-body">
            {(() => {
              const statusMap = {};
              mechanicUtil.forEach(d => { statusMap[d.status] = d.count; });
              const total = Object.values(statusMap).reduce((a,b) => a + b, 0) || 1;
              const items = [
                { label: t('dashboard.available'), count: statusMap['available'] || 0, color: '#22c55e' },
                { label: t('dashboard.busy'), count: statusMap['busy'] || statusMap['on_delivery'] || 0, color: '#f97316' },
                { label: t('dashboard.offline'), count: statusMap['offline'] || statusMap['inactive'] || 0, color: '#94a3b8' },
              ];
              return items.map(item => (
                <div key={item.label} className="util-bar-row">
                  <span className="util-bar-label">{item.label}</span>
                  <div className="util-bar-track">
                    <div className="util-bar-fill" style={{ width: `${(item.count / total) * 100}%`, background: item.color }} />
                  </div>
                  <span className="util-bar-count" style={{ color: item.color }}>{item.count}</span>
                </div>
              ));
            })()}
          </div>
        </div>
        <div className="util-card">
          <div className="util-header">
            <Activity width={18} height={18} />
            <h3>{t('dashboard.todays_workload')}</h3>
          </div>
          <div className="util-body">
            {mechanicWorkload.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 16 }}>{t('dashboard.no_data_yet')}</p>
            ) : mechanicWorkload.slice(0, 6).map(d => (
              <div key={d.id} className="util-bar-row">
                <span className="util-bar-label">{d.full_name?.split(' ')[0]}</span>
                <div className="util-bar-track">
                  <div className="util-bar-fill" style={{
                    width: `${Math.min(100, (d.orders_today / Math.max(...mechanicWorkload.map(w => w.orders_today), 1)) * 100)}%`,
                    background: d.mechanic_status === 'available' ? '#22c55e' : '#f97316'
                  }} />
                </div>
                <span className="util-bar-count">{d.orders_today}</span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* Charts Row */}
      {widgetVis.charts && <div className="charts-row">
        <div className="chart-card sales-chart">
          <div className="chart-header">
            <div>
              <h3>{t('dashboard.orders_last_7_days')}</h3>
              <p>{t('dashboard.daily_volume_trend')}</p>
            </div>
          </div>
          <div className="chart-body">
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>

        <div className="chart-card pipeline-chart">
          <div className="chart-header">
            <div>
              <h3>{t('dashboard.order_status_breakdown')}</h3>
            </div>
          </div>
          <div className="chart-body">
            <Doughnut data={statusData} options={doughnutOptions} />
          </div>
          <div className="pipeline-total">
            <span className="total-label">{t('dashboard.total_today')}</span>
            <span className="total-value">{stats.orders_today || 0}</span>
          </div>
        </div>
      </div>}

      {/* WorkOrders by Hour (#56) */}
      {widgetVis.hourly && ordersByHour.some(h => h.orders > 0) && (
        <div className="chart-card" style={{ marginBottom: 24 }}>
          <div className="chart-header">
            <div>
              <h3><Activity width={20} height={20} /> {t('dashboard.todays_activity')}</h3>
              <p>{t('dashboard.order_distribution')}</p>
            </div>
          </div>
          <div className="chart-body">
            <Bar
              data={{
                labels: ordersByHour.map(h => h.label),
                datasets: [
                  {
                    label: t('dashboard.chart_orders'),
                    data: ordersByHour.map(h => h.orders),
                    backgroundColor: 'rgba(36, 64, 102, 0.75)',
                    borderRadius: 4,
                    borderSkipped: false,
                  },
                  {
                    label: t('dashboard.chart_delivered'),
                    data: ordersByHour.map(h => h.delivered),
                    backgroundColor: 'rgba(34, 197, 94, 0.75)',
                    borderRadius: 4,
                    borderSkipped: false,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
                  tooltip: {
                    callbacks: {
                      title: (ctx) => `${ctx[0].label}`,
                    },
                  },
                },
                scales: {
                  x: { grid: { display: false } },
                  y: { beginAtZero: true, ticks: { stepSize: 1 } },
                },
              }}
              height={220}
            />
          </div>
        </div>
      )}

      {/* Top ServiceBays, Top Mechanics, Recent WorkOrders */}
      {(widgetVis.service_bays || widgetVis.mechanics || widgetVis.recent) && (
      <div className="recent-data-row triple">
        {widgetVis.service_bays && (
        <div className="recent-card">
          <div className="card-header">
            <h3><MapPin width={20} height={20} /> {t('dashboard.top_zones')}</h3>
            <Link to="/service-bays" className="view-all">{t('dashboard.view_all')} <ArrowRight width={16} height={16} /></Link>
          </div>
          <div className="card-body">
            {topServiceBays.length === 0 ? (
              <div className="empty-state-mini">
                <MapPin width={32} height={32} />
                <p>{t('dashboard.no_zone_data')}</p>
              </div>
            ) : (
              <div className="recent-list">
                {topServiceBays.slice(0, 5).map((bay, i) => (
                  <div key={i} className="recent-item">
                    <div className="recent-avatar" style={{ background: '#1e3a6b' }}>
                      {i + 1}
                    </div>
                    <div className="recent-info">
                      <strong>{bay.name}</strong>
                      <span>{bay.bay_type ? bay.bay_type.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : bay.bay_number}</span>
                    </div>
                    <span className="status-badge" style={{ background: '#fff7ed', color: '#f97316' }}>
                      {bay.orders_count || 0} orders
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {widgetVis.mechanics && (
        <div className="recent-card">
          <div className="card-header">
            <h3><DeliveryTruck width={20} height={20} /> {t('dashboard.top_mechanics')}</h3>
            <Link to="/mechanics" className="view-all">{t('dashboard.view_all')} <ArrowRight width={16} height={16} /></Link>
          </div>
          <div className="card-body">
            {topMechanics.length === 0 ? (
              <div className="empty-state-mini">
                <DeliveryTruck width={32} height={32} />
                <p>{t('dashboard.no_mechanic_data')}</p>
              </div>
            ) : (
              <div className="recent-list">
                {topMechanics.slice(0, 5).map((mechanic, i) => (
                  <div key={i} className="recent-item">
                    <div className="recent-avatar">
                      {mechanic.full_name?.charAt(0)}
                    </div>
                    <div className="recent-info">
                      <strong>{mechanic.full_name}</strong>
                      <span>{mechanic.vehicle_type} &bull; {mechanic.vehicle_plate}</span>
                    </div>
                    <span className={`status-badge ${mechanic.status === 'available' ? 'active' : ''}`}
                      style={{ background: mechanic.status === 'available' ? '#f0fdf4' : '#f1f5f9',
                               color:  mechanic.status === 'available' ? '#16a34a' : '#64748b' }}>
                      {mechanic.total_deliveries || mechanic.deliveries || 0} delivs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Recent WorkOrders Feed (#53) */}
        {widgetVis.recent && (
        <div className="recent-card">
          <div className="card-header">
            <h3><Package width={20} height={20} /> {t('dashboard.recent_orders')}</h3>
            <Link to="/work-orders" className="view-all">{t('dashboard.view_all')} <ArrowRight width={16} height={16} /></Link>
          </div>
          <div className="card-body">
            {recentWorkOrders.length === 0 ? (
              <div className="empty-state-mini">
                <Package width={32} height={32} />
                <p>{t('dashboard.no_recent_orders')}</p>
              </div>
            ) : (
              <div className="recent-list">
                {recentWorkOrders.slice(0, 5).map((order) => (
                  <div key={order.id} className="recent-item">
                    <div className="recent-avatar" style={{ background: statusColor(order.status), fontSize: 10 }}>
                      {order.work_order_number?.slice(-3) || '#'}
                    </div>
                    <div className="recent-info">
                      <strong>{order.recipient_name}</strong>
                      <span>{order.mechanic_name || t('dashboard.unassigned')} &bull; {new Date(order.created_at).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </div>
                    <span className="status-badge" style={{ background: `${statusColor(order.status)}18`, color: statusColor(order.status) }}>
                      {statusLabel(order.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
      )}

      {/* Quick Actions */}
      <div className="quick-actions-section">
        <h3>{t('dashboard.quick_actions')}</h3>
        <div className="quick-actions-grid">
          <Link to="/work-orders" className="quick-action-card">
            <div className="quick-action-icon"><Package width={24} height={24} /></div>
            <span>{t('dashboard.new_order')}</span>
          </Link>
          <Link to="/mechanics" className="quick-action-card">
            <div className="quick-action-icon"><DeliveryTruck width={24} height={24} /></div>
            <span>{t('dashboard.add_mechanic')}</span>
          </Link>
          <Link to="/job-assignment" className="quick-action-card">
            <div className="quick-action-icon"><MapPin width={24} height={24} /></div>
            <span>{t('dashboard.job-assignment')}</span>
          </Link>
          <Link to="/service-tracking" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#e0f2fe' }}><MapPin width={24} height={24} color="#0369a1" /></div>
            <span>{t('dashboard.track_shipments')}</span>
          </Link>
          <Link to="/live-map" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#fce7f3' }}><MapPin width={24} height={24} color="#be185d" /></div>
            <span>{t('dashboard.live_map')}</span>
          </Link>
          <Link to="/customers" className="quick-action-card">
            <div className="quick-action-icon"><Activity width={24} height={24} /></div>
            <span>{t('dashboard.customers')}</span>
          </Link>
          <Link to="/bulk-import" className="quick-action-card">
            <div className="quick-action-icon" style={{ background: '#ede9fe' }}><Package width={24} height={24} color="#7c3aed" /></div>
            <span>{t('dashboard.bulk_import')}</span>
          </Link>
          <Link to="/wallet" className="quick-action-card">
            <div className="quick-action-icon"><DollarCircle width={24} height={24} /></div>
            <span>{t('dashboard.wallet')}</span>
          </Link>
          <Link to="/reports" className="quick-action-card">
            <div className="quick-action-icon"><StatUp width={24} height={24} /></div>
            <span>{t('dashboard.reports')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
