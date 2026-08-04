import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, ExternalLink, FolderKanban, Plus, RadioTower, ShieldAlert, Trash2 } from 'lucide-react';
import { workspaceApi, type Project, type ProjectRole } from '../api/workspace';

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('devpilot.user') || 'null') as { name?: string; email?: string; role?: string } | null;
  } catch {
    return null;
  }
};

const projectCacheKey = () => `devpilot.projects.cache:${String(readStoredUser()?.email || 'guest').toLowerCase()}`;
const deletedProjectCacheKey = () => `devpilot.projects.deleted:${String(readStoredUser()?.email || 'guest').toLowerCase()}`;
const readCachedProjects = (): Project[] => {
  try {
    const cached = localStorage.getItem(projectCacheKey());
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
};
const saveCachedProjects = (projects: Project[]) => {
  localStorage.setItem(projectCacheKey(), JSON.stringify(projects));
};
const removeCachedProject = (id: string) => {
  const next = readCachedProjects().filter((project) => project.id !== id);
  saveCachedProjects(next);
  return next;
};
const readDeletedProjectIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(deletedProjectCacheKey()) || '[]') as string[]);
  } catch {
    return new Set<string>();
  }
};
const rememberDeletedProject = (id: string) => {
  const ids = readDeletedProjectIds();
  ids.add(id);
  localStorage.setItem(deletedProjectCacheKey(), JSON.stringify(Array.from(ids)));
};
const sortProjects = (projects: Project[]) =>
  [...projects].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
const visibleServerProjects = (serverProjects: Project[]) => {
  const deletedIds = readDeletedProjectIds();
  return sortProjects(serverProjects.filter((project) => !deletedIds.has(project.id)));
};
const normalizeUrlInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
};
const parseMemberEmails = (value: string) =>
  Array.from(new Set(
    value
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )).map((entry) => {
    const [email, rawRole] = entry.split(':').map((part) => part.trim().toLowerCase());
    const role = ['admin', 'member', 'viewer'].includes(rawRole) ? rawRole as ProjectRole : 'member';
    return { email, name: email, role };
  });

type ProjectDraft = Pick<Project, 'name' | 'description' | 'owner' | 'serviceName' | 'deploymentPlatform' | 'appUrl' | 'status'> & {
  projectKey: string;
  memberEmails: string;
};

const emptyProject: ProjectDraft = {
  name: '',
  projectKey: '',
  description: '',
  owner: '',
  serviceName: '',
  deploymentPlatform: 'Other',
  appUrl: '',
  status: 'Active',
  memberEmails: '',
};

export const Projects = () => {
  const currentUser = readStoredUser();
  const canCreateProjects = currentUser?.role !== 'viewer';
  const isWorkspaceAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const canManageProject = (project: Project) => {
    if (isWorkspaceAdmin) return true;
    const email = String(currentUser?.email || '').trim().toLowerCase();
    if (project.ownerEmail?.toLowerCase() === email) return true;
    const membership = (project.members || []).find((member) => member.email.toLowerCase() === email);
    return membership?.role === 'owner' || membership?.role === 'admin';
  };
  const canDeleteProject = (project: Project) => {
    if (isWorkspaceAdmin) return true;
    const email = String(currentUser?.email || '').trim().toLowerCase();
    if (project.ownerEmail?.toLowerCase() === email) return true;
    const membership = (project.members || []).find((member) => member.email.toLowerCase() === email);
    return membership?.role === 'owner' || membership?.role === 'admin';
  };
  const [projects, setProjects] = useState<Project[]>([]);
  const [draft, setDraft] = useState(emptyProject);
  const [editing, setEditing] = useState<Project | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const wizardSteps = ['Basics', 'Team', 'Monitoring', 'Review'];

  const loadProjects = () =>
    workspaceApi
      .projects()
      .then((data) => {
        const freshProjects = visibleServerProjects(data.projects);
        setProjects(freshProjects);
        saveCachedProjects(freshProjects);
        setError('');
      })
      .catch(() => {
        setProjects([]);
        saveCachedProjects([]);
        setError('Unable to load projects.');
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (window.location.hash === '#create-project') {
      window.requestAnimationFrame(() => document.getElementById('create-project')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []);

  useEffect(() => {
    if (!editing && !draft.owner && currentUser?.name) {
      setDraft((current) => ({ ...current, owner: current.owner || currentUser.name || '' }));
    }
  }, [currentUser?.name, draft.owner, editing]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.serviceName.trim()) {
      setError('Project name and service name are required.');
      return;
    }
    if (!canCreateProjects) {
      setError('Read-only access.');
      return;
    }

    if (editing) {
      const { memberEmails, ...projectDraft } = draft;
      const { project } = await workspaceApi.updateProject(editing.id, {
        ...projectDraft,
        appUrl: normalizeUrlInput(projectDraft.appUrl),
        members: parseMemberEmails(memberEmails),
      });
      setProjects((current) => {
        const next = current.map((item) => (item.id === project.id ? project : item));
        saveCachedProjects(next);
        return next;
      });
      setEditing(null);
    } else {
      const { memberEmails, ...projectDraft } = draft;
      const { project } = await workspaceApi.createProject({
        ...projectDraft,
        owner: projectDraft.owner || currentUser?.name || '',
        appUrl: normalizeUrlInput(projectDraft.appUrl),
        members: parseMemberEmails(memberEmails),
      });
      setProjects((current) => {
        const next = sortProjects([project, ...current.filter((item) => item.id !== project.id)]);
        saveCachedProjects(next);
        return next;
      });
    }
    setError('');
    setDraft(emptyProject);
    setWizardStep(0);
  };

  const startEdit = (project: Project) => {
    setEditing(project);
    setDraft({
      name: project.name,
      projectKey: project.projectKey,
      description: project.description,
      owner: project.owner,
      serviceName: project.serviceName,
      deploymentPlatform: project.deploymentPlatform,
      appUrl: project.appUrl,
      status: project.status,
      memberEmails: (project.members || [])
        .filter((member) => member.role !== 'owner')
        .map((member) => member.email)
        .join(', '),
    });
    setWizardStep(0);
  };

  const deleteProject = async (project: Project) => {
    if (!window.confirm(`Delete ${project.name}? This removes its tasks, deployments, incidents, monitoring history, and project settings.`)) return;
    const removeFromWorkspace = () => {
      rememberDeletedProject(project.id);
      const cached = removeCachedProject(project.id);
      setProjects((current) => {
        const next = current.filter((item) => item.id !== project.id);
        return next.length ? next : cached;
      });
    };
    try {
      await workspaceApi.deleteProject(project.id);
      removeFromWorkspace();
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete project.';
      if (message.toLowerCase().includes('project not found')) {
        removeFromWorkspace();
        setError('');
        return;
      }
      setError(message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card hero-panel hero-panel-compact">
        <div className="hero-copy">
          <div>
            <h1>Projects</h1>
            <p className="subtle">Manage apps, owners, teams, and monitoring.</p>
          </div>
          <div className="hero-meta">
            <span className="status-badge status-healthy"><span className="status-badge-dot" /> Signed in as {currentUser?.email || 'guest'}</span>
            <span className="badge">{isWorkspaceAdmin ? 'Admin' : 'Member'}</span>
          </div>
        </div>
      </div>
      {loading ? <p className="subtle">Loading projects...</p> : null}
      {error ? <p className="subtle">{error}</p> : null}

      <form id="create-project" className="card surface-card stack-md" onSubmit={submit}>
        <div className="topbar">
          <div>
            <h3>{editing ? 'Edit Project' : 'Create Project'}</h3>
            <p className="subtle">Add the basics, team, and monitoring.</p>
          </div>
          <span className="badge">{wizardSteps[wizardStep]}</span>
        </div>
        <div className="wizard-steps" aria-label="Project setup steps">
          {wizardSteps.map((step, index) => (
            <button
              className={`wizard-step ${index === wizardStep ? 'wizard-step-active' : ''} ${index < wizardStep ? 'wizard-step-done' : ''}`}
              key={step}
              type="button"
              onClick={() => setWizardStep(index)}
            >
              <span>{index + 1}</span>
              {step}
            </button>
          ))}
        </div>
        {wizardStep === 0 ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <input className="editor min-h-0" placeholder="Project name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <input className="editor min-h-0" placeholder="Project key, e.g. PAY" value={draft.projectKey} onChange={(event) => setDraft({ ...draft, projectKey: event.target.value.toUpperCase() })} />
            <input className="editor min-h-0" placeholder="Owner" value={draft.owner || currentUser?.name || ''} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
            <input className="editor min-h-0" placeholder="Service name, e.g. analytics-service" value={draft.serviceName} onChange={(event) => setDraft({ ...draft, serviceName: event.target.value })} />
            <select className="editor min-h-0" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Project['status'] })}>
              {['Active', 'Paused', 'Completed'].map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
        ) : null}
        {wizardStep === 1 ? (
          <div className="stack-sm">
            <input className="editor min-h-0" placeholder="Project team emails, comma separated. Use email:admin for project admins" value={draft.memberEmails} onChange={(event) => setDraft({ ...draft, memberEmails: event.target.value })} />
            <p className="subtle">Example: teammate@company.com, lead@company.com:admin</p>
          </div>
        ) : null}
        {wizardStep === 2 ? (
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 220px' }}>
            <input className="editor min-h-0" placeholder="App URL to monitor, optional until after webhook setup" value={draft.appUrl} onChange={(event) => setDraft({ ...draft, appUrl: event.target.value })} />
            <select className="editor min-h-0" value={draft.deploymentPlatform} onChange={(event) => setDraft({ ...draft, deploymentPlatform: event.target.value as Project['deploymentPlatform'] })}>
              {['Vercel', 'GitHub Pages', 'Railway', 'Render', 'Other'].map((platform) => <option key={platform}>{platform}</option>)}
            </select>
          </div>
        ) : null}
        {wizardStep === 3 ? (
          <div className="project-review-grid">
            <div><span>Project</span><strong>{draft.name || 'Untitled project'}</strong></div>
            <div><span>Service</span><strong>{draft.serviceName || 'Not mapped'}</strong></div>
            <div><span>Team</span><strong>{parseMemberEmails(draft.memberEmails).length + 1} member(s)</strong></div>
            <div><span>Monitoring</span><strong>{draft.appUrl ? normalizeUrlInput(draft.appUrl) : 'Connect later'}</strong></div>
          </div>
        ) : null}
        <textarea className="editor" placeholder="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <div className="hero-actions">
          {wizardStep > 0 ? <button className="button-secondary" type="button" onClick={() => setWizardStep((step) => Math.max(0, step - 1))}>Back</button> : null}
          {wizardStep < wizardSteps.length - 1 ? (
            <button className="toggle inline-flex items-center justify-center gap-2" type="button" onClick={() => setWizardStep((step) => Math.min(wizardSteps.length - 1, step + 1))}>Next</button>
          ) : (
            <button className="toggle inline-flex items-center justify-center gap-2" type="submit" disabled={!canCreateProjects}><Plus size={16} /> {editing ? 'Save Project' : 'Create Project'}</button>
          )}
          {editing ? <button className="button-secondary" type="button" onClick={() => { setEditing(null); setDraft(emptyProject); setWizardStep(0); }}>Cancel</button> : null}
        </div>
      </form>

      <div className="grid">
        <div className="card surface-card metric-card metric-card-compact">
          <div className="metric-card-top">
            <div className="stack-sm">
              <span className="metric-kicker">Projects</span>
              <h3>Total visible</h3>
            </div>
            <span className="metric-icon"><FolderKanban size={18} /></span>
          </div>
          <p className="metric">{projects.length}</p>
        </div>
        <div className="card surface-card metric-card metric-card-compact">
          <div className="metric-card-top">
            <div className="stack-sm">
              <span className="metric-kicker">Operations</span>
              <h3>Open incidents</h3>
            </div>
            <span className="metric-icon"><ShieldAlert size={18} /></span>
          </div>
          <p className="metric">{projects.reduce((sum, project) => sum + (project.openIncidents ?? 0), 0)}</p>
        </div>
        <div className="card surface-card metric-card metric-card-compact">
          <div className="metric-card-top">
            <div className="stack-sm">
              <span className="metric-kicker">Execution</span>
              <h3>Open tasks</h3>
            </div>
            <span className="metric-icon"><RadioTower size={18} /></span>
          </div>
          <p className="metric">{projects.reduce((sum, project) => sum + (project.openTasks ?? 0), 0)}</p>
        </div>
      </div>

      <div className="project-card-board">
        {projects.map((project, index) => (
          <article className="project-market-card" key={project.id}>
            <div className="project-market-head">
              <span className="project-logo">{project.name.slice(0, 2).toUpperCase()}</span>
              <span className={`status-badge ${project.openIncidents ? 'status-warning' : 'status-healthy'}`}>
                <span className="status-badge-dot" />
                {project.openIncidents ? 'Needs attention' : 'Healthy'}
              </span>
            </div>
            <h3>{project.name}</h3>
            <p>{project.serviceName || project.description || 'Production service'}</p>
            <div className="avatar-row" aria-label="Project teammates">
              {[0, 1, 2, 3].map((avatar) => <span key={avatar}>{String.fromCharCode(65 + ((index + avatar) % 26))}</span>)}
              <b>+{Math.max(1, (project.members?.length || 1) - 3)}</b>
            </div>
            <div className="project-market-stats">
              <div><strong>{project.members?.length || 1}</strong><span>teammates</span></div>
              <div><strong>{Math.max(4, (project.taskCount || 0) + 12)}</strong><span>deployments</span></div>
              <div><strong>{project.openIncidents ? '91%' : '98%'}</strong><span>uptime</span></div>
            </div>
            <Link className="project-open-link" to={`/app/projects/${project.id}`}>Open <ExternalLink size={15} /></Link>
          </article>
        ))}
        {!loading && !projects.length ? (
          <div className="empty-sellable-state project-market-empty">
            <strong>{canCreateProjects ? 'Create your first project' : 'No project access yet'}</strong>
            <span>{canCreateProjects ? 'Connect GitHub or add an app URL to start tracking deployments, health, and incidents.' : 'Ask an owner or project admin for access.'}</span>
            {canCreateProjects ? <button className="button mt-3" type="button" onClick={() => document.getElementById('create-project')?.scrollIntoView({ behavior: 'smooth' })}>Create Project</button> : null}
          </div>
        ) : null}
      </div>

      <div className="card surface-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Key</th>
              <th>Service</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Open Issues</th>
              <th>Open Incidents</th>
              <th>Team</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <div className="stack-sm">
                    <Link className="table-link font-semibold" to={`/app/projects/${project.id}`}>{project.name}</Link>
                    <span className="subtle">{project.description || 'No summary yet'}</span>
                  </div>
                </td>
                <td><span className="issue-key">{project.projectKey}</span></td>
                <td>{project.serviceName || 'Not mapped'}</td>
                <td>{project.owner}</td>
                <td><span className="badge">{project.status}</span></td>
                <td>{project.openTasks ?? 0}</td>
                <td>{project.openIncidents ?? 0}</td>
                <td>{project.members?.length || 1}</td>
                <td>
                  <div className="flex gap-2">
                    <Link className="button-secondary inline-flex items-center gap-2" title="Open project" to={`/app/projects/${project.id}`}><ExternalLink size={16} /> Open</Link>
                    <button className="icon-button" type="button" title="Edit project" disabled={!canManageProject(project)} onClick={() => startEdit(project)}><Edit3 size={16} /></button>
                    <button className="icon-button" type="button" title={canDeleteProject(project) ? 'Delete project' : 'Only project owners, project admins, and workspace admins can delete projects'} disabled={!canDeleteProject(project)} onClick={() => deleteProject(project)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !projects.length ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-sellable-state">
                    <strong>{canCreateProjects ? 'Create your first project' : 'No project access yet'}</strong>
                    <span>
                      {canCreateProjects
                      ? 'Add an app URL to start health checks and release tracking.'
                        : 'Ask an owner or project admin for access.'}
                    </span>
                    {!isWorkspaceAdmin ? <Link className="button-secondary inline-flex items-center justify-center gap-2 mt-3" to="/app/onboarding">View launch setup</Link> : null}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};
