import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  RadioTower,
  RefreshCw,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { workspaceApi, type LaunchReadiness, type ProductFeatures, type Project, type WorkspaceTeam } from '../api/workspace';

const scoreTone = (score: number) => {
  if (score >= 85) return 'status-healthy';
  if (score >= 60) return 'status-warning';
  return 'status-danger';
};

export const LaunchCenter = () => {
  const [readiness, setReadiness] = useState<LaunchReadiness | null>(null);
  const [team, setTeam] = useState<WorkspaceTeam | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [features, setFeatures] = useState<ProductFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [preparingDemo, setPreparingDemo] = useState(false);
  const [error, setError] = useState('');
  const [demoMessage, setDemoMessage] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      workspaceApi.launchReadiness(),
      workspaceApi.team(),
      workspaceApi.projects(),
      workspaceApi.productFeatures(),
    ])
      .then(([readinessData, teamData, projectData, featureData]) => {
        setReadiness(readinessData);
        setTeam(teamData);
        setProjects(projectData.projects);
        setFeatures(featureData);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load Launch Center.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const prepareDemoWorkspace = async () => {
    setPreparingDemo(true);
    setDemoMessage('');
    try {
      const result = await workspaceApi.prepareDemoWorkspace();
      setDemoMessage(`${result.seed.projects} projects ready. ${result.totals.healthChecks} checks updated.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to prepare demo workspace.');
    } finally {
      setPreparingDemo(false);
    }
  };

  const strongestProject = useMemo(() => {
    return projects
      .map((project) => ({
        project,
        weight: Number(Boolean(project.appUrl)) + Number(Boolean(project.deploymentWebhookToken)) + Number(project.openIncidents === 0),
      }))
      .sort((a, b) => b.weight - a.weight)[0]?.project;
  }, [projects]);

  const nextActions = useMemo(() => {
    if (!readiness) return [];
    return readiness.checklist
      .filter((item) => !item.done)
      .slice(0, 4)
      .map((item) => {
        if (item.id === 'projects') return { ...item, href: '/app/projects#create-project', cta: 'Create project' };
        if (item.id === 'monitoring') return { ...item, href: strongestProject ? `/app/projects/${strongestProject.id}` : '/app/projects', cta: 'Connect URL' };
        if (item.id === 'github') return { ...item, href: strongestProject ? `/app/projects/${strongestProject.id}` : '/app/projects', cta: 'Sync repository' };
        if (item.id === 'alerts') return { ...item, href: strongestProject ? `/app/projects/${strongestProject.id}` : '/app/projects', cta: 'Add alert' };
        if (item.id === 'reports') return { ...item, href: strongestProject ? `/app/projects/${strongestProject.id}` : '/app/projects', cta: 'Generate report' };
        return { ...item, href: '/app/onboarding', cta: 'Open setup' };
      });
  }, [readiness, strongestProject]);

  return (
    <div className="space-y-6 launch-center-screen">
      <div className="card hero-panel launch-center-hero">
        <div className="hero-copy">
          <span className="metric-kicker"><Sparkles size={14} /> Home</span>
          <h1>Workspace status</h1>
          <p className="subtle">Team, projects, monitoring, and database health.</p>
          <div className="hero-meta">
            <span className={`status-badge ${scoreTone(readiness?.score || 0)}`}><span className="status-badge-dot" /> {readiness?.status || 'Checking'}</span>
            <span className="badge">{readiness?.score ?? 0}% ready</span>
            <span className="badge">{team?.members.length || 0} members</span>
          </div>
        </div>
        <div className="hero-actions">
          <button className="toggle inline-flex items-center justify-center gap-2" type="button" onClick={prepareDemoWorkspace} disabled={preparingDemo}>
            <Sparkles size={16} /> {preparingDemo ? 'Preparing...' : 'Load sample data'}
          </button>
          <button className="button-secondary inline-flex items-center gap-2" type="button" onClick={load}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="subtle">Loading launch signals...</p> : null}
      {demoMessage ? <div className="read-only-banner read-only-banner-success"><strong>Sample data ready</strong><span>{demoMessage}</span></div> : null}
      {error ? <div className="read-only-banner"><strong>Home unavailable</strong><span>{error}</span></div> : null}

      <div className="launch-score-grid">
        <div className="card surface-card launch-score-card">
          <div className="launch-score-ring" style={{ ['--score' as string]: `${readiness?.score || 0}%` }}>
            <span>{readiness?.score ?? 0}</span>
          </div>
          <div>
            <span className="metric-kicker">Score</span>
            <h3>{readiness?.status || 'Needs setup'}</h3>
            <p className="subtle">Based on projects, monitoring, releases, database, and Grafana.</p>
          </div>
        </div>
        {[
          { label: 'Projects', value: readiness?.metrics.projects || 0, icon: RadioTower },
          { label: 'Issues', value: readiness?.metrics.tasks || 0, icon: BarChart3 },
          { label: 'Deployments', value: readiness?.metrics.deployments || 0, icon: GitBranch },
          { label: 'Open incidents', value: readiness?.metrics.openIncidents || 0, icon: CircleAlert },
        ].map((metric) => (
          <div className="card surface-card metric-card" key={metric.label}>
            <div className="metric-card-top">
              <span className="metric-kicker">Metric</span>
              <span className="metric-icon"><metric.icon size={18} /></span>
            </div>
            <h3>{metric.label}</h3>
            <strong className="metric-value">{metric.value}</strong>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="card surface-card">
          <div className="section-header-row">
            <div>
              <span className="metric-kicker">Checklist</span>
              <h3>Completed</h3>
            </div>
            <span className="badge">{readiness?.checklist.filter((item) => item.done).length || 0}/{readiness?.checklist.length || 0}</span>
          </div>
          <div className="launch-checklist">
            {(readiness?.checklist || []).map((item) => (
              <div className="launch-check-row" key={item.id}>
                <span className={`metric-icon ${item.done ? 'metric-icon-success' : 'metric-icon-warning'}`}>
                  {item.done ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <p className="subtle">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card surface-card">
          <div className="section-header-row">
            <div>
              <span className="metric-kicker">Actions</span>
              <h3>Next steps</h3>
            </div>
          </div>
          <div className="launch-actions-list">
            {nextActions.map((action) => (
              <Link className="launch-action" to={action.href} key={action.id}>
                <div>
                  <strong>{action.label}</strong>
                  <p className="subtle">{action.detail}</p>
                </div>
                <span>{action.cta} <ArrowRight size={15} /></span>
              </Link>
            ))}
            {!nextActions.length ? (
              <div className="launch-action launch-action-complete">
                <div>
                  <strong>Workspace looks good</strong>
                  <p className="subtle">Keep projects, alerts, and reports up to date.</p>
                </div>
                <CheckCircle2 size={18} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card surface-card">
          <span className="metric-kicker"><UsersRound size={14} /> Workspace</span>
          <h3>{features?.tenant.name || readiness?.tenant.name || 'DevPilot Team'}</h3>
          <div className="workspace-snapshot">
            <div><span>Workspace</span><strong>{readiness?.workspace.name || team?.workspace.name || 'Team Space'}</strong></div>
            <div><span>Region</span><strong>{features?.tenant.primaryRegion || readiness?.tenant.primaryRegion || 'ap-south-1'}</strong></div>
            <div><span>Retention</span><strong>{features?.tenant.dataRetentionDays || readiness?.tenant.dataRetentionDays || 90} days</strong></div>
            <div><span>SSO</span><strong>{features?.tenant.ssoEnabled || readiness?.tenant.ssoEnabled ? 'Enabled' : 'Ready'}</strong></div>
          </div>
        </div>

        <div className="card surface-card">
          <span className="metric-kicker"><Database size={14} /> Database</span>
          <h3>{readiness?.database.engine || 'Postgres'} data layer</h3>
          <div className="workspace-snapshot">
            <div><span>Durable</span><strong>{readiness?.database.durable ? 'Yes' : 'No'}</strong></div>
            <div><span>Tables</span><strong>{readiness?.database.tables?.length || 0}</strong></div>
            <div><span>Grafana</span><strong>{readiness?.grafana.configured ? 'Connected' : 'Not connected'}</strong></div>
            <div><span>Metric push</span><strong>{readiness?.grafana.lastPush?.pushed ? 'Active' : 'Pending'}</strong></div>
          </div>
          {readiness?.grafana.stackUrl ? (
            <a className="toggle inline-flex items-center justify-center gap-2" href={readiness.grafana.stackUrl} target="_blank" rel="noreferrer">
              Open Grafana <ExternalLink size={15} />
            </a>
          ) : null}
        </div>
      </div>

      <div className="card surface-card">
        <div className="section-header-row">
          <div>
            <span className="metric-kicker"><Gauge size={14} /> Flow</span>
            <h3>Recommended path</h3>
          </div>
          <Link className="toggle inline-flex items-center justify-center gap-2" to={strongestProject ? `/app/projects/${strongestProject.id}` : '/app/projects'}>
            Open strongest project <ArrowRight size={15} />
          </Link>
        </div>
        <div className="launch-demo-flow">
          {['Landing page', 'Login', 'Home', 'Board', 'Project', 'Monitoring', 'Report'].map((step, index) => (
            <div key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
