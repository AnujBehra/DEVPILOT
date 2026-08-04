import { useEffect, useState } from 'react';
import { Activity, ExternalLink, Gauge, ShieldAlert, Waypoints } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { workspaceApi, type Dashboard, type GrafanaStatus, type MonitoringSummary, type ServiceHealth } from '../api/workspace';

const grafanaVisualUrl = import.meta.env.VITE_OPEN_GRAFANA_DASHBOARD_URL
  || import.meta.env.VITE_OPEN_GRAFANA_URL
  || 'https://punyviper1770.grafana.net';

export const Monitoring = () => {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [grafanaStatus, setGrafanaStatus] = useState<GrafanaStatus | null>(null);

  useEffect(() => {
    const load = () => {
      workspaceApi.serviceHealth().then((data) => setServices(data.services)).catch(() => setServices([]));
      workspaceApi.monitoringSummary().then(setSummary).catch(() => setSummary(null));
      workspaceApi.dashboard().then(setDashboard).catch(() => setDashboard(null));
      workspaceApi.grafanaStatus().then(setGrafanaStatus).catch(() => setGrafanaStatus(null));
    };

    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const statusCodeSeries = Object.entries(summary?.statusCodes || {}).map(([code, count]) => ({ code, count }));
  const projectHealthSeries = (dashboard?.projectHealth || []).map((project) => ({
    name: project.serviceName || project.name,
    responseTime: project.responseTimeMs || 0,
    uptime: project.status === 'healthy' ? 100 : project.status === 'warning' ? 50 : 0,
    statusCode: project.statusCode || 0,
  }));
  const serviceStatusSeries = [
    { name: 'Healthy', value: services.filter((service) => service.status === 'healthy').length },
    { name: 'Unhealthy', value: services.filter((service) => service.status !== 'healthy').length },
  ];
  const grafanaConnected = Boolean(grafanaStatus?.configured && (grafanaStatus.check?.pushed || grafanaStatus.lastPush?.pushed));

  return (
    <div className="space-y-6">
      <div className="card hero-panel hero-panel-compact">
        <div className="hero-copy">
          <div>
            <h1>Monitoring</h1>
            <p className="subtle">Service health, uptime, latency, and HTTP status.</p>
          </div>
          <div className="hero-meta">
            <span className={`status-badge ${grafanaConnected ? 'status-healthy' : 'status-warning'}`}><span className="status-badge-dot" /> {grafanaConnected ? 'Grafana connected' : 'Grafana needs setup'}</span>
            <a className="toggle inline-flex items-center gap-2" href={grafanaVisualUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Grafana
            </a>
          </div>
        </div>
      </div>

      <div className="grid">
        <SummaryCard label="Platform Status" value={summary?.status || 'Unknown'} helper="Current state" icon={ShieldAlert} />
        <SummaryCard label="Requests" value={String(summary?.totalRequests || 0)} helper="Total requests" icon={Activity} />
        <SummaryCard label="Uptime" value={summary?.uptimePercent != null ? `${summary.uptimePercent}%` : 'No data'} helper="Healthy share" icon={Waypoints} />
        <SummaryCard label="Avg Response Time" value={summary?.avgResponseTimeMs != null ? `${summary.avgResponseTimeMs} ms` : 'No data'} helper="Mean latency" icon={Gauge} />
      </div>

      <div className="card surface-card">
        <div className="topbar">
          <div>
            <h3>Grafana connection</h3>
            <p className="subtle">
              {grafanaConnected
                ? `Metrics pushed${grafanaStatus?.check?.series ? ` with ${grafanaStatus.check.series} series` : ''}.`
                : grafanaStatus?.configured
                  ? `Configured, but push failed: ${grafanaStatus.check?.error || grafanaStatus.lastPush?.error || grafanaStatus.check?.reason || 'check the token and remote-write URL'}.`
                  : 'Not configured.'}
            </p>
          </div>
          <span className={`status-badge ${grafanaConnected ? 'status-healthy' : 'status-warning'}`}>
            <span className="status-badge-dot" /> {grafanaConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="monitoring-meta mt-4">
          <div className="mini-stat"><span className="metric-kicker">Remote Write</span><span className="subtle">{grafanaStatus?.remoteWriteUrl || 'Missing'}</span></div>
          <div className="mini-stat"><span className="metric-kicker">Username</span><span className="metric-sm">{grafanaStatus?.usernameConfigured ? 'Configured' : 'Missing'}</span></div>
          <div className="mini-stat"><span className="metric-kicker">Write Token</span><span className="metric-sm">{grafanaStatus?.tokenConfigured ? 'Configured' : 'Missing'}</span></div>
        </div>
      </div>

      <div className="grafana-dashboard">
        <div className="grafana-dashboard-header">
          <div>
            <span className="metric-kicker">Grafana dashboard</span>
            <h3>Platform dashboard</h3>
            <p>Health checks, API metrics, and Grafana status.</p>
          </div>
          <div className="hero-meta">
            <span className="grafana-live">Live</span>
            <a className="toggle inline-flex items-center gap-2" href={grafanaVisualUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Grafana
            </a>
          </div>
        </div>
        <div className="grafana-panels">
          <div className="grafana-panel grafana-panel-wide">
            <div className="grafana-panel-title">
              <span>Project Response Time</span>
              <strong>{summary?.avgResponseTimeMs != null ? `${summary.avgResponseTimeMs} ms avg` : 'No data'}</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <AreaChart data={projectHealthSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Area dataKey="responseTime" stroke="#60a5fa" fill="#1d4ed8" fillOpacity={0.35} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>Service Status</span>
              <strong>{summary?.status || 'Unknown'}</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <BarChart data={serviceStatusSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Bar dataKey="value" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>HTTP Status Codes</span>
              <strong>{statusCodeSeries.length || 'No samples'}</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <BarChart data={statusCodeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="code" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Bar dataKey="count" fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>Project Uptime</span>
              <strong>{summary?.uptimePercent != null ? `${summary.uptimePercent}%` : 'No data'}</strong>
            </div>
            <div className="grafana-table">
              {(dashboard?.projectHealth || []).slice(0, 7).map((project) => (
                <div key={project.projectId}><span>{project.name}</span><strong>{project.status}</strong></div>
              ))}
              {!dashboard?.projectHealth?.length ? <p>No project health samples yet.</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="card surface-card">
        <div className="topbar">
          <div>
            <h3>Service Health</h3>
            <p className="subtle">Latest probe result per service.</p>
          </div>
          <span className="badge">{services.length} services</span>
        </div>
        <div className="grid mt-4">
          {services.map((service) => (
            <div className="health-row" key={service.name}>
              <span className={`health-dot ${service.status === 'healthy' ? 'health-dot-ok' : 'health-dot-bad'}`} />
              <div>
                <strong>{service.name}</strong>
                <p className="subtle">{service.status} · {new Date(service.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
          {!services.length ? <p className="subtle">No service health data.</p> : null}
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Activity }) => (
  <div className="card surface-card metric-card metric-card-compact">
    <div className="metric-card-top">
      <div className="stack-sm">
        <span className="metric-kicker">Summary</span>
        <h3>{label}</h3>
      </div>
      <span className="metric-icon"><Icon size={18} /></span>
    </div>
    <p className="metric-sm">{value}</p>
    <p className="subtle">{helper}</p>
  </div>
);
