import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Filter, History } from 'lucide-react';
import { workspaceApi, type ActivityLog, type Project } from '../api/workspace';

const eventTypes = [
  'project.created',
  'project.deleted',
  'task.created',
  'task.completed',
  'deployment.created',
  'deployment.failed',
  'incident.created',
  'incident.resolved',
  'github.synced',
  'demo.workspace.prepared',
];

const actionLabel = (log: ActivityLog) => (log.eventType || log.action.split(':')[0]).replace(/[._]/g, ' ');

export const AuditLog = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const projectName = useMemo(() => {
    const map = new Map(projects.map((project) => [project.id, project.name]));
    return (id?: string) => (id ? map.get(id) || 'Project' : 'Workspace');
  }, [projects]);

  const load = () => {
    setLoading(true);
    Promise.all([
      workspaceApi.activity({ projectId, eventType, from, to }),
      workspaceApi.projects(),
    ])
      .then(([activityData, projectData]) => {
        setLogs(activityData);
        setProjects(projectData.projects);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load audit log.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="card hero-panel hero-panel-compact">
        <div className="hero-copy">
          <span className="metric-kicker"><History size={14} /> Audit trail</span>
          <h1>Audit log</h1>
          <p className="subtle">Project, release, incident, alert, and report history.</p>
          <div className="hero-meta">
            <span className="badge">{logs.length} events</span>
          </div>
        </div>
      </div>

      <div className="card surface-card activity-filters">
        <select className="editor min-h-0" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">All projects</option>
          {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </select>
        <select className="editor min-h-0" value={eventType} onChange={(event) => setEventType(event.target.value)}>
          <option value="">All event types</option>
          {eventTypes.map((type) => <option value={type} key={type}>{type}</option>)}
        </select>
        <label className="audit-date-field">
          <CalendarDays size={15} />
          <input className="editor min-h-0" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="audit-date-field">
          <CalendarDays size={15} />
          <input className="editor min-h-0" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="toggle inline-flex items-center justify-center gap-2" type="button" onClick={load}>
          <Filter size={16} /> Apply
        </button>
      </div>

      {loading ? <p className="subtle">Loading audit events...</p> : null}
      {error ? <div className="read-only-banner"><strong>Audit unavailable</strong><span>{error}</span></div> : null}

      <div className="card surface-card">
        <div className="activity-timeline">
          {logs.map((log) => (
            <div className="activity-event-row" key={log.id}>
              <span className="metric-icon"><Activity size={16} /></span>
              <div>
                <strong>{actionLabel(log)}</strong>
                <p className="subtle">{log.actor} · {log.role} · {projectName(log.projectId)} · {new Date(log.timestamp).toLocaleString()}</p>
                <span>{log.action}</span>
              </div>
            </div>
          ))}
          {!loading && !logs.length ? (
            <div className="empty-sellable-state">
              <strong>No audit events match this filter</strong>
              <span>Create a project, release, task, or incident to see history here.</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
