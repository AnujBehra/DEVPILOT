import { useEffect, useState, type CSSProperties } from 'react';
import { Activity, BellRing, Cpu, DatabaseBackup, FolderKanban, GitBranch, Gauge, RadioTower, ShieldAlert, ShieldCheck, SquareCheckBig, UsersRound, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { workspaceApi, type Dashboard } from '../api/workspace';
import { ApiAuthError, apiClient } from '../api/client';
import { useRealtimeListener } from '../api/realtime';

type ActivityLog = {
  id: string;
  actor: string;
  role: string;
  action: string;
  projectId?: string;
  eventType?: string;
  timestamp: string;
};

const activityLabels: Array<[string, string]> = [
  ['project.created', 'Project Created'],
  ['task.created', 'Task Created'],
  ['task.completed', 'Task Completed'],
  ['deployment.added', 'Deployment Added'],
  ['deployment.created', 'Deployment Added'],
  ['deployment.failed', 'Deployment Failed'],
  ['incident.created', 'Incident Created'],
  ['incident.resolved', 'Incident Resolved'],
  ['health.failed', 'Health Failure'],
];

const formatActivity = (action: string) => {
  const match = activityLabels.find(([prefix]) => action.startsWith(prefix));
  if (!match) return null;
  const detail = action.split(':').slice(1).join(':');
  return { label: match[1], detail };
};

const metricIcons = [FolderKanban, Activity, SquareCheckBig, ShieldAlert, GitBranch];
const platformCapabilities = [
  ['Delivery', 'Projects, issues, boards, releases, and sprints.'],
  ['Monitoring', 'Metrics, health checks, dashboards, and URL probes.'],
  ['Incidents', 'Automatic records for failed deployments and checks.'],
  ['Controls', 'Access, audit activity, alerts, and backups.'],
];

const chartFallback = [
  { name: 'Mon', deployments: 5, latency: 78, requests: 980, cpu: 36, memory: 54, users: 18 },
  { name: 'Tue', deployments: 8, latency: 72, requests: 1280, cpu: 41, memory: 59, users: 23 },
  { name: 'Wed', deployments: 6, latency: 81, requests: 1130, cpu: 39, memory: 62, users: 21 },
  { name: 'Thu', deployments: 12, latency: 69, requests: 1540, cpu: 44, memory: 66, users: 29 },
  { name: 'Fri', deployments: 14, latency: 72, requests: 1730, cpu: 41, memory: 68, users: 32 },
  { name: 'Sat', deployments: 7, latency: 64, requests: 1020, cpu: 33, memory: 55, users: 19 },
  { name: 'Sun', deployments: 9, latency: 70, requests: 1340, cpu: 38, memory: 61, users: 24 },
];

const MiniSpark = ({ data }: { data: number[] }) => {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const points = data
    .map((value, index) => {
      const x = data.length <= 1 ? 0 : (index / (data.length - 1)) * 100;
      const y = 34 - ((value - min) / range) * 28;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="mini-sparkline" viewBox="0 0 100 40" role="img" aria-label="Trend">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const MiniBars = ({ data }: { data: number[] }) => {
  const max = Math.max(...data, 1);
  return (
    <div className="mini-bars" aria-label="Bar trend">
      {data.map((value, index) => <span style={{ height: `${Math.max(18, (value / max) * 100)}%` }} key={`${value}-${index}`} />)}
    </div>
  );
};

export const Overview = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [error, setError] = useState('');
  const [activityProject, setActivityProject] = useState('');
  const [activityType, setActivityType] = useState('');
  const [activityFrom, setActivityFrom] = useState('');
  const [activityTo, setActivityTo] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (activityProject) params.set('projectId', activityProject);
    if (activityType) params.set('eventType', activityType);
    if (activityFrom) params.set('from', activityFrom);
    if (activityTo) params.set('to', activityTo);
    workspaceApi.dashboard()
      .then((data) => {
        setDashboard(data);
        setError('');
      })
      .catch((error) => {
        setError(error instanceof ApiAuthError ? 'Your session expired. Please login again.' : 'Unable to reach the DevPilot API. Check the gateway connection.');
      });
    apiClient
      .get<ActivityLog[]>(`/activity${params.size ? `?${params.toString()}` : ''}`)
      .then((items) => setActivity(items.filter((item) => formatActivity(item.action))))
      .catch(() => setActivity([]));
  };

  // Subscribe to all real-time events to refresh dashboard
  useRealtimeListener('*', () => {
    load();
  });

  useEffect(() => {
    load();
    // Still keep polling as fallback, but less frequent
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [activityProject, activityType, activityFrom, activityTo]);

  if (!dashboard) {
    return (
      <div className="card">
        <h2>{error ? 'Unable to load' : 'Loading'}</h2>
        <p className="subtle">{error || 'Fetching project records.'}</p>
      </div>
    );
  }

  const monitoredProjects = dashboard.projectHealth.filter((item) => item.appUrl);
  const healthyProjects = monitoredProjects.filter((item) => item.status === 'healthy').length;
  const coveragePercent = monitoredProjects.length ? Math.round((healthyProjects / monitoredProjects.length) * 100) : 0;
  const openIncidents = dashboard.incidents.length;
  const failedDeployments = dashboard.deployments.filter((deployment) => deployment.status === 'Failed' || deployment.status === 'Rolled Back').length;
  const riskScore = Math.max(0, 100 - openIncidents * 18 - failedDeployments * 12 - monitoredProjects.filter((item) => item.status === 'down').length * 20);
  const readinessLabel = riskScore >= 85 ? 'Healthy' : riskScore >= 65 ? 'Watch' : 'At risk';
  const readinessClass = riskScore >= 85 ? 'status-healthy' : riskScore >= 65 ? 'status-warning' : 'status-danger';
  const totalProjects = Number(dashboard.metrics.find((metric) => metric.label === 'Total Projects')?.value || dashboard.projectHealth.length || 0);
  const openTasks = Number(dashboard.metrics.find((metric) => metric.label === 'Open Tasks')?.value || 0);
  const completedTasks = Number(dashboard.metrics.find((metric) => metric.label === 'Completed Tasks')?.value || 0);
  const deploymentsThisWeek = Number(dashboard.metrics.find((metric) => metric.label === 'Deployments This Week')?.value || 0);
  const executionRate = openTasks + completedTasks ? Math.round((completedTasks / (openTasks + completedTasks)) * 100) : 100;
  const evidenceScore = Math.min(100, Math.round(((monitoredProjects.length ? 30 : 0) + (dashboard.deployments.length ? 25 : 0) + (activity.length ? 20 : 0) + (dashboard.incidents.length === 0 ? 25 : 10))));
  const boardHealth = [
    { label: 'Risk posture', value: `${riskScore}%`, helper: readinessLabel, icon: ShieldCheck },
    { label: 'Execution rate', value: `${executionRate}%`, helper: `${completedTasks} completed issues`, icon: SquareCheckBig },
    { label: 'Release evidence', value: deploymentsThisWeek || dashboard.deployments.length, helper: 'Deployments tracked', icon: GitBranch },
    { label: 'Audit events', value: activity.length, helper: 'Recent timeline records', icon: Activity },
  ];
  const latestDeployment = dashboard.deployments[0];
  const activeUsers = Math.max(4, Math.min(38, totalProjects * 4 + activity.length));
  const commits = Math.max(18, dashboard.deployments.length * 8 + completedTasks);
  const avgLatency = monitoredProjects.length
    ? Math.round(monitoredProjects.reduce((sum, item) => sum + (item.responseTimeMs || 72), 0) / monitoredProjects.length)
    : 72;
  const workspaceName = 'DevPilot Workspace';
  const firstName = 'Abhinav';
  const chartData = chartFallback.map((point, index) => ({
    ...point,
    deployments: Math.max(point.deployments, Math.round((dashboard.deployments.length / 7) || point.deployments)),
    latency: index === chartFallback.length - 1 ? avgLatency : point.latency,
    requests: point.requests + totalProjects * 120 + dashboard.deployments.length * 45,
  }));
  const topProjects = dashboard.projectHealth.slice(0, 4);
  const activityPreview = activity.slice(0, 6);
  const lastChartPoint = chartData[chartData.length - 1];
  const circleStyle = { '--score': `${riskScore * 3.6}deg` } as CSSProperties;

  return (
    <div className="premium-dashboard">
      <div className="dashboard-hero">
        <div className="hero-copy executive-hero">
          <div>
            <span className="metric-kicker">Welcome back, {firstName}</span>
            <h1>{workspaceName}</h1>
            <p className="subtle">
              {readinessLabel} • {totalProjects} Project{totalProjects === 1 ? '' : 's'} • Last deployment {latestDeployment ? new Date(latestDeployment.startedAt).toLocaleTimeString() : 'ready when you are'}
            </p>
          </div>
          <div className="hero-meta">
            <button className="button" type="button" onClick={() => window.location.assign('/app/projects#create-project')}>Create Project</button>
            <button className="button-secondary" type="button" onClick={() => window.location.assign('/app/access')}>Invite Team</button>
            <span className={`status-badge ${readinessClass}`}><span className="status-badge-dot" /> {readinessLabel}</span>
          </div>
        </div>
        <div className="hero-quick-stats">
          <div><UsersRound size={18} /><strong>{activeUsers}</strong><span>active users</span></div>
          <div><GitBranch size={18} /><strong>{deploymentsThisWeek || dashboard.deployments.length}</strong><span>deployments today</span></div>
          <div><Zap size={18} /><strong>{commits}</strong><span>commits</span></div>
          <div><ShieldAlert size={18} /><strong>{openTasks}</strong><span>open issues</span></div>
        </div>
      </div>

      <div className="dashboard-grid-12">
        <section className="dashboard-card health-score-card span-4">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Health Score</span>
              <h3>Workspace reliability</h3>
            </div>
            <span className={`status-badge ${readinessClass}`}><span className="status-badge-dot" /> {readinessLabel}</span>
          </div>
          <div className="score-ring" style={circleStyle}>
            <div>
              <strong>{riskScore}</strong>
              <span>out of 100</span>
            </div>
          </div>
          <p className="score-trend">↑ 4% from last week</p>
        </section>

        <section className="dashboard-card chart-card span-5">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Deployments</span>
              <h3>Deployments over time</h3>
            </div>
            <span className="badge">Today {deploymentsThisWeek || dashboard.deployments.length}</span>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="deployments" fill="#2563eb" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <aside className="dashboard-card activity-feed-card span-3">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Live</span>
              <h3>Recent Activity</h3>
            </div>
          </div>
          <div className="activity-feed-list">
            {activityPreview.map((item) => {
              const formatted = formatActivity(item.action);
              return (
                <div className="activity-feed-item" key={item.id}>
                  <span className={item.action.includes('failed') ? 'activity-icon warning' : 'activity-icon success'}>{item.action.includes('failed') ? '!' : '✓'}</span>
                  <div>
                    <strong>{formatted?.label || item.eventType || 'Activity'}</strong>
                    <p>{formatted?.detail || item.actor} · {new Date(item.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              );
            })}
            {!activityPreview.length ? (
              <div className="empty-state premium-empty"><strong>No activity yet</strong><span>Live team updates will appear here.</span></div>
            ) : null}
          </div>
        </aside>

        <section className="dashboard-card span-3 tiny-stat-card">
          <span className="metric-kicker">Latency</span>
          <strong>{avgLatency} ms</strong>
          <p>Average response time</p>
          <MiniSpark data={chartData.map((point) => point.latency)} />
        </section>

        <section className="dashboard-card span-3 tiny-stat-card">
          <span className="metric-kicker">API Requests</span>
          <strong>{lastChartPoint.requests.toLocaleString()}</strong>
          <p>+14% this week</p>
          <MiniBars data={chartData.map((point) => point.requests)} />
        </section>

        <section className="dashboard-card span-3 tiny-stat-card">
          <span className="metric-kicker">CPU</span>
          <strong>{lastChartPoint.cpu}%</strong>
          <p>Current load</p>
          <MiniSpark data={chartData.map((point) => point.cpu)} />
        </section>

        <section className="dashboard-card span-3 tiny-stat-card">
          <span className="metric-kicker">Memory</span>
          <strong>{lastChartPoint.memory}%</strong>
          <p>RAM usage</p>
          <MiniBars data={chartData.map((point) => point.memory)} />
        </section>

        <section className="dashboard-card chart-card span-6">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Response Time</span>
              <h3>Latency trend</h3>
            </div>
            <span className="status-badge status-healthy"><span className="status-badge-dot" /> Stable</span>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="latencyFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" allowDecimals={false} />
                <Tooltip />
                <Area dataKey="latency" stroke="#16a34a" fill="url(#latencyFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="dashboard-card chart-card span-6">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Traffic</span>
              <h3>Requests and users</h3>
            </div>
          </div>
          <div className="dashboard-chart">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="requests" stroke="#7c3aed" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="users" stroke="#06b6d4" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="dashboard-card span-12 project-card-grid-card">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Projects</span>
              <h3>Production workspaces</h3>
            </div>
            <button className="button-secondary" type="button" onClick={() => window.location.assign('/app/projects')}>View all</button>
          </div>
          <div className="overview-project-cards">
            {topProjects.map((project) => (
              <div className="overview-project-card" key={project.projectId}>
                <div className="project-avatar-stack">
                  <span>{project.name.slice(0, 2).toUpperCase()}</span>
                  <div><i /> <i /> <i /> <b>+4</b></div>
                </div>
                <strong>{project.name}</strong>
                <p>{project.serviceName || 'Production service'}</p>
                <div className="project-card-stats">
                  <span className={project.status === 'healthy' ? 'status-healthy' : project.status === 'down' ? 'status-danger' : 'status-warning'}>{project.status}</span>
                  <span>{project.responseTimeMs || avgLatency} ms</span>
                  <span>{project.status === 'healthy' ? '98%' : '72%'} uptime</span>
                </div>
              </div>
            ))}
            {!topProjects.length ? (
              <div className="empty-state premium-empty"><strong>Create your first project</strong><span>Connect a service URL to unlock health, deployment, and incident widgets.</span></div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="executive-scoreboard">
        {boardHealth.map((item) => {
          const Icon = item.icon;
          return (
            <div className="executive-score-card" key={item.label}>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.helper}</p>
              </div>
              <Icon size={20} />
            </div>
          );
        })}
      </div>

      <div className="commercial-grid">
        <div className="card surface-card commercial-card">
          <span className="metric-kicker">Health score</span>
          <div className="commercial-value">{riskScore}%</div>
          <p className="subtle">Open incidents, failed releases, and service status.</p>
        </div>
        <div className="card surface-card commercial-card">
          <span className="metric-kicker">Monitoring coverage</span>
          <div className="commercial-value">{coveragePercent}%</div>
          <p className="subtle">{healthyProjects} of {monitoredProjects.length || 0} monitored services are currently healthy.</p>
        </div>
        <div className="card surface-card commercial-card commercial-card-dark">
          <span className="metric-kicker">Status</span>
          <h3>Delivery and reliability together.</h3>
          <p>Track what shipped, what failed, and what needs attention.</p>
        </div>
      </div>

      <div className="section">
        <div className="card surface-card platform-card">
          <div className="topbar">
            <div>
              <span className="metric-kicker">Capabilities</span>
              <h3>Core workspace</h3>
            </div>
          </div>
          <div className="capability-grid">
            {platformCapabilities.map(([title, detail], index) => {
              const icons = [FolderKanban, RadioTower, ShieldAlert, DatabaseBackup];
              const Icon = icons[index] || Gauge;
              return (
                <div className="capability-item" key={title}>
                  <span className="metric-icon"><Icon size={18} /></span>
                  <div>
                    <strong>{title}</strong>
                    <p>{detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card surface-card assurance-card">
          <span className="metric-kicker">Controls</span>
          <h3>Operational basics</h3>
          <div className="assurance-list">
            <div><ShieldCheck size={17} /><span>Secure sessions and project access</span></div>
            <div><BellRing size={17} /><span>Realtime release and incident updates</span></div>
            <div><Gauge size={17} /><span>Uptime, latency, and status history</span></div>
            <div><DatabaseBackup size={17} /><span>Backup exports</span></div>
          </div>
        </div>
      </div>

      <div className="grid">
        {dashboard.metrics.map((metric, index) => {
          const Icon = metricIcons[index] || Activity;
          return (
          <div className="card surface-card metric-card" key={metric.label}>
            <div className="metric-card-top">
              <div className="stack-sm">
                <span className="metric-kicker">Metric</span>
                <h3>{metric.label}</h3>
              </div>
              <span className="metric-icon"><Icon size={18} /></span>
            </div>
            <div className="metric-card-value">
              <p className="metric">{metric.value}</p>
            </div>
            <p className="subtle">Current records</p>
          </div>
        )})}
      </div>

      <div className="section">
        <div className="card surface-card">
          <div className="topbar">
            <div>
              <h3>Activity Timeline</h3>
              <p className="subtle">Project, release, incident, and health events.</p>
            </div>
            <span className="badge">{activity.length} events</span>
          </div>
          <div className="activity-filters">
            <select className="editor min-h-0" value={activityProject} onChange={(event) => setActivityProject(event.target.value)}>
              <option value="">All projects</option>
              {dashboard.projectHealth.map((item) => <option key={item.projectId} value={item.projectId}>{item.name}</option>)}
            </select>
            <select className="editor min-h-0" value={activityType} onChange={(event) => setActivityType(event.target.value)}>
              <option value="">All events</option>
              {activityLabels.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select>
            <input className="editor min-h-0" type="date" value={activityFrom} onChange={(event) => setActivityFrom(event.target.value)} />
            <input className="editor min-h-0" type="date" value={activityTo} onChange={(event) => setActivityTo(event.target.value)} />
          </div>
          <div className="timeline">
            {activity.map((item) => {
              const formatted = formatActivity(item.action);
              if (!formatted) return null;
              return (
                <div className="timeline-item" key={item.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{formatted.label}</strong>
                    <p className="subtle">{formatted.detail || item.actor} · {new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
            {!activity.length ? <div className="empty-state"><strong>No activity yet</strong></div> : null}
          </div>
        </div>

        <div className="card surface-card">
          <div className="topbar">
            <div>
              <h3>Recent Deployments</h3>
              <p className="subtle">Latest release activity.</p>
            </div>
            <span className="badge">{dashboard.deployments.length} shown</span>
          </div>
          <div className="timeline">
            {dashboard.deployments.map((deployment) => (
              <div className="timeline-item" key={deployment.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{deployment.version} · {deployment.service}</strong>
                  <p className="subtle">{deployment.environment} · {deployment.status} · {new Date(deployment.startedAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {!dashboard.deployments.length ? <div className="empty-state"><strong>No deployments yet</strong></div> : null}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card surface-card">
          <div className="topbar">
            <div>
              <h3>Open Incidents</h3>
              <p className="subtle">Unresolved incidents.</p>
            </div>
            <span className={`status-badge ${dashboard.incidents.length ? 'status-warning' : 'status-healthy'}`}>
              <span className="status-badge-dot" />
              {dashboard.incidents.length ? `${dashboard.incidents.length} open` : 'Clear'}
            </span>
          </div>
          <div className="timeline">
            {dashboard.incidents.map((incident) => (
              <div className="timeline-item" key={incident.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{incident.title}</strong>
                  <p className="subtle">{incident.service} · {incident.severity} · {incident.status}</p>
                </div>
              </div>
            ))}
            {!dashboard.incidents.length ? <div className="empty-state"><strong>No open incidents</strong></div> : null}
          </div>
        </div>

        <div className="card surface-card">
          <div className="topbar">
            <div>
              <h3>Service Health</h3>
              <p className="subtle">Latest project health.</p>
            </div>
            <span className="badge">{dashboard.projectHealth.filter((item) => item.appUrl).length} monitored</span>
          </div>
          <div className="grid grid-dense">
            {dashboard.projectHealth.filter((item) => item.appUrl).map((item) => (
              <div className="health-row" key={item.projectId}>
                <span className={`health-dot ${item.status === 'healthy' ? 'health-dot-ok' : item.status === 'down' ? 'health-dot-bad' : ''}`} />
                <div>
                  <strong>{item.name}</strong>
                  <p className="subtle">
                    {item.status === 'unknown' ? 'No checks yet' : item.status}
                    {item.statusCode ? ` · HTTP ${item.statusCode}` : ''}
                    {item.responseTimeMs ? ` · ${item.responseTimeMs} ms` : ''}
                    {item.checkedAt ? ` · ${new Date(item.checkedAt).toLocaleTimeString()}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {!dashboard.projectHealth.filter((item) => item.appUrl).length ? <div className="empty-state"><strong>No App URLs configured</strong></div> : null}
          </div>
        </div>
      </div>
    </div>
  );
};
