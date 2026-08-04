import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Bell, ClipboardList, Compass, FolderKanban, LayoutGrid, LineChart, Rocket, ShieldAlert, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import type { AuthUser } from '../pages/Login';
import { useRealtimeListener } from '../api/realtime';
import { workspaceApi, type Project } from '../api/workspace';

const navGroups = [
  {
    title: 'Workspace',
    items: [
      { label: 'Dashboard', path: '/app', icon: LayoutGrid, tone: 'blue' },
      { label: 'Projects', path: '/app/projects', icon: FolderKanban, tone: 'cyan' },
      { label: 'Board', path: '/app/team-board', icon: Rocket, tone: 'green' },
      { label: 'Analytics', path: '/app/analytics', icon: LineChart, tone: 'purple' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Monitoring', path: '/app/monitoring', icon: Activity, tone: 'green' },
      { label: 'Deployments', path: '/app/launch', icon: Sparkles, tone: 'blue' },
      { label: 'Incidents', path: '/app/monitoring#incidents', icon: ShieldAlert, tone: 'red' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Members', path: '/app/access', icon: UsersRound, tone: 'blue' },
      { label: 'Audit', path: '/app/audit', icon: ClipboardList, tone: 'gray' },
      { label: 'Settings', path: '/app/onboarding', icon: Compass, tone: 'gray' },
    ],
  },
];

type AppLayoutProps = {
  user: AuthUser | null;
};

type Notification = {
  id: string;
  type: string;
  title: string;
  detail: string;
  timestamp: string;
};

const notificationLabels: Record<string, string> = {
  'project.created': 'Project created',
  'task.created': 'Task created',
  'task.completed': 'Task completed',
  'deployment.created': 'Deployment created',
  'deployment.failed': 'Deployment failed',
  'incident.created': 'Incident created',
  'incident.resolved': 'Incident resolved',
  'project.health.failed': 'Health check failed',
  'comment.created': 'Comment created',
  'sprint.created': 'Sprint created',
  'code_metrics.synced': 'Code metrics synced',
  'alert_integration.created': 'Alert integration added',
  'backup.created': 'Backup created',
};
const notificationEvents = Object.keys(notificationLabels);

const eventTitle = (type: string, payload: any) => {
  if (type.startsWith('deployment')) return payload?.version || payload?.service || notificationLabels[type];
  if (type.startsWith('incident')) return payload?.title || notificationLabels[type];
  if (type.startsWith('task')) return payload?.title || notificationLabels[type];
  if (type.startsWith('project')) return payload?.name || payload?.appUrl || notificationLabels[type];
  return notificationLabels[type] || type;
};

const projectCacheKey = (email?: string) => `devpilot.projects.cache:${String(email || 'guest').toLowerCase()}`;
const deletedProjectCacheKey = (email?: string) => `devpilot.projects.deleted:${String(email || 'guest').toLowerCase()}`;
const saveCachedProjects = (email: string | undefined, projects: Project[]) => {
  localStorage.setItem(projectCacheKey(email), JSON.stringify(projects));
};
const readDeletedProjectIds = (email?: string) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(deletedProjectCacheKey(email)) || '[]') as string[]);
  } catch {
    return new Set<string>();
  }
};
const rememberDeletedProject = (email: string | undefined, id: string) => {
  const ids = readDeletedProjectIds(email);
  ids.add(id);
  localStorage.setItem(deletedProjectCacheKey(email), JSON.stringify(Array.from(ids)));
};
const sortProjects = (projects: Project[]) =>
  [...projects].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
const visibleServerProjects = (email: string | undefined, serverProjects: Project[]) => {
  const deletedIds = readDeletedProjectIds(email);
  return sortProjects(serverProjects.filter((project) => !deletedIds.has(project.id)));
};

export const AppLayout = ({ user }: AppLayoutProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const spacePath = '/app/team-board';

  useEffect(() => {
    Promise.all([workspaceApi.projects(), workspaceApi.notifications()])
      .then(([data, notificationData]) => {
        const freshProjects = visibleServerProjects(user?.email, data.projects);
        setProjects(freshProjects);
        saveCachedProjects(user?.email, freshProjects);
        setNotifications(notificationData.notifications.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          detail: item.detail,
          timestamp: item.timestamp,
        })));
      })
      .catch(() => {
        setProjects([]);
        saveCachedProjects(user?.email, []);
      });
  }, [user?.email]);

  useRealtimeListener(notificationEvents, (message) => {
    if (message.type === 'project.deleted' && message.payload?.id) {
      rememberDeletedProject(user?.email, message.payload.id);
      setProjects((current) => {
        const next = current.filter((project) => project.id !== message.payload.id);
        saveCachedProjects(user?.email, next);
        return next;
      });
    }
    setNotifications((current) => [{
      id: `${message.type}-${Date.now()}`,
      type: message.type,
      title: notificationLabels[message.type] || message.type,
      detail: eventTitle(message.type, message.payload),
      timestamp: new Date().toISOString(),
    }, ...current].slice(0, 20));
  });

  return (
  <TooltipProvider>
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="stack-sm">
          <NavLink to={spacePath} className="hero-meta sidebar-space-brand">
            <span className="metric-icon sidebar-brand-icon">
              <FolderKanban size={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold">DevPilot</h2>
            </div>
          </NavLink>
        </div>
        <div className="command-sidebar-section">
          <NavLink to={spacePath} className="command-space-pill">
            <Rocket size={16} />
            <span>Team board</span>
            <small>Open</small>
          </NavLink>
        </div>
        <div className="sidebar-nav-groups">
          {navGroups.map((group) => (
            <div className="sidebar-nav-group" key={group.title}>
              <span className="sidebar-nav-title">{group.title}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.path}
                        className={({ isActive }: { isActive: boolean }) =>
                          `nav-link ${isActive ? 'nav-link-active' : ''}`
                        }
                        data-tone={item.tone}
                        end={item.path === '/app'}
                      >
                        <span className="nav-link-icon">
                          <Icon size={16} />
                        </span>
                        {item.label}
                      </NavLink>
                    </TooltipTrigger>
                    <TooltipContent>{item.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
        <Card className="surface-card space-y-2 mt-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{user?.name || 'Signed in'}</h3>
            <Badge className="bg-success/15 text-success">Active</Badge>
          </div>
          <p className="text-xs text-muted">{user?.email || 'Local account'}</p>
        </Card>
      </aside>

      <main className="shell-main">
        <div className="notification-bar">
          <button className="notification-button" type="button" onClick={() => setOpen((value) => !value)} aria-label="Open notifications">
            <Bell size={16} />
            {notifications.length ? <span>{notifications.length}</span> : null}
          </button>
          {open ? (
            <div className="notification-panel">
              <div className="notification-panel-head">
                <strong>Notifications</strong>
                {notifications.length ? <button className="text-button" type="button" onClick={() => setNotifications([])}>Clear</button> : null}
                <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={14} /></button>
              </div>
              <div className="notification-list">
                {notifications.map((item) => (
                  <div className="notification-item" key={item.id}>
                    <span className={`health-dot ${item.type.includes('failed') || item.type.includes('incident.created') ? 'health-dot-bad' : 'health-dot-ok'}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <p className="subtle">{item.detail} · {new Date(item.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
                {!notifications.length ? <p className="subtle">No live events yet.</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        <Outlet />
      </main>
    </div>
  </TooltipProvider>
  );
};
