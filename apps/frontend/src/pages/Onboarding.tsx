import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Database, FolderKanban, RadioTower, UsersRound } from 'lucide-react';
import { workspaceApi, type Project, type WorkspaceTeam } from '../api/workspace';

type DatabaseInfo = {
  engine: string;
  durable: boolean;
  workspaceId: string;
};

const steps = [
  {
    title: 'Team',
    detail: 'Invite teammates and keep access clear.',
    icon: UsersRound,
  },
  {
    title: 'Project',
    detail: 'Create a project with its own board, releases, incidents, and checks.',
    icon: FolderKanban,
  },
  {
    title: 'Monitoring',
    detail: 'Add a URL or webhook to track health and releases.',
    icon: RadioTower,
  },
  {
    title: 'Database',
    detail: 'Use PostgreSQL for durable project data.',
    icon: Database,
  },
];

export const Onboarding = () => {
  const [team, setTeam] = useState<WorkspaceTeam | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [database, setDatabase] = useState<DatabaseInfo | null>(null);

  useEffect(() => {
    workspaceApi.team().then(setTeam).catch(() => setTeam(null));
    workspaceApi.projects().then((data) => setProjects(data.projects)).catch(() => setProjects([]));
    fetch('/api/database').then((response) => response.json()).then(setDatabase).catch(() => setDatabase(null));
  }, []);

  const completed = useMemo(() => {
    const hasTeam = Boolean(team?.members?.length);
    const hasProject = projects.length > 0;
    const hasMonitoring = projects.some((project) => project.appUrl);
    const hasDurableDb = Boolean(database?.durable);
    return [hasTeam, hasProject, hasMonitoring, hasDurableDb];
  }, [team, projects, database]);

  const score = Math.round((completed.filter(Boolean).length / completed.length) * 100);

  return (
    <div className="space-y-6">
      <div className="card hero-panel hero-panel-compact onboarding-hero">
        <div className="hero-copy">
          <span className="metric-kicker">Setup</span>
          <h1>Workspace setup</h1>
          <p className="subtle">Complete the essentials for a working team space.</p>
          <div className="hero-meta">
            <span className={`status-badge ${score >= 75 ? 'status-healthy' : 'status-warning'}`}><span className="status-badge-dot" /> {score}% ready</span>
            <span className="badge">{team?.workspace?.name || 'Team workspace'}</span>
          </div>
        </div>
      </div>

      <div className="onboarding-grid">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done = completed[index];
          return (
            <div className={`card surface-card onboarding-step ${done ? 'onboarding-step-done' : ''}`} key={step.title}>
              <div className="metric-icon"><Icon size={18} /></div>
              <div>
                <span className="metric-kicker">Step {index + 1}</span>
                <h3>{step.title}</h3>
                <p className="subtle">{step.detail}</p>
              </div>
              <span className={`status-badge ${done ? 'status-healthy' : 'status-warning'}`}>
                {done ? <CheckCircle2 size={14} /> : null}
                {done ? 'Done' : 'Needs setup'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="section">
        <div className="card surface-card">
          <h3>Snapshot</h3>
          <div className="workspace-snapshot">
            <div><span>Members</span><strong>{team?.members?.length || 0}</strong></div>
            <div><span>Visible projects</span><strong>{projects.length}</strong></div>
            <div><span>Monitored URLs</span><strong>{projects.filter((project) => project.appUrl).length}</strong></div>
            <div><span>Database</span><strong>{database?.durable ? 'PostgreSQL' : database?.engine || 'Unknown'}</strong></div>
          </div>
        </div>
        <div className="card surface-card launch-actions">
          <h3>Next actions</h3>
          <Link className="toggle inline-flex items-center justify-center gap-2" to="/app/projects#create-project">
            Create project <ArrowRight size={16} />
          </Link>
          <Link className="toggle inline-flex items-center justify-center gap-2" to="/app/team-board">
            Open team board <ArrowRight size={16} />
          </Link>
          <Link className="toggle inline-flex items-center justify-center gap-2" to="/app/monitoring">
            View monitoring <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
};
