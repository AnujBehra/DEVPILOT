import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus, Search, UsersRound } from 'lucide-react';
import { workspaceApi, type Project, type Task, type TaskStatus } from '../api/workspace';

const columns: Array<{ id: TaskStatus; title: string }> = [
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'REVIEW', title: 'In Review' },
  { id: 'DONE', title: 'Done' },
];

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('devpilot.user') || 'null') as { email?: string } | null;
  } catch {
    return null;
  }
};

const projectCacheKey = () => `devpilot.projects.cache:${String(readStoredUser()?.email || 'guest').toLowerCase()}`;
const saveCachedProjects = (projects: Project[]) => {
  localStorage.setItem(projectCacheKey(), JSON.stringify(projects));
};
const sortProjects = (projects: Project[]) =>
  [...projects].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
const visibleServerProjects = (serverProjects: Project[]) => sortProjects(serverProjects);

const taskKey = (project: Project | undefined, task: Task, index: number) =>
  `${project?.projectKey || 'TEAM'}-${index + 1}`;

export const TeamBoard = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasks
      .filter((task) => projectFilter === 'ALL' || task.projectId === projectFilter)
      .filter((task) => {
        if (!normalizedQuery) return true;
        const project = projectById.get(task.projectId);
        return [task.title, task.description, task.assignee, task.priority, task.status, project?.name, project?.projectKey]
          .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      });
  }, [projectById, projectFilter, query, tasks]);

  const load = () => {
    setLoading(true);
    Promise.all([workspaceApi.projects(), workspaceApi.tasks()])
      .then(([projectData, taskData]) => {
        const mergedProjects = visibleServerProjects(projectData.projects);
        setProjects(mergedProjects);
        saveCachedProjects(mergedProjects);
        setTasks(taskData.tasks.filter((task) => mergedProjects.some((project) => project.id === task.projectId)));
        setError('');
      })
      .catch((err) => {
        setProjects([]);
        setTasks([]);
        saveCachedProjects([]);
        setError(err instanceof Error ? err.message : 'Unable to load team board.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const moveTask = async (event: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    const taskId = event.dataTransfer.getData('taskId');
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    const previous = tasks;
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status } : item)));
    try {
      const { task: updated } = await workspaceApi.updateTask(task.id, { ...task, status });
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setError('');
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'Unable to move task.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="card hero-panel hero-panel-compact">
        <div className="hero-copy">
          <div>
            <h1>Board</h1>
            <p className="subtle">Issues across your projects.</p>
          </div>
          <div className="hero-meta">
            <span className="status-badge status-healthy"><UsersRound size={14} /> {projects.length} visible projects</span>
            <span className="badge">{visibleTasks.length} issues</span>
          </div>
        </div>
      </div>

      <div className="card surface-card command-board-controls">
        <label className="command-search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team board" />
        </label>
        <select className="editor min-h-0" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
          <option value="ALL">All projects</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button className="button-secondary inline-flex items-center gap-2" type="button" onClick={load}>
          <FolderKanban size={15} /> Refresh
        </button>
      </div>

        {loading ? <p className="subtle">Loading board...</p> : null}
      {error ? <p className="subtle">{error}</p> : null}

      {!projects.length && !loading ? (
        <div className="card surface-card empty-sellable-state">
          <strong>No projects yet</strong>
          <span>Create a project first, then the shared team board will show its issues here.</span>
          <Link className="toggle inline-flex items-center justify-center gap-2" to="/app/projects#create-project"><Plus size={16} /> Create Project</Link>
        </div>
      ) : (
        <div className="board-surface">
          <div className="board-toolbar">
            <div>
              <h3>Work queue</h3>
              <p className="subtle">Drag issues to update status.</p>
            </div>
          </div>
          <div className="kanban kanban-wide">
            {columns.map((column) => {
              const columnTasks = visibleTasks.filter((task) => task.status === column.id);
              return (
                <div key={column.id} className="kanban-column" onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveTask(event, column.id)}>
                  <div className="topbar"><h3>{column.title}</h3><span className="badge">{columnTasks.length}</span></div>
                  {columnTasks.map((task, index) => {
                    const project = projectById.get(task.projectId);
                    return (
                      <Link className="kanban-card" key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData('taskId', task.id)} to={`/app/projects/${task.projectId}`}>
                        <strong>{task.title}</strong>
                        <span className="issue-key">{taskKey(project, task, index)}</span>
                        <div className="hero-meta">
                          <span className="badge">{project?.name || 'Project'}</span>
                          <span className="subtle">{task.assignee || 'Unassigned'}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {!columnTasks.length ? <p className="subtle">No issues</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
