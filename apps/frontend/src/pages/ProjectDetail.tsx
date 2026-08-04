import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, BellRing, Boxes, ClipboardCheck, Copy, ExternalLink, FileText, FolderKanban, Gauge, GitBranch, Link2, Plus, Search, ShieldAlert, Siren, Trash2, UserPlus, Users, Waypoints, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { absoluteApiUrl } from '../api/client';
import { workspaceApi, type AlertIntegration, type AlertRule, type BackupRecord, type CodeMetric, type Deployment, type Incident, type OnCallSchedule, type Priority, type ProductFeatures, type Project, type ProjectComment, type ProjectEnvironment, type ProjectHealthCheck, type ProjectInvite, type ProjectMember, type ProjectRole, type ReleaseApproval, type SloRecord, type Sprint, type StatusPage, type Task, type TaskStatus, type TenantProfile } from '../api/workspace';
import { useRealtimeListener } from '../api/realtime';

const tabs = ['Summary', 'Issues', 'Board', 'Releases', 'Incidents', 'Analytics', 'Reliability', 'Collaboration', 'Planning', 'Integrations', 'Monitoring'] as const;
const statuses: Array<{ id: TaskStatus; title: string }> = [
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'REVIEW', title: 'In Review' },
  { id: 'DONE', title: 'Done' },
];
const deploymentProviders: Deployment['provider'][] = ['Manual', 'Vercel', 'GitHub Actions', 'Railway', 'Render', 'Other'];
const deploymentPlatforms: Project['deploymentPlatform'][] = ['GitHub Pages', 'Vercel', 'Railway', 'Render', 'Other'];
const projectRoles: ProjectRole[] = ['owner', 'admin', 'member', 'viewer'];
const grafanaVisualUrl = import.meta.env.VITE_OPEN_GRAFANA_DASHBOARD_URL
  || import.meta.env.VITE_OPEN_GRAFANA_URL
  || 'https://punyviper1770.grafana.net';
const grafanaProjectUrl = (project: Project) => {
  try {
    const url = new URL(grafanaVisualUrl, window.location.origin);
    url.searchParams.set('var-project_id', project.id);
    url.searchParams.set('var-project_name', project.name);
    url.searchParams.set('var-service', project.serviceName || project.name);
    return url.toString();
  } catch {
    const separator = grafanaVisualUrl.includes('?') ? '&' : '?';
    return `${grafanaVisualUrl}${separator}var-project_id=${encodeURIComponent(project.id)}&var-project_name=${encodeURIComponent(project.name)}`;
  }
};
const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('devpilot.user') || 'null') as { name?: string; email?: string; role?: string } | null;
  } catch {
    return null;
  }
};
const normalizeUrlInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
};
const detectDeploymentPlatform = (value: string): Project['deploymentPlatform'] => {
  try {
    const hostname = new URL(normalizeUrlInput(value)).hostname.toLowerCase();
    if (hostname.endsWith('github.io')) return 'GitHub Pages';
    if (hostname.endsWith('vercel.app')) return 'Vercel';
    if (hostname.includes('railway.app') || hostname.includes('up.railway.app')) return 'Railway';
    if (hostname.endsWith('onrender.com')) return 'Render';
  } catch {
    return 'Other';
  }
  return 'Other';
};
const providerInstructions: Record<Project['deploymentPlatform'], string> = {
  'GitHub Pages': 'Add this webhook in GitHub repository settings.',
  Vercel: 'Add this webhook in Vercel project settings.',
  Railway: 'Add this webhook in Railway project settings.',
  Render: 'Add this webhook in Render service settings.',
  Other: 'Add this webhook in your deployment platform.',
};
const projectCode = (project: Project) => project.projectKey || 'PROJ';
const issueKey = (project: Project, task: Task, index: number) => `${projectCode(project)}-${index + 1}`;
const priorityTone = (priority: Priority) => {
  if (priority === 'Critical') return 'priority-critical';
  if (priority === 'High') return 'priority-high';
  if (priority === 'Medium') return 'priority-medium';
  return 'priority-low';
};
const webhookPlatformSlug = (platform: Project['deploymentPlatform']) => {
  if (platform === 'GitHub Pages') return 'github-pages';
  return platform.toLowerCase();
};
const resolveDeploymentLink = (project: Project, deployment: Deployment) => {
  if (!project.appUrl && !deployment.deploymentUrl) return '';
  if (!deployment.deploymentUrl) return project.appUrl || '';

  try {
    const deploymentHost = new URL(deployment.deploymentUrl).hostname.toLowerCase();
    const projectHost = project.appUrl ? new URL(project.appUrl).hostname.toLowerCase() : '';

    if (project.appUrl && project.deploymentPlatform === 'GitHub Pages' && !deploymentHost.endsWith('github.io')) {
      return project.appUrl;
    }
    if (project.appUrl && project.deploymentPlatform !== 'Vercel' && (deploymentHost.endsWith('vercel.app') || deploymentHost.endsWith('vercel.com'))) {
      return project.appUrl;
    }
    if (project.appUrl && projectHost && deploymentHost !== projectHost && project.deploymentPlatform !== 'Other') {
      return project.appUrl;
    }
  } catch {
    return project.appUrl || deployment.deploymentUrl;
  }

  return deployment.deploymentUrl;
};

type DeploymentDraft = {
  provider: Deployment['provider'];
  service: string;
  version: string;
  environment: Deployment['environment'];
  status: Deployment['status'];
  deploymentUrl: string;
  commitSha: string;
  branch: string;
  triggeredBy: string;
  externalId: string;
  startedAt: string;
};

export const ProjectDetail = () => {
  const { id = '' } = useParams();
  const currentUser = readStoredUser();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Board');
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [healthChecks, setHealthChecks] = useState<ProjectHealthCheck[]>([]);
  const [features, setFeatures] = useState<ProductFeatures | null>(null);
  const [loadError, setLoadError] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedProjectLink, setCopiedProjectLink] = useState(false);
  const [appUrlDraft, setAppUrlDraft] = useState('');
  const [deploymentPlatformDraft, setDeploymentPlatformDraft] = useState<Project['deploymentPlatform']>('Other');
  const [memberDrafts, setMemberDrafts] = useState<ProjectMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [projectInvites, setProjectInvites] = useState<ProjectInvite[]>([]);
  const [issueStatusFilter, setIssueStatusFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [issuePriorityFilter, setIssuePriorityFilter] = useState<'ALL' | Priority>('ALL');
  const [boardSearch, setBoardSearch] = useState('');
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '', assignee: '', priority: 'Medium' as Priority, status: 'TODO' as TaskStatus });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [incidentDraft, setIncidentDraft] = useState({ title: '', description: '', severity: 'Medium' as Priority, service: 'api-gateway' });
  const [deploymentDraft, setDeploymentDraft] = useState({
    provider: 'Manual' as Deployment['provider'],
    service: '',
    version: '',
    environment: 'staging' as Deployment['environment'],
    status: 'Queued' as Deployment['status'],
    deploymentUrl: '',
    commitSha: '',
    branch: '',
    triggeredBy: '',
    externalId: '',
    startedAt: new Date().toISOString().slice(0, 16),
  } satisfies DeploymentDraft);
  const [commentDraft, setCommentDraft] = useState('');
  const [sprintDraft, setSprintDraft] = useState({
    name: '',
    goal: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10),
    capacity: 20,
    status: 'Planned' as Sprint['status'],
  });
  const [codeMetricDraft, setCodeMetricDraft] = useState({
    provider: 'GitHub' as CodeMetric['provider'],
    repository: '',
    branch: 'main',
    commits: 0,
    pullRequests: 0,
    openIssues: 0,
    coverage: 0,
    deploymentFrequency: 0,
    leadTimeHours: 0,
    sourceUrl: '',
  });
  const [alertDraft, setAlertDraft] = useState({
    provider: 'Slack' as AlertIntegration['provider'],
    channel: '#deployments',
    webhookUrl: '',
    enabled: true,
  });
  const [tenantDraft, setTenantDraft] = useState<Partial<TenantProfile>>({});
  const [backupStatus, setBackupStatus] = useState('');
  const [sloDraft, setSloDraft] = useState({ name: 'Availability SLO', target: 99.9, current: 99.9, windowDays: 30 });
  const [approvalDraft, setApprovalDraft] = useState({ title: '', deploymentId: '', notes: '' });
  const [statusPageDraft, setStatusPageDraft] = useState<Partial<StatusPage>>({ status: 'Operational', message: 'All monitored systems are operational.' });
  const [onCallDraft, setOnCallDraft] = useState<Partial<OnCallSchedule>>({ primary: '', secondary: '', escalationMinutes: 15, rotation: 'Weekly', timezone: 'Asia/Kolkata' });
  const [alertRuleDraft, setAlertRuleDraft] = useState<Partial<AlertRule>>({ name: 'Health failure escalation', condition: 'health_failures', threshold: 3, channel: '#alerts', enabled: true });
  const [environmentDraft, setEnvironmentDraft] = useState<Partial<ProjectEnvironment>>({ name: 'Production', appUrl: '', healthStatus: 'unknown' });

  const load = () => {
    workspaceApi.projectSummary(id)
      .then(async (data) => {
        const featureData = await workspaceApi.productFeatures(id).catch(() => null);
        setProject(data.project);
        setTasks(data.tasks);
        setDeployments(data.deployments);
        setIncidents(data.incidents);
        setHealthChecks(data.healthChecks);
        setFeatures(featureData);
        setProjectInvites(featureData?.invites || []);
        if (featureData?.tenant) setTenantDraft(featureData.tenant);
        setLoadError('');
      })
      .catch((error) => {
        setProject(null);
        setTasks([]);
        setDeployments([]);
        setIncidents([]);
        setHealthChecks([]);
        setFeatures(null);
        setProjectInvites([]);
        setLoadError(error instanceof Error && error.message
          ? error.message
          : 'Project not found. Open Projects to select a project available to your team.');
      });
  };

  // Subscribe to real-time updates
  useRealtimeListener(['task.created', 'task.updated', 'task.deleted', 'deployment.created', 'incident.created', 'incident.updated', 'project.updated', 'project.health.checked', 'comment.created', 'sprint.created', 'sprint.updated', 'code_metrics.synced', 'alert_integration.created', 'backup.created'], (message) => {
    // Re-fetch data when updates arrive
    if (message.payload?.projectId === id || message.type.startsWith('project')) {
      load();
    }
  });

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15000);
    return () => window.clearInterval(interval);
  }, [id]);

  useEffect(() => {
    setAppUrlDraft(project?.appUrl || '');
    setDeploymentPlatformDraft(project?.deploymentPlatform || detectDeploymentPlatform(project?.appUrl || ''));
    setMemberDrafts(project?.members || []);
  }, [project?.id, project?.deploymentPlatform, project?.appUrl, project?.members]);

  useEffect(() => {
    if (features?.statusPages?.[0]) setStatusPageDraft(features.statusPages[0]);
    if (features?.onCall?.[0]) setOnCallDraft(features.onCall[0]);
    if (features?.environments?.[0]) setEnvironmentDraft({ name: features.environments[0].name, appUrl: features.environments[0].appUrl, deploymentWebhookUrl: features.environments[0].deploymentWebhookUrl, healthStatus: features.environments[0].healthStatus });
    if (features?.slos?.[0]) {
      const slo = features.slos[0];
      setSloDraft({ name: slo.name, target: slo.target, current: slo.current, windowDays: slo.windowDays });
    }
  }, [features?.statusPages, features?.onCall, features?.slos, features?.environments]);

  const summary = useMemo(() => ({
    totalTasks: tasks.length,
    openTasks: tasks.filter((task) => task.status !== 'DONE').length,
    completedTasks: tasks.filter((task) => task.status === 'DONE').length,
    openIncidents: incidents.filter((incident) => incident.status !== 'Resolved').length,
    deployments: deployments.length,
  }), [tasks, incidents, deployments]);
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const statusMatches = issueStatusFilter === 'ALL' || task.status === issueStatusFilter;
    const priorityMatches = issuePriorityFilter === 'ALL' || task.priority === issuePriorityFilter;
    return statusMatches && priorityMatches;
  }), [tasks, issuePriorityFilter, issueStatusFilter]);
  const boardTasks = useMemo(() => {
    const query = boardSearch.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) =>
      [task.title, task.description, task.assignee, task.priority, task.status]
        .some((value) => String(value || '').toLowerCase().includes(query)),
    );
  }, [boardSearch, tasks]);
  const currentMembership = useMemo(() => {
    const email = String(currentUser?.email || '').trim().toLowerCase();
    if (!email || !project) return undefined;
    return (project.members || []).find((member) => member.email.toLowerCase() === email)
      || (project.ownerEmail?.toLowerCase() === email ? { email, name: project.owner, role: 'owner' as const } : undefined);
  }, [currentUser?.email, project]);
  const isWorkspaceAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const canManageAccess = isWorkspaceAdmin || currentMembership?.role === 'owner' || currentMembership?.role === 'admin';
  const canEditContent = isWorkspaceAdmin || currentMembership?.role === 'owner' || currentMembership?.role === 'admin' || currentMembership?.role === 'member';
  const projectRole = isWorkspaceAdmin ? currentUser?.role || 'admin' : currentMembership?.role || 'viewer';
  const effectiveDeploymentPlatform = deploymentPlatformDraft || project?.deploymentPlatform || 'Other';
  const deploymentWebhookUrl = project?.deploymentWebhookToken
    ? absoluteApiUrl(`/webhooks/deployments/${webhookPlatformSlug(effectiveDeploymentPlatform)}/${project.deploymentWebhookToken}`)
    : '';

  const copyDeploymentWebhook = async () => {
    if (!deploymentWebhookUrl) return;
    await navigator.clipboard.writeText(deploymentWebhookUrl);
    setCopiedWebhook(true);
    window.setTimeout(() => setCopiedWebhook(false), 1800);
  };

  const copyProjectLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopiedProjectLink(true);
    window.setTimeout(() => setCopiedProjectLink(false), 1800);
  };

  const saveAppUrl = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !appUrlDraft.trim()) return;
    const normalizedAppUrl = normalizeUrlInput(appUrlDraft);
    const { project: updated } = await workspaceApi.updateProject(project.id, {
      appUrl: normalizedAppUrl,
      deploymentPlatform: deploymentPlatformDraft === 'Other' ? detectDeploymentPlatform(normalizedAppUrl) : deploymentPlatformDraft,
    });
    setProject(updated);
    setAppUrlDraft(updated.appUrl || '');
    setDeploymentPlatformDraft(updated.deploymentPlatform || 'Other');
  };

  const updateMemberRole = (email: string, role: ProjectRole) => {
    setMemberDrafts((current) => current.map((member) => (
      member.email === email
        ? { ...member, role: member.role === 'owner' ? 'owner' : role }
        : member
    )));
  };

  const removeMember = (email: string) => {
    setMemberDrafts((current) => current.filter((member) => member.email !== email || member.role === 'owner'));
  };

  const addMember = async () => {
    if (!project) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    const role = inviteRole === 'owner' ? 'member' : inviteRole;
    const result = await workspaceApi.createProjectInvite(project.id, { email, role });
    setProject(result.project);
    setMemberDrafts(result.project.members || []);
    setProjectInvites((current) => [result.invite, ...current.filter((invite) => invite.id !== result.invite.id)]);
    setInviteLink(new URL(result.inviteUrl, window.location.origin).toString());
    setInviteEmail('');
    setInviteRole('member');
  };

  const saveMembers = async () => {
    if (!project) return;
    const { project: updated } = await workspaceApi.updateProject(project.id, { members: memberDrafts });
    setProject(updated);
    setMemberDrafts(updated.members || []);
  };

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!taskDraft.title.trim()) return;
    if (editingTask) {
      const { task } = await workspaceApi.updateTask(editingTask.id, taskDraft);
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
      setEditingTask(null);
    } else {
      const { task } = await workspaceApi.createTask({ ...taskDraft, projectId: id, type: 'Task', points: 1, labels: [] });
      setTasks((current) => [task, ...current]);
    }
    setTaskDraft({ title: '', description: '', assignee: '', priority: 'Medium', status: 'TODO' });
  };

  const editTask = (task: Task) => {
    setEditingTask(task);
    setTaskDraft({ title: task.title, description: task.description, assignee: task.assignee, priority: task.priority, status: task.status });
  };

  const deleteTask = async (task: Task) => {
    await workspaceApi.deleteTask(task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));
  };

  const moveTask = (event: DragEvent<HTMLDivElement>, status: TaskStatus) => {
    const taskId = event.dataTransfer.getData('taskId');
    if (!taskId) return;
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!currentTask) return;
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    workspaceApi.updateTask(taskId, { ...currentTask, status }).then(({ task }) => setTasks((current) => current.map((item) => (item.id === task.id ? task : item))));
  };

  const createIncident = async (event: FormEvent) => {
    event.preventDefault();
    if (!incidentDraft.title.trim()) return;
    const { incident } = await workspaceApi.createIncident({ ...incidentDraft, projectId: id, status: 'Open' });
    setIncidents((current) => [incident, ...current]);
    setIncidentDraft({ title: '', description: '', severity: 'Medium', service: 'api-gateway' });
  };

  const updateIncident = async (incident: Incident, status: Incident['status']) => {
    const { incident: updated } = await workspaceApi.updateIncident(incident.id, { status });
    setIncidents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const createDeployment = async (event: FormEvent) => {
    event.preventDefault();
    if (!deploymentDraft.service.trim() || !deploymentDraft.version.trim()) return;
    const { deployment } = await workspaceApi.createDeployment({
      ...deploymentDraft,
      projectId: id,
      startedAt: new Date(deploymentDraft.startedAt).toISOString(),
    });
    setDeployments((current) => [deployment, ...current]);
    setDeploymentDraft({
      provider: 'Manual',
      service: project?.serviceName || '',
      version: '',
      environment: 'staging',
      status: 'Queued',
      deploymentUrl: '',
      commitSha: '',
      branch: '',
      triggeredBy: '',
      externalId: '',
      startedAt: new Date().toISOString().slice(0, 16),
    });
  };

  const createComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!commentDraft.trim()) return;
    const { comment } = await workspaceApi.createComment(id, { body: commentDraft });
    setFeatures((current) => current ? { ...current, comments: [comment, ...current.comments] } : current);
    setCommentDraft('');
  };

  const createSprint = async (event: FormEvent) => {
    event.preventDefault();
    if (!sprintDraft.name.trim()) return;
    const { sprint } = await workspaceApi.createSprint(id, sprintDraft);
    setFeatures((current) => current ? { ...current, sprints: [sprint, ...current.sprints] } : current);
    setSprintDraft({
      name: '',
      goal: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10),
      capacity: 20,
      status: 'Planned',
    });
  };

  const updateSprintStatus = async (sprint: Sprint, status: Sprint['status']) => {
    const { sprint: updated } = await workspaceApi.updateSprint(id, sprint.id, { status });
    setFeatures((current) => current ? { ...current, sprints: current.sprints.map((item) => (item.id === updated.id ? updated : item)) } : current);
  };

  const saveCodeMetrics = async (event: FormEvent) => {
    event.preventDefault();
    if (!codeMetricDraft.repository.trim()) return;
    const { codeMetric } = await workspaceApi.upsertCodeMetric(id, codeMetricDraft);
    setFeatures((current) => current ? { ...current, codeMetrics: [codeMetric, ...current.codeMetrics.filter((item) => item.id !== codeMetric.id)] } : current);
  };

  const syncGitHubMetrics = async () => {
    if (!codeMetricDraft.repository.trim()) return;
    const { codeMetric } = await workspaceApi.syncGitHubRepository(id, codeMetricDraft.repository);
    setFeatures((current) => current ? { ...current, codeMetrics: [codeMetric, ...current.codeMetrics.filter((item) => item.id !== codeMetric.id)] } : current);
    setCodeMetricDraft({
      provider: 'GitHub',
      repository: codeMetric.repository,
      branch: codeMetric.branch,
      commits: codeMetric.commits,
      pullRequests: codeMetric.pullRequests,
      openIssues: codeMetric.openIssues,
      coverage: codeMetric.coverage,
      deploymentFrequency: codeMetric.deploymentFrequency,
      leadTimeHours: codeMetric.leadTimeHours,
      sourceUrl: codeMetric.sourceUrl,
    });
  };

  const createAlertIntegration = async (event: FormEvent) => {
    event.preventDefault();
    if (!alertDraft.channel.trim()) return;
    const { alertIntegration } = await workspaceApi.createAlertIntegration(id, alertDraft);
    setFeatures((current) => current ? { ...current, alertIntegrations: [alertIntegration, ...current.alertIntegrations] } : current);
    setAlertDraft({ provider: 'Slack', channel: '#deployments', webhookUrl: '', enabled: true });
  };

  const testAlertIntegration = async (integration: AlertIntegration) => {
    await workspaceApi.testAlertIntegration(id, integration.id, `DevPilot alert test for ${project?.name || 'project'}`);
    load();
  };

  const saveTenant = async () => {
    const { tenant } = await workspaceApi.updateTenant(tenantDraft);
    setFeatures((current) => current ? { ...current, tenant } : current);
    setTenantDraft(tenant);
  };

  const createBackup = async () => {
    setBackupStatus('Creating backup...');
    const { backup } = await workspaceApi.createBackup();
    setFeatures((current) => current ? { ...current, backups: [backup, ...current.backups] } : current);
    setBackupStatus(`Backup created: ${backup.fileName}`);
  };

  const generateIncidentInsight = async (incident: Incident) => {
    const { insight } = await workspaceApi.generateIncidentInsight(id, incident.id);
    setFeatures((current) => current ? { ...current, incidentAssistant: [insight, ...current.incidentAssistant] } : current);
  };

  const generatePostmortem = async (incident: Incident) => {
    const { postmortem } = await workspaceApi.generatePostmortem(id, incident.id);
    setFeatures((current) => current ? { ...current, postmortems: [postmortem, ...current.postmortems] } : current);
  };

  const saveSlo = async (event: FormEvent) => {
    event.preventDefault();
    const { slo } = await workspaceApi.upsertSlo(id, sloDraft);
    setFeatures((current) => current ? { ...current, slos: [slo, ...current.slos.filter((item) => item.id !== slo.id)] } : current);
  };

  const createClientReport = async (format: 'Weekly' | 'Monthly') => {
    const { report } = await workspaceApi.createClientReport(id, format);
    setFeatures((current) => current ? { ...current, clientReports: [report, ...current.clientReports] } : current);
  };

  const createReleaseApproval = async (event: FormEvent) => {
    event.preventDefault();
    if (!approvalDraft.title.trim()) return;
    const { approval } = await workspaceApi.createReleaseApproval(id, approvalDraft);
    setFeatures((current) => current ? { ...current, releaseApprovals: [approval, ...current.releaseApprovals] } : current);
    setApprovalDraft({ title: '', deploymentId: '', notes: '' });
  };

  const updateReleaseApproval = async (approval: ReleaseApproval, status: ReleaseApproval['status']) => {
    const { approval: updated } = await workspaceApi.updateReleaseApproval(id, approval.id, { status });
    setFeatures((current) => current ? { ...current, releaseApprovals: current.releaseApprovals.map((item) => item.id === updated.id ? updated : item) } : current);
  };

  const saveStatusPage = async () => {
    const { statusPage } = await workspaceApi.updateStatusPage(id, statusPageDraft);
    setFeatures((current) => current ? { ...current, statusPages: [statusPage, ...current.statusPages.filter((item) => item.id !== statusPage.id)] } : current);
  };

  const saveOnCall = async () => {
    const { schedule } = await workspaceApi.updateOnCall(id, onCallDraft);
    setFeatures((current) => current ? { ...current, onCall: [schedule, ...current.onCall.filter((item) => item.id !== schedule.id)] } : current);
  };

  const createAlertRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!alertRuleDraft.name?.trim()) return;
    const { rule, evaluations } = await workspaceApi.createAlertRule(id, alertRuleDraft);
    setFeatures((current) => current ? { ...current, alertRules: [rule, ...current.alertRules], alertEvaluations: [...evaluations, ...current.alertEvaluations] } : current);
  };

  const saveEnvironment = async (event: FormEvent) => {
    event.preventDefault();
    if (!environmentDraft.name?.trim()) return;
    const { environment } = await workspaceApi.upsertEnvironment(id, environmentDraft);
    setFeatures((current) => current ? { ...current, environments: [environment, ...current.environments.filter((item) => item.id !== environment.id)] } : current);
  };

  useEffect(() => {
    if (project && !deploymentDraft.service) {
      setDeploymentDraft((current) => ({ ...current, service: project.serviceName }));
    }
    if (project && incidentDraft.service === 'api-gateway' && project.serviceName) {
      setIncidentDraft((current) => ({ ...current, service: project.serviceName }));
    }
  }, [project]);

  if (!project) {
    return <div className="card"><h2>{loadError ? 'Project unavailable' : 'Loading project'}</h2>{loadError ? <p className="subtle">{loadError}</p> : null}</div>;
  }

  return (
    <div className="space-y-6 command-project-screen">
      <div className="command-project-header">
        <span className="command-breadcrumb"><Link to="/app/projects">Projects</Link> / {project.projectKey}</span>
        <div className="command-title-row">
          <div className="hero-meta">
            <span className="command-project-icon">{project.projectKey.slice(0, 2) || 'DP'}</span>
            <div>
              <h1>{project.name}</h1>
              <p>{project.owner} · {project.serviceName || 'No service mapped yet'} · {(project.members || []).length} team member{(project.members || []).length === 1 ? '' : 's'}</p>
            </div>
          </div>
          <div className="hero-actions">
            <button className="button-secondary inline-flex items-center gap-2" type="button" onClick={copyProjectLink}><Copy size={16} /> {copiedProjectLink ? 'Copied' : 'Copy Link'}</button>
            {project.appUrl ? <a className="button-secondary inline-flex items-center gap-2" href={project.appUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open App</a> : null}
          </div>
        </div>
      </div>
      <div className="card hero-panel hero-panel-compact project-legacy-summary">
        <div className="hero-copy">
          <div>
            <h1>{project.name}</h1>
            <p className="subtle">{project.description || 'Manage issues, releases, incidents, and monitoring.'}</p>
          </div>
          <div className="hero-meta">
            <StatusBadge value={project.status} />
            <span className="issue-key">{project.projectKey}</span>
            <span className="role-pill">{projectRole}</span>
            <span className="subtle">{project.owner} · {project.serviceName || 'No service mapped yet'} · {(project.members || []).length} team member{(project.members || []).length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      {!canEditContent && activeTab !== 'Board' ? (
        <div className="read-only-banner">
          <strong>Read-only access</strong>
          <span>Editing is disabled.</span>
        </div>
      ) : null}

      {activeTab !== 'Board' ? <ProjectSetupPanel
        project={project}
        appUrlDraft={appUrlDraft}
        setAppUrlDraft={setAppUrlDraft}
        deploymentPlatformDraft={deploymentPlatformDraft}
        setDeploymentPlatformDraft={setDeploymentPlatformDraft}
        webhookUrl={deploymentWebhookUrl}
        copied={copiedWebhook}
        onCopy={copyDeploymentWebhook}
        onSaveAppUrl={saveAppUrl}
        memberDrafts={memberDrafts}
        canManageAccess={canManageAccess}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        inviteLink={inviteLink}
        projectInvites={projectInvites}
        onAddMember={addMember}
        onRemoveMember={removeMember}
        onUpdateMemberRole={updateMemberRole}
        onSaveMembers={saveMembers}
      /> : null}

      <div className="tabs">
        {tabs.map((tab) => (
          <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'tab-button-active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>

      {activeTab === 'Summary' ? (
        <div className="space-y-6">
          <div className="grid">
            <div className="card surface-card metric-card">
              <div className="metric-card-top">
                <div className="stack-sm">
                  <span className="metric-kicker">Project information</span>
                  <h3>Project snapshot</h3>
                </div>
                <span className="metric-icon"><Link2 size={18} /></span>
              </div>
              <div className="stack-sm">
                <p className="subtle">Service: {project.serviceName || 'Not mapped'}</p>
                <p className="subtle">App URL: {project.appUrl || 'Not configured'}</p>
                <p className="subtle">Deployment platform: {project.deploymentPlatform}</p>
              </div>
            </div>
            <MetricTile label="Open Issues" value={summary.openTasks} helper={`${summary.completedTasks} completed`} icon={FolderKanban} />
            <MetricTile label="Releases" value={summary.deployments} helper="Tracked for this project" icon={GitBranch} />
            <MetricTile label="Open Incidents" value={summary.openIncidents} helper="Operational issues still active" icon={Siren} />
          </div>
          <ProjectHealthPanel project={project} healthChecks={healthChecks} />
        </div>
      ) : null}

      {activeTab === 'Issues' ? (
        <div className="space-y-6">
          <TaskForm draft={taskDraft} setDraft={setTaskDraft} editing={Boolean(editingTask)} onSubmit={saveTask} assigneeOptions={(project.members || []).map((member) => member.email)} disabled={!canEditContent} />
          <div className="card surface-card">
            <div className="topbar">
              <div>
                <h3>Issue Backlog</h3>
                <p className="subtle">Filter and prioritize issues.</p>
              </div>
              <div className="hero-actions">
                <select className="editor min-h-0" style={{ minWidth: 150 }} value={issueStatusFilter} onChange={(event) => setIssueStatusFilter(event.target.value as 'ALL' | TaskStatus)}>
                  <option value="ALL">All statuses</option>
                  {statuses.map((status) => <option key={status.id} value={status.id}>{status.title}</option>)}
                </select>
                <select className="editor min-h-0" style={{ minWidth: 150 }} value={issuePriorityFilter} onChange={(event) => setIssuePriorityFilter(event.target.value as 'ALL' | Priority)}>
                  <option value="ALL">All priorities</option>
                  {['Low', 'Medium', 'High', 'Critical'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </div>
            </div>
          </div>
          <TaskTable project={project} tasks={filteredTasks} onEdit={editTask} onDelete={deleteTask} onStatus={(task, status) => workspaceApi.updateTask(task.id, { ...task, status }).then(({ task: updated }) => setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item))))} disabled={!canEditContent} />
        </div>
      ) : null}

      {activeTab === 'Board' ? (
        <div className="board-surface">
          <div className="board-toolbar">
            <div>
              <h3>Board</h3>
              <p className="subtle">Track team work across status columns.</p>
            </div>
            <div className="command-board-actions">
              <span className="badge">{summary.openTasks} open issues</span>
            </div>
          </div>
          <div className="command-board-controls">
            <label className="command-search-box">
              <Search size={16} />
              <input value={boardSearch} onChange={(event) => setBoardSearch(event.target.value)} placeholder="Search board" />
            </label>
            <span className="command-avatar">{(currentUser?.name || currentUser?.email || 'U').slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="kanban kanban-wide">
            {statuses.map((column) => (
              <div key={column.id} className="kanban-column" onDragOver={(event) => canEditContent && event.preventDefault()} onDrop={(event) => canEditContent && moveTask(event, column.id)}>
                <div className="topbar"><h3>{column.title}</h3><span className="badge">{boardTasks.filter((task) => task.status === column.id).length}</span></div>
                {boardTasks.filter((task) => task.status === column.id).map((task, index) => (
                  <div className="kanban-card" key={task.id} draggable={canEditContent} onDragStart={(event) => canEditContent && event.dataTransfer.setData('taskId', task.id)}>
                    <strong>{task.title}</strong>
                    <span className="issue-key">{issueKey(project, task, index)}</span>
                    <div className="hero-meta">
                      <span className={`priority-pill ${priorityTone(task.priority)}`}>{task.priority}</span>
                      <span className="subtle">{task.assignee || 'Unassigned'}</span>
                    </div>
                  </div>
                ))}
                {canEditContent && column.id === 'TODO' ? <button className="command-create-card" type="button" onClick={() => setActiveTab('Issues')}><Plus size={15} /> Create</button> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'Releases' ? (
        <div className="space-y-6">
          <DeploymentWebhookSetup webhookUrl={deploymentWebhookUrl} copied={copiedWebhook} onCopy={copyDeploymentWebhook} platform={effectiveDeploymentPlatform} />
          <DeploymentForm draft={deploymentDraft} setDraft={setDeploymentDraft} onSubmit={createDeployment} disabled={!canEditContent} />
          <DeploymentTable deployments={deployments} project={project} />
        </div>
      ) : null}

      {activeTab === 'Incidents' ? (
        <div className="space-y-6">
          <form className="card surface-card grid gap-3 md:grid-cols-[1fr_1fr_160px_auto]" onSubmit={createIncident}>
            <input className="editor min-h-0" placeholder="Incident title" value={incidentDraft.title} onChange={(event) => setIncidentDraft({ ...incidentDraft, title: event.target.value })} disabled={!canEditContent} />
            <input className="editor min-h-0" placeholder="Service" value={incidentDraft.service} onChange={(event) => setIncidentDraft({ ...incidentDraft, service: event.target.value })} disabled={!canEditContent} />
            <select className="editor min-h-0" value={incidentDraft.severity} onChange={(event) => setIncidentDraft({ ...incidentDraft, severity: event.target.value as Priority })} disabled={!canEditContent}>{['Low', 'Medium', 'High', 'Critical'].map((severity) => <option key={severity}>{severity}</option>)}</select>
            <button className="toggle inline-flex items-center justify-center gap-2" type="submit" disabled={!canEditContent}><Plus size={16} /> Create</button>
            <textarea className="editor md:col-span-4" placeholder="Description" value={incidentDraft.description} onChange={(event) => setIncidentDraft({ ...incidentDraft, description: event.target.value })} disabled={!canEditContent} />
          </form>
          <IncidentTable incidents={incidents} onUpdate={updateIncident} disabled={!canEditContent} />
        </div>
      ) : null}

      {activeTab === 'Analytics' ? <ProjectAnalytics tasks={tasks} deployments={deployments} incidents={incidents} summary={summary} /> : null}

      {activeTab === 'Reliability' ? (
        <ReliabilityPanel
          project={project}
          incidents={incidents}
          deployments={deployments}
          tasks={tasks}
          healthChecks={healthChecks}
          features={features}
          sloDraft={sloDraft}
          setSloDraft={setSloDraft}
          onSaveSlo={saveSlo}
          approvalDraft={approvalDraft}
          setApprovalDraft={setApprovalDraft}
          onCreateApproval={createReleaseApproval}
          onUpdateApproval={updateReleaseApproval}
          statusPageDraft={statusPageDraft}
          setStatusPageDraft={setStatusPageDraft}
          onSaveStatusPage={saveStatusPage}
          onCallDraft={onCallDraft}
          setOnCallDraft={setOnCallDraft}
          onSaveOnCall={saveOnCall}
          alertRuleDraft={alertRuleDraft}
          setAlertRuleDraft={setAlertRuleDraft}
          onCreateAlertRule={createAlertRule}
          environmentDraft={environmentDraft}
          setEnvironmentDraft={setEnvironmentDraft}
          onSaveEnvironment={saveEnvironment}
          onGenerateInsight={generateIncidentInsight}
          onGeneratePostmortem={generatePostmortem}
          onCreateClientReport={createClientReport}
          disabled={!canEditContent}
          canManageAccess={canManageAccess}
        />
      ) : null}

      {activeTab === 'Collaboration' ? (
        <CollaborationPanel
          comments={features?.comments || []}
          tasks={tasks}
          draft={commentDraft}
          setDraft={setCommentDraft}
          onSubmit={createComment}
          disabled={!canEditContent}
        />
      ) : null}

      {activeTab === 'Planning' ? (
        <PlanningPanel
          sprints={features?.sprints || []}
          tasks={tasks}
          draft={sprintDraft}
          setDraft={setSprintDraft}
          onSubmit={createSprint}
          onStatus={updateSprintStatus}
          disabled={!canEditContent}
        />
      ) : null}

      {activeTab === 'Integrations' ? (
        <IntegrationsPanel
          tenant={features?.tenant}
          tenantDraft={tenantDraft}
          setTenantDraft={setTenantDraft}
          onSaveTenant={saveTenant}
          codeMetrics={features?.codeMetrics || []}
          codeMetricDraft={codeMetricDraft}
          setCodeMetricDraft={setCodeMetricDraft}
          onSaveCodeMetrics={saveCodeMetrics}
          onSyncGitHubMetrics={syncGitHubMetrics}
          alertIntegrations={features?.alertIntegrations || []}
          alertDraft={alertDraft}
          setAlertDraft={setAlertDraft}
          onCreateAlertIntegration={createAlertIntegration}
          onTestAlertIntegration={testAlertIntegration}
          backups={features?.backups || []}
          backupStatus={backupStatus}
          onCreateBackup={createBackup}
          disabled={!canEditContent}
          canManageAccess={canManageAccess}
        />
      ) : null}

      {activeTab === 'Monitoring' ? <ProjectMonitoring project={project} incidents={incidents} deployments={deployments} healthChecks={healthChecks} /> : null}
    </div>
  );
};

const ReliabilityPanel = ({
  project,
  incidents,
  deployments,
  tasks,
  healthChecks,
  features,
  sloDraft,
  setSloDraft,
  onSaveSlo,
  approvalDraft,
  setApprovalDraft,
  onCreateApproval,
  onUpdateApproval,
  statusPageDraft,
  setStatusPageDraft,
  onSaveStatusPage,
  onCallDraft,
  setOnCallDraft,
  onSaveOnCall,
  alertRuleDraft,
  setAlertRuleDraft,
  onCreateAlertRule,
  environmentDraft,
  setEnvironmentDraft,
  onSaveEnvironment,
  onGenerateInsight,
  onGeneratePostmortem,
  onCreateClientReport,
  disabled,
  canManageAccess,
}: {
  project: Project;
  incidents: Incident[];
  deployments: Deployment[];
  tasks: Task[];
  healthChecks: ProjectHealthCheck[];
  features: ProductFeatures | null;
  sloDraft: { name: string; target: number; current: number; windowDays: number };
  setSloDraft: (draft: { name: string; target: number; current: number; windowDays: number }) => void;
  onSaveSlo: (event: FormEvent) => void;
  approvalDraft: { title: string; deploymentId: string; notes: string };
  setApprovalDraft: (draft: { title: string; deploymentId: string; notes: string }) => void;
  onCreateApproval: (event: FormEvent) => void;
  onUpdateApproval: (approval: ReleaseApproval, status: ReleaseApproval['status']) => void;
  statusPageDraft: Partial<StatusPage>;
  setStatusPageDraft: (draft: Partial<StatusPage>) => void;
  onSaveStatusPage: () => void;
  onCallDraft: Partial<OnCallSchedule>;
  setOnCallDraft: (draft: Partial<OnCallSchedule>) => void;
  onSaveOnCall: () => void;
  alertRuleDraft: Partial<AlertRule>;
  setAlertRuleDraft: (draft: Partial<AlertRule>) => void;
  onCreateAlertRule: (event: FormEvent) => void;
  environmentDraft: Partial<ProjectEnvironment>;
  setEnvironmentDraft: (draft: Partial<ProjectEnvironment>) => void;
  onSaveEnvironment: (event: FormEvent) => void;
  onGenerateInsight: (incident: Incident) => void;
  onGeneratePostmortem: (incident: Incident) => void;
  onCreateClientReport: (format: 'Weekly' | 'Monthly') => void;
  disabled: boolean;
  canManageAccess: boolean;
}) => {
  const latestIncident = incidents[0];
  const latestInsight = features?.incidentAssistant?.[0];
  const latestPostmortem = features?.postmortems?.[0];
  const latestReport = features?.clientReports?.[0];
  const currentSlo = features?.slos?.[0];
  const publicStatus = features?.statusPages?.[0];
  const onCall = features?.onCall?.[0];
  const openApprovals = features?.releaseApprovals?.filter((approval) => approval.status === 'Pending') || [];
  const environments = features?.environments || [];
  const matchedAlerts = features?.alertEvaluations?.filter((evaluation) => evaluation.matched).slice(0, 4) || [];
  const uptime = healthChecks.length ? Number(((healthChecks.filter((check) => check.status === 'healthy').length / healthChecks.length) * 100).toFixed(1)) : 100;
  const completedTasks = tasks.filter((task) => task.status === 'DONE').length;

  return (
    <div className="space-y-6">
      <div className="reliability-hero">
        <div>
          <span className="metric-kicker">Reliability</span>
          <h2>Incident response, SLOs, reports, status pages, and release approvals.</h2>
          <p>Manage reliability work alongside project delivery.</p>
        </div>
        <div className="reliability-hero-grid">
          <MetricTile label="Recent Uptime" value={`${uptime}%`} helper="Health-check history" icon={Gauge} compact />
          <MetricTile label="Reports" value={features?.clientReports?.length || 0} helper="Generated summaries" icon={FileText} compact />
          <MetricTile label="Approvals" value={openApprovals.length} helper="Pending release gates" icon={ClipboardCheck} compact />
        </div>
      </div>

      <div className="section">
        <div className="card surface-card space-y-4">
          <div className="topbar">
            <div>
              <h3>AI Incident Assistant</h3>
              <p className="subtle">Generate root-cause hints and next actions from real incidents, deployments, and health checks.</p>
            </div>
            <button className="toggle" type="button" disabled={disabled || !latestIncident} onClick={() => latestIncident && onGenerateInsight(latestIncident)}>Analyze latest</button>
          </div>
          {latestInsight ? (
            <div className="premium-insight">
              <span className={`status-badge ${statusTone(latestInsight.riskLevel)}`}><span className="status-badge-dot" /> {latestInsight.riskLevel} risk</span>
              <strong>{latestInsight.summary}</strong>
              <p>{latestInsight.likelyRootCause}</p>
              <ul>{latestInsight.nextActions.map((action) => <li key={action}>{action}</li>)}</ul>
            </div>
          ) : <p className="subtle">No insight generated yet.</p>}
        </div>

        <div className="card surface-card space-y-4">
          <div className="topbar">
            <div>
              <h3>Postmortem Generator</h3>
              <p className="subtle">Create a structured incident review with impact, root cause, timeline, and actions.</p>
            </div>
            <button className="toggle" type="button" disabled={disabled || !latestIncident} onClick={() => latestIncident && onGeneratePostmortem(latestIncident)}>Generate</button>
          </div>
          {latestPostmortem ? (
            <div className="premium-insight">
              <strong>{latestPostmortem.title}</strong>
              <p>{latestPostmortem.rootCause}</p>
              <div className="mini-list">{latestPostmortem.actionItems.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          ) : <p className="subtle">No postmortem generated yet.</p>}
        </div>
      </div>

      <div className="section">
        <form className="card surface-card space-y-3" onSubmit={onSaveEnvironment}>
          <h3>Project Environments</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <select className="editor min-h-0" value={environmentDraft.name || 'Production'} onChange={(event) => setEnvironmentDraft({ ...environmentDraft, name: event.target.value })} disabled={!canManageAccess}>
              {['Production', 'Staging', 'Development'].map((name) => <option key={name}>{name}</option>)}
            </select>
            <input className="editor min-h-0" placeholder="https://app.company.com" value={environmentDraft.appUrl || ''} onChange={(event) => setEnvironmentDraft({ ...environmentDraft, appUrl: event.target.value })} disabled={!canManageAccess} />
            <input className="editor min-h-0" placeholder="Webhook URL" value={environmentDraft.deploymentWebhookUrl || ''} onChange={(event) => setEnvironmentDraft({ ...environmentDraft, deploymentWebhookUrl: event.target.value })} disabled={!canManageAccess} />
          </div>
          <button className="toggle" type="submit" disabled={!canManageAccess || !environmentDraft.name?.trim()}>Save Environment</button>
          <div className="mini-list">
            {environments.map((environment) => (
              <span key={environment.id}>{environment.name}: {environment.healthStatus} {environment.appUrl ? `· ${environment.appUrl}` : ''}</span>
            ))}
            {!environments.length ? <span>No environments configured yet.</span> : null}
          </div>
        </form>

        <form className="card surface-card space-y-3" onSubmit={onSaveSlo}>
          <h3>SLA / SLO Management</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <input className="editor min-h-0" value={sloDraft.name} onChange={(event) => setSloDraft({ ...sloDraft, name: event.target.value })} disabled={disabled} />
            <input className="editor min-h-0" type="number" step="0.01" value={sloDraft.target} onChange={(event) => setSloDraft({ ...sloDraft, target: Number(event.target.value) })} disabled={disabled} />
            <input className="editor min-h-0" type="number" step="0.01" value={sloDraft.current} onChange={(event) => setSloDraft({ ...sloDraft, current: Number(event.target.value) })} disabled={disabled} />
            <input className="editor min-h-0" type="number" value={sloDraft.windowDays} onChange={(event) => setSloDraft({ ...sloDraft, windowDays: Number(event.target.value) })} disabled={disabled} />
          </div>
          <button className="toggle" type="submit" disabled={disabled}>Save SLO</button>
          {currentSlo ? <p className="subtle">Current {currentSlo.current}% vs target {currentSlo.target}%. Error budget remaining: {currentSlo.errorBudgetRemaining}%.</p> : null}
        </form>

        <div className="card surface-card space-y-3">
          <div className="topbar">
            <div>
              <h3>Reports</h3>
              <p className="subtle">Generate delivery and reliability summaries.</p>
            </div>
            <div className="hero-actions">
              <button className="button-secondary" type="button" onClick={() => onCreateClientReport('Weekly')} disabled={disabled}>Weekly</button>
              <button className="button-secondary" type="button" onClick={() => onCreateClientReport('Monthly')} disabled={disabled}>Monthly</button>
            </div>
          </div>
          {latestReport ? (
            <div className="premium-insight">
              <strong>{latestReport.period}</strong>
              <p>{latestReport.summary}</p>
              <div className="mini-list">
                <span>{latestReport.uptime}% uptime</span>
                <span>{latestReport.deployments} deployments</span>
                <span>{latestReport.incidents} incidents</span>
                <span>{latestReport.completedTasks} completed tasks</span>
              </div>
            </div>
          ) : <p className="subtle">No client reports generated yet. Completed tasks: {completedTasks}.</p>}
        </div>
      </div>

      <div className="section">
        <form className="card surface-card space-y-3" onSubmit={onCreateApproval}>
          <h3>Release Approval Workflow</h3>
          <input className="editor min-h-0" placeholder="Approval title" value={approvalDraft.title} onChange={(event) => setApprovalDraft({ ...approvalDraft, title: event.target.value })} disabled={disabled} />
          <select className="editor min-h-0" value={approvalDraft.deploymentId} onChange={(event) => setApprovalDraft({ ...approvalDraft, deploymentId: event.target.value })} disabled={disabled}>
            <option value="">No deployment selected</option>
            {deployments.map((deployment) => <option key={deployment.id} value={deployment.id}>{deployment.version} · {deployment.status}</option>)}
          </select>
          <textarea className="editor" placeholder="Approval notes" value={approvalDraft.notes} onChange={(event) => setApprovalDraft({ ...approvalDraft, notes: event.target.value })} disabled={disabled} />
          <button className="toggle" type="submit" disabled={disabled || !approvalDraft.title.trim()}>Request Approval</button>
          <div className="timeline">
            {(features?.releaseApprovals || []).slice(0, 4).map((approval) => (
              <div className="timeline-item" key={approval.id}>
                <span className="timeline-dot" />
                <div><strong>{approval.title}</strong><p className="subtle">{approval.status} · requested by {approval.requester}</p></div>
                {approval.status === 'Pending' ? <button className="button-secondary" type="button" disabled={!canManageAccess} onClick={() => onUpdateApproval(approval, 'Approved')}>Approve</button> : null}
              </div>
            ))}
          </div>
        </form>

        <div className="card surface-card space-y-3">
          <h3>Public Status Page</h3>
          <input className="editor min-h-0" placeholder={`${project.name} status`} value={statusPageDraft.headline || ''} onChange={(event) => setStatusPageDraft({ ...statusPageDraft, headline: event.target.value })} disabled={disabled} />
          <select className="editor min-h-0" value={statusPageDraft.status || 'Operational'} onChange={(event) => setStatusPageDraft({ ...statusPageDraft, status: event.target.value as StatusPage['status'] })} disabled={disabled}>
            {['Operational', 'Degraded', 'Outage', 'Maintenance'].map((status) => <option key={status}>{status}</option>)}
          </select>
          <textarea className="editor" value={statusPageDraft.message || ''} onChange={(event) => setStatusPageDraft({ ...statusPageDraft, message: event.target.value })} disabled={disabled} />
          <button className="toggle" type="button" onClick={onSaveStatusPage} disabled={disabled}>Publish Status</button>
          {publicStatus ? (
            <p className="subtle">
              Public page: <Link to={`/status/${publicStatus.publicSlug}`}>/status/{publicStatus.publicSlug}</Link> · {publicStatus.status}
            </p>
          ) : null}
        </div>
      </div>

      <div className="section">
        <div className="card surface-card space-y-3">
          <h3>On-call Schedule</h3>
          <input className="editor min-h-0" placeholder="Primary responder email" value={onCallDraft.primary || ''} onChange={(event) => setOnCallDraft({ ...onCallDraft, primary: event.target.value })} disabled={!canManageAccess} />
          <input className="editor min-h-0" placeholder="Secondary responder email" value={onCallDraft.secondary || ''} onChange={(event) => setOnCallDraft({ ...onCallDraft, secondary: event.target.value })} disabled={!canManageAccess} />
          <div className="grid gap-3 md:grid-cols-3">
            <input className="editor min-h-0" type="number" value={onCallDraft.escalationMinutes || 15} onChange={(event) => setOnCallDraft({ ...onCallDraft, escalationMinutes: Number(event.target.value) })} disabled={!canManageAccess} />
            <input className="editor min-h-0" value={onCallDraft.rotation || 'Weekly'} onChange={(event) => setOnCallDraft({ ...onCallDraft, rotation: event.target.value })} disabled={!canManageAccess} />
            <input className="editor min-h-0" value={onCallDraft.timezone || 'Asia/Kolkata'} onChange={(event) => setOnCallDraft({ ...onCallDraft, timezone: event.target.value })} disabled={!canManageAccess} />
          </div>
          <button className="toggle" type="button" onClick={onSaveOnCall} disabled={!canManageAccess}>Save On-call</button>
          {onCall ? <p className="subtle">Primary: {onCall.primary || 'unassigned'} · escalation {onCall.escalationMinutes} min</p> : null}
        </div>

        <form className="card surface-card space-y-3" onSubmit={onCreateAlertRule}>
          <h3>Real Alert Rules</h3>
          <input className="editor min-h-0" value={alertRuleDraft.name || ''} onChange={(event) => setAlertRuleDraft({ ...alertRuleDraft, name: event.target.value })} disabled={disabled} />
          <div className="grid gap-3 md:grid-cols-3">
            <select className="editor min-h-0" value={alertRuleDraft.condition || 'health_failures'} onChange={(event) => setAlertRuleDraft({ ...alertRuleDraft, condition: event.target.value })} disabled={disabled}>
              <option value="health_failures">Health failures</option>
              <option value="response_time">Response time</option>
              <option value="deployment_failed">Deployment failed</option>
            </select>
            <input className="editor min-h-0" type="number" value={alertRuleDraft.threshold || 3} onChange={(event) => setAlertRuleDraft({ ...alertRuleDraft, threshold: Number(event.target.value) })} disabled={disabled} />
            <input className="editor min-h-0" value={alertRuleDraft.channel || '#alerts'} onChange={(event) => setAlertRuleDraft({ ...alertRuleDraft, channel: event.target.value })} disabled={disabled} />
          </div>
          <button className="toggle" type="submit" disabled={disabled || !alertRuleDraft.name?.trim()}>Create Rule</button>
          <div className="mini-list">{(features?.alertRules || []).slice(0, 4).map((rule) => <span key={rule.id}>{rule.name}: {rule.condition} &gt; {rule.threshold}</span>)}</div>
          {matchedAlerts.length ? (
            <div className="premium-insight">
              <strong>Active alert matches</strong>
              <div className="mini-list">{matchedAlerts.map((evaluation) => <span key={evaluation.id}>{evaluation.ruleName}: {evaluation.value} / {evaluation.threshold}</span>)}</div>
            </div>
          ) : null}
        </form>
      </div>

      <div className="card surface-card">
        <div className="topbar">
          <div>
            <h3>Audit Log</h3>
            <p className="subtle">Project-level governance events created by reliability workflows.</p>
          </div>
          <span className="badge">{features?.audit?.length || 0} records</span>
        </div>
        <div className="timeline">
          {(features?.audit || []).slice(0, 8).map((record) => (
            <div className="timeline-item" key={record.id}>
              <span className="timeline-dot" />
              <div><strong>{record.action}</strong><p className="subtle">{record.entity} · {record.actor} · {new Date(record.createdAt).toLocaleString()}</p></div>
            </div>
          ))}
          {!features?.audit?.length ? <p className="subtle">No audit records yet.</p> : null}
        </div>
      </div>
    </div>
  );
};

const CollaborationPanel = ({ comments, tasks, draft, setDraft, onSubmit, disabled }: { comments: ProjectComment[]; tasks: Task[]; draft: string; setDraft: (value: string) => void; onSubmit: (event: FormEvent) => void; disabled: boolean }) => (
  <div className="space-y-6">
    <form className="card surface-card space-y-4" onSubmit={onSubmit}>
      <div className="topbar">
        <div>
          <h3>Team Collaboration</h3>
          <p className="subtle">Add project comments, mention teammates with @email, and keep decision history attached to the project.</p>
        </div>
        <span className="badge">{comments.length} comments</span>
      </div>
      <textarea className="editor" placeholder="Write an update, decision, blocker, or @mention..." value={draft} onChange={(event) => setDraft(event.target.value)} disabled={disabled} />
      <div className="hero-actions">
        <button className="toggle inline-flex items-center gap-2" type="submit" disabled={disabled || !draft.trim()}><Plus size={16} /> Add comment</button>
      </div>
    </form>

    <div className="section">
      <div className="card surface-card">
        <h3>Discussion Timeline</h3>
        <div className="timeline">
          {comments.map((comment) => (
            <div className="timeline-item" key={comment.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{comment.author}</strong>
                <p>{comment.body}</p>
                <p className="subtle">{new Date(comment.createdAt).toLocaleString()}{comment.mentions.length ? ` · mentions ${comment.mentions.join(', ')}` : ''}</p>
              </div>
            </div>
          ))}
          {!comments.length ? <p className="subtle">No collaboration notes yet.</p> : null}
        </div>
      </div>
      <div className="card surface-card">
        <h3>Team Focus</h3>
        <div className="deployment-detail-list">
          <span>Open issues</span><strong>{tasks.filter((task) => task.status !== 'DONE').length}</strong>
          <span>In review</span><strong>{tasks.filter((task) => task.status === 'REVIEW').length}</strong>
          <span>Mentions tracked</span><strong>{comments.reduce((sum, comment) => sum + comment.mentions.length, 0)}</strong>
        </div>
      </div>
    </div>
  </div>
);

const PlanningPanel = ({ sprints, tasks, draft, setDraft, onSubmit, onStatus, disabled }: {
  sprints: Sprint[];
  tasks: Task[];
  draft: { name: string; goal: string; startDate: string; endDate: string; capacity: number; status: Sprint['status'] };
  setDraft: (draft: { name: string; goal: string; startDate: string; endDate: string; capacity: number; status: Sprint['status'] }) => void;
  onSubmit: (event: FormEvent) => void;
  onStatus: (sprint: Sprint, status: Sprint['status']) => void;
  disabled: boolean;
}) => {
  const completedPoints = tasks.filter((task) => task.status === 'DONE').reduce((sum, task) => sum + Number(task.points || 0), 0);
  const activePoints = tasks.filter((task) => task.status !== 'DONE').reduce((sum, task) => sum + Number(task.points || 0), 0);
  const activeSprint = sprints.find((sprint) => sprint.status === 'Active');
  const velocity = sprints.filter((sprint) => sprint.status === 'Completed').length
    ? Math.round(completedPoints / sprints.filter((sprint) => sprint.status === 'Completed').length)
    : completedPoints;

  return (
    <div className="space-y-6">
      <div className="grid">
        <MetricTile label="Velocity" value={velocity} helper="Completed story points" icon={Activity} compact />
        <MetricTile label="Active Capacity" value={activeSprint?.capacity || 0} helper={activeSprint?.name || 'No active sprint'} icon={Gauge} compact />
        <MetricTile label="Remaining Points" value={activePoints} helper="Open issue points" icon={FolderKanban} compact />
        <MetricTile label="Sprints" value={sprints.length} helper="Planning records" icon={Waypoints} compact />
      </div>
      <form className="card surface-card grid gap-3 md:grid-cols-[1fr_1fr_160px_160px_120px_150px_auto]" onSubmit={onSubmit}>
        <input className="editor min-h-0" placeholder="Sprint name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={disabled} />
        <input className="editor min-h-0" placeholder="Sprint goal" value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} disabled={disabled} />
        <input className="editor min-h-0" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} disabled={disabled} />
        <input className="editor min-h-0" type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} disabled={disabled} />
        <input className="editor min-h-0" type="number" min={0} value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: Number(event.target.value) })} disabled={disabled} />
        <select className="editor min-h-0" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Sprint['status'] })} disabled={disabled}>
          {['Planned', 'Active', 'Completed'].map((status) => <option key={status}>{status}</option>)}
        </select>
        <button className="toggle" type="submit" disabled={disabled || !draft.name.trim()}>Create Sprint</button>
      </form>
      <div className="card surface-card overflow-x-auto">
        <table className="data-table"><thead><tr><th>Sprint</th><th>Goal</th><th>Dates</th><th>Capacity</th><th>Status</th></tr></thead><tbody>
          {sprints.map((sprint) => (
            <tr key={sprint.id}>
              <td><strong>{sprint.name}</strong></td>
              <td>{sprint.goal || 'No goal recorded'}</td>
              <td>{sprint.startDate} to {sprint.endDate}</td>
              <td>{sprint.capacity}</td>
              <td><select value={sprint.status} disabled={disabled} onChange={(event) => onStatus(sprint, event.target.value as Sprint['status'])}>{['Planned', 'Active', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select></td>
            </tr>
          ))}
          {!sprints.length ? <tr><td colSpan={5}>No sprints planned yet.</td></tr> : null}
        </tbody></table>
      </div>
    </div>
  );
};

const IntegrationsPanel = ({
  tenant,
  tenantDraft,
  setTenantDraft,
  onSaveTenant,
  codeMetrics,
  codeMetricDraft,
  setCodeMetricDraft,
  onSaveCodeMetrics,
  onSyncGitHubMetrics,
  alertIntegrations,
  alertDraft,
  setAlertDraft,
  onCreateAlertIntegration,
  onTestAlertIntegration,
  backups,
  backupStatus,
  onCreateBackup,
  disabled,
  canManageAccess,
}: {
  tenant?: TenantProfile;
  tenantDraft: Partial<TenantProfile>;
  setTenantDraft: (draft: Partial<TenantProfile>) => void;
  onSaveTenant: () => void;
  codeMetrics: CodeMetric[];
  codeMetricDraft: Omit<CodeMetric, 'id' | 'projectId' | 'lastSyncedAt'>;
  setCodeMetricDraft: (draft: Omit<CodeMetric, 'id' | 'projectId' | 'lastSyncedAt'>) => void;
  onSaveCodeMetrics: (event: FormEvent) => void;
  onSyncGitHubMetrics: () => void;
  alertIntegrations: AlertIntegration[];
  alertDraft: Omit<AlertIntegration, 'id' | 'projectId' | 'createdAt' | 'lastTestAt'>;
  setAlertDraft: (draft: Omit<AlertIntegration, 'id' | 'projectId' | 'createdAt' | 'lastTestAt'>) => void;
  onCreateAlertIntegration: (event: FormEvent) => void;
  onTestAlertIntegration: (integration: AlertIntegration) => void;
  backups: BackupRecord[];
  backupStatus: string;
  onCreateBackup: () => void;
  disabled: boolean;
  canManageAccess: boolean;
}) => (
  <div className="space-y-6">
    <div className="grid">
      <MetricTile label="Tenant Plan" value={tenant?.plan || 'Professional'} helper={tenant?.domain || 'Workspace domain'} icon={Users} compact />
      <MetricTile label="Code Sources" value={codeMetrics.length} helper="GitHub/GitLab metrics" icon={GitBranch} compact />
      <MetricTile label="Alert Channels" value={alertIntegrations.length} helper="Slack and Discord" icon={BellRing} compact />
      <MetricTile label="Backups" value={backups.length} helper="Recovery points" icon={ShieldAlert} compact />
    </div>

    <div className="section">
      <div className="card surface-card space-y-3">
        <h3>Workspace profile</h3>
        <input className="editor min-h-0" placeholder="Tenant name" value={tenantDraft.name || ''} onChange={(event) => setTenantDraft({ ...tenantDraft, name: event.target.value })} disabled={!canManageAccess} />
        <input className="editor min-h-0" placeholder="Domain" value={tenantDraft.domain || ''} onChange={(event) => setTenantDraft({ ...tenantDraft, domain: event.target.value })} disabled={!canManageAccess} />
        <div className="grid gap-3 md:grid-cols-3">
          <select className="editor min-h-0" value={tenantDraft.plan || 'Professional'} onChange={(event) => setTenantDraft({ ...tenantDraft, plan: event.target.value as TenantProfile['plan'] })} disabled={!canManageAccess}>
            {['Starter', 'Professional', 'Enterprise'].map((plan) => <option key={plan}>{plan}</option>)}
          </select>
          <input className="editor min-h-0" placeholder="Region" value={tenantDraft.primaryRegion || ''} onChange={(event) => setTenantDraft({ ...tenantDraft, primaryRegion: event.target.value })} disabled={!canManageAccess} />
          <input className="editor min-h-0" type="number" min={7} value={tenantDraft.dataRetentionDays || 90} onChange={(event) => setTenantDraft({ ...tenantDraft, dataRetentionDays: Number(event.target.value) })} disabled={!canManageAccess} />
        </div>
        <button className="toggle" type="button" onClick={onSaveTenant} disabled={!canManageAccess}>Save Tenant</button>
      </div>

      <form className="card surface-card space-y-3" onSubmit={onSaveCodeMetrics}>
        <h3>GitHub / GitLab Code Metrics</h3>
        <input className="editor min-h-0" placeholder="Repository, e.g. owner/repo" value={codeMetricDraft.repository} onChange={(event) => setCodeMetricDraft({ ...codeMetricDraft, repository: event.target.value })} disabled={disabled} />
        <div className="grid gap-3 md:grid-cols-3">
          <select className="editor min-h-0" value={codeMetricDraft.provider} onChange={(event) => setCodeMetricDraft({ ...codeMetricDraft, provider: event.target.value as CodeMetric['provider'] })} disabled={disabled}>{['GitHub', 'GitLab', 'Manual'].map((provider) => <option key={provider}>{provider}</option>)}</select>
          <input className="editor min-h-0" placeholder="Branch" value={codeMetricDraft.branch} onChange={(event) => setCodeMetricDraft({ ...codeMetricDraft, branch: event.target.value })} disabled={disabled} />
          <input className="editor min-h-0" placeholder="Source URL" value={codeMetricDraft.sourceUrl} onChange={(event) => setCodeMetricDraft({ ...codeMetricDraft, sourceUrl: event.target.value })} disabled={disabled} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(['commits', 'pullRequests', 'openIssues', 'coverage', 'deploymentFrequency', 'leadTimeHours'] as const).map((field) => (
            <input key={field} className="editor min-h-0" type="number" min={0} placeholder={field} value={codeMetricDraft[field]} onChange={(event) => setCodeMetricDraft({ ...codeMetricDraft, [field]: Number(event.target.value) })} disabled={disabled} />
          ))}
        </div>
        <div className="hero-actions">
          <button className="toggle" type="button" onClick={onSyncGitHubMetrics} disabled={disabled || codeMetricDraft.provider !== 'GitHub' || !codeMetricDraft.repository.trim()}>Sync GitHub</button>
          <button className="button-secondary" type="submit" disabled={disabled || !codeMetricDraft.repository.trim()}>Save Manually</button>
        </div>
      </form>
    </div>

    <div className="section">
      <form className="card surface-card space-y-3" onSubmit={onCreateAlertIntegration}>
        <h3>Slack / Discord Alerts</h3>
        <div className="grid gap-3 md:grid-cols-[140px_1fr_1fr_auto]">
          <select className="editor min-h-0" value={alertDraft.provider} onChange={(event) => setAlertDraft({ ...alertDraft, provider: event.target.value as AlertIntegration['provider'] })} disabled={!canManageAccess}>{['Slack', 'Discord'].map((provider) => <option key={provider}>{provider}</option>)}</select>
          <input className="editor min-h-0" placeholder="#channel" value={alertDraft.channel} onChange={(event) => setAlertDraft({ ...alertDraft, channel: event.target.value })} disabled={!canManageAccess} />
          <input className="editor min-h-0" placeholder="Webhook URL" value={alertDraft.webhookUrl} onChange={(event) => setAlertDraft({ ...alertDraft, webhookUrl: event.target.value })} disabled={!canManageAccess} />
          <button className="toggle" type="submit" disabled={!canManageAccess || !alertDraft.channel.trim()}>Add Alert</button>
        </div>
        <div className="timeline">
          {alertIntegrations.map((integration) => (
            <div className="timeline-item" key={integration.id}>
              <span className="timeline-dot" />
              <div><strong>{integration.provider} · {integration.channel}</strong><p className="subtle">{integration.webhookUrl || 'No webhook configured'}{integration.lastTestAt ? ` · tested ${new Date(integration.lastTestAt).toLocaleString()}` : ''}</p></div>
              <button className="button-secondary" type="button" disabled={!canManageAccess} onClick={() => onTestAlertIntegration(integration)}>Test</button>
            </div>
          ))}
          {!alertIntegrations.length ? <p className="subtle">No alert integrations yet.</p> : null}
        </div>
      </form>

      <div className="card surface-card space-y-3">
        <div className="topbar">
          <div>
            <h3>Backup and Disaster Recovery</h3>
            <p className="subtle">Export the current projects, incidents, deployments, metrics, and product-feature data.</p>
          </div>
          <button className="toggle" type="button" onClick={onCreateBackup} disabled={!canManageAccess}>Create Backup</button>
        </div>
        {backupStatus ? <p className="subtle">{backupStatus}</p> : null}
        <div className="timeline">
          {backups.slice(0, 5).map((backup) => (
            <div className="timeline-item" key={backup.id}>
              <span className="timeline-dot" />
              <div><strong>{backup.fileName}</strong><p className="subtle">{Math.round(backup.sizeBytes / 1024)} KB · {new Date(backup.createdAt).toLocaleString()} · {backup.includes.join(', ')}</p></div>
            </div>
          ))}
          {!backups.length ? <p className="subtle">No backups created yet.</p> : null}
        </div>
      </div>
    </div>

    <div className="card surface-card overflow-x-auto">
      <h3>Code Metrics History</h3>
      <table className="data-table"><thead><tr><th>Source</th><th>Branch</th><th>Commits</th><th>PRs</th><th>Issues</th><th>Coverage</th><th>Lead Time</th><th>Synced</th></tr></thead><tbody>
        {codeMetrics.map((metric) => (
          <tr key={metric.id}>
            <td>{metric.sourceUrl ? <a className="table-link" href={metric.sourceUrl} target="_blank" rel="noreferrer">{metric.provider} · {metric.repository}</a> : `${metric.provider} · ${metric.repository}`}</td>
            <td>{metric.branch}</td>
            <td>{metric.commits}</td>
            <td>{metric.pullRequests}</td>
            <td>{metric.openIssues}</td>
            <td>{metric.coverage}%</td>
            <td>{metric.leadTimeHours}h</td>
            <td>{new Date(metric.lastSyncedAt).toLocaleString()}</td>
          </tr>
        ))}
        {!codeMetrics.length ? <tr><td colSpan={8}>No code metrics connected yet.</td></tr> : null}
      </tbody></table>
    </div>
  </div>
);

const TaskForm = ({ draft, setDraft, editing, onSubmit, assigneeOptions, disabled }: { draft: { title: string; description: string; assignee: string; priority: Priority; status: TaskStatus }; setDraft: (draft: { title: string; description: string; assignee: string; priority: Priority; status: TaskStatus }) => void; editing: boolean; onSubmit: (event: FormEvent) => void; assigneeOptions: string[]; disabled: boolean }) => (
  <form className="card surface-card grid gap-3 md:grid-cols-[1fr_1fr_140px_140px_auto]" onSubmit={onSubmit}>
    <input className="editor min-h-0" placeholder="Issue title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} disabled={disabled} />
    <>
      <input className="editor min-h-0" list="project-assignees" placeholder="Assignee" value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} disabled={disabled} />
      <datalist id="project-assignees">
        {assigneeOptions.map((option) => <option key={option} value={option} />)}
      </datalist>
    </>
    <select className="editor min-h-0" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })} disabled={disabled}>{['Low', 'Medium', 'High', 'Critical'].map((priority) => <option key={priority}>{priority}</option>)}</select>
    <select className="editor min-h-0" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })} disabled={disabled}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.title}</option>)}</select>
    <button className="toggle" type="submit" disabled={disabled}>{editing ? 'Save Issue' : 'Create Issue'}</button>
    <textarea className="editor md:col-span-5" placeholder="Issue description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} disabled={disabled} />
  </form>
);

const TaskTable = ({ project, tasks, onEdit, onDelete, onStatus, disabled }: { project: Project; tasks: Task[]; onEdit: (task: Task) => void; onDelete: (task: Task) => void; onStatus: (task: Task, status: TaskStatus) => void; disabled: boolean }) => (
  <div className="card surface-card overflow-x-auto">
    <table className="data-table"><thead><tr><th>Issue</th><th>Priority</th><th>Assignee</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {tasks.map((task, index) => <tr key={task.id}><td><div className="stack-sm"><span className="issue-key">{issueKey(project, task, index)}</span><strong>{task.title}</strong></div></td><td><span className={`priority-pill ${priorityTone(task.priority)}`}>{task.priority}</span></td><td>{task.assignee}</td><td><select value={task.status} disabled={disabled} onChange={(event) => onStatus(task, event.target.value as TaskStatus)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.title}</option>)}</select></td><td><button className="button-secondary" type="button" disabled={disabled} onClick={() => onEdit(task)}>Edit</button> <button className="button-secondary" type="button" disabled={disabled} onClick={() => onDelete(task)}>Delete</button></td></tr>)}
      {!tasks.length ? <tr><td colSpan={5}>No issues recorded for this project.</td></tr> : null}
    </tbody></table>
  </div>
);

const DeploymentTable = ({ deployments, project }: { deployments: Deployment[]; project: Project }) => {
  const latest = deployments[0];

  return (
  <div className="space-y-4">
    {latest ? (
      <div className="deployment-detail-grid">
        <div className="card surface-card">
          <div className="topbar">
            <div>
              <h3>Latest deployment</h3>
              <p className="subtle">{latest.provider} · {latest.environment}</p>
            </div>
            <StatusBadge value={latest.status} />
          </div>
          <div className="deployment-detail-list">
            <span>Version</span><strong>{latest.version}</strong>
            <span>Service</span><strong>{latest.service}</strong>
            <span>Branch</span><strong>{latest.branch || 'Not provided'}</strong>
            <span>Commit</span><strong>{latest.commitSha ? latest.commitSha.slice(0, 12) : 'Not provided'}</strong>
            <span>Triggered by</span><strong>{latest.triggeredBy || 'Unknown'}</strong>
            <span>Timestamp</span><strong>{new Date(latest.startedAt).toLocaleString()}</strong>
          </div>
        </div>
        <div className="card surface-card">
          <h3>Deployment details</h3>
          <p className="subtle">Webhook and manual releases are stored in one timeline.</p>
          <div className="hero-actions mt-4">
            {resolveDeploymentLink(project, latest) ? <a className="toggle inline-flex items-center gap-2" href={resolveDeploymentLink(project, latest)} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open deployment</a> : null}
          </div>
        </div>
      </div>
    ) : null}

    <div className="card surface-card">
      <div className="topbar">
        <div>
          <h3>Deployment history</h3>
          <p className="subtle">Provider, source, commit, branch, actor, status, and timestamp.</p>
        </div>
        <span className="badge">{deployments.length} records</span>
      </div>
      <div className="deployment-timeline">
        {deployments.map((deployment) => (
          <div className="deployment-timeline-item" key={deployment.id}>
            <span className={`timeline-dot ${['Failed', 'Rolled Back'].includes(deployment.status) ? 'timeline-dot-danger' : deployment.status === 'Succeeded' ? 'timeline-dot-success' : ''}`} />
            <div className="deployment-timeline-card">
              <div className="topbar">
                <div>
                  <strong>{deployment.version} · {deployment.service}</strong>
                  <p className="subtle">{deployment.provider} · {deployment.environment} · {new Date(deployment.startedAt).toLocaleString()}</p>
                </div>
                <StatusBadge value={deployment.status} />
              </div>
              <div className="deployment-meta-grid">
                <span>URL</span><strong>{resolveDeploymentLink(project, deployment) ? <a className="table-link" href={resolveDeploymentLink(project, deployment)} target="_blank" rel="noreferrer">{resolveDeploymentLink(project, deployment)}</a> : 'Not provided'}</strong>
                <span>Commit</span><strong>{deployment.commitSha || 'Not provided'}</strong>
                <span>Branch</span><strong>{deployment.branch || 'Not provided'}</strong>
                <span>Actor</span><strong>{deployment.triggeredBy || 'Unknown'}</strong>
              </div>
            </div>
          </div>
        ))}
        {!deployments.length ? <div className="empty-state"><strong>No deployments recorded for this project.</strong></div> : null}
      </div>
    </div>
  </div>
  );
};

const ProjectSetupPanel = ({
  project,
  appUrlDraft,
  setAppUrlDraft,
  deploymentPlatformDraft,
  setDeploymentPlatformDraft,
  webhookUrl,
  copied,
  onCopy,
  onSaveAppUrl,
  memberDrafts,
  canManageAccess,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviteLink,
  projectInvites,
  onAddMember,
  onRemoveMember,
  onUpdateMemberRole,
  onSaveMembers,
}: {
  project: Project;
  appUrlDraft: string;
  setAppUrlDraft: (value: string) => void;
  deploymentPlatformDraft: Project['deploymentPlatform'];
  setDeploymentPlatformDraft: (value: Project['deploymentPlatform']) => void;
  webhookUrl: string;
  copied: boolean;
  onCopy: () => void;
  onSaveAppUrl: (event: FormEvent) => void;
  memberDrafts: ProjectMember[];
  canManageAccess: boolean;
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  inviteRole: ProjectRole;
  setInviteRole: (value: ProjectRole) => void;
  inviteLink: string;
  projectInvites: ProjectInvite[];
  onAddMember: () => void;
  onRemoveMember: (email: string) => void;
  onUpdateMemberRole: (email: string, role: ProjectRole) => void;
  onSaveMembers: () => void;
}) => {
  const appUrlReady = Boolean(project.appUrl);

  return (
    <div className="project-setup-grid">
      <div className="card surface-card space-y-4 project-connection-card">
        <div className="topbar">
          <div>
            <h3>Project Connection</h3>
            <p className="subtle">Connect the app URL and deployment webhook.</p>
          </div>
          <span className="badge">{appUrlReady ? 'Monitoring connected' : 'App URL needed'}</span>
        </div>
        <div className="deployment-webhook-hero">
          <div className="deployment-webhook-copy">
            <span className="metric-kicker">Deployment webhook</span>
            <strong>Use this endpoint in Vercel, GitHub Actions, Railway, Render, or any deploy pipeline.</strong>
          </div>
          <div className="deployment-webhook-control">
            <textarea className="editor deployment-webhook-url" readOnly value={webhookUrl || 'Webhook is being generated.'} />
            <button className="toggle deployment-webhook-copy-button inline-flex items-center justify-center gap-2" type="button" onClick={onCopy} disabled={!webhookUrl}>
              <Copy size={16} /> {copied ? 'Copied' : 'Copy webhook'}
            </button>
          </div>
        </div>
        <form className="project-connection-form" onSubmit={onSaveAppUrl}>
          <input className="editor min-h-0" placeholder="https://your-deployed-app.com" value={appUrlDraft} onChange={(event) => setAppUrlDraft(event.target.value)} />
          <select className="editor min-h-0" value={deploymentPlatformDraft} onChange={(event) => setDeploymentPlatformDraft(event.target.value as Project['deploymentPlatform'])}>
            {deploymentPlatforms.map((platform) => <option key={platform}>{platform}</option>)}
          </select>
          <button className="toggle inline-flex items-center justify-center" type="button" onClick={() => setDeploymentPlatformDraft(detectDeploymentPlatform(appUrlDraft))} disabled={!appUrlDraft.trim()}>
            Detect Platform
          </button>
          <button className="toggle inline-flex items-center justify-center" type="submit" disabled={!appUrlDraft.trim() || !canManageAccess}>
            Save Connection
          </button>
        </form>
        <p className="subtle">{providerInstructions[deploymentPlatformDraft]}</p>
        <p className="subtle">Health checks run automatically after setup.</p>
      </div>

      <div className="card surface-card space-y-4 project-access-card">
        <div className="topbar">
          <div>
            <h3>Access Control</h3>
            <p className="subtle">This is this project&apos;s team only. Different projects can have different teammates.</p>
          </div>
          <span className="badge inline-flex items-center gap-2"><Users size={14} /> {memberDrafts.length} members</span>
        </div>

        <div className="space-y-3">
          {memberDrafts.map((member) => (
            <div key={member.email} className="grid gap-3 md:grid-cols-[1fr_140px_auto] items-center">
              <div>
                <strong>{member.name || member.email}</strong>
                <p className="subtle">{member.email}</p>
              </div>
              <select
                className="editor min-h-0"
                value={member.role}
                disabled={!canManageAccess || member.role === 'owner'}
                onChange={(event) => onUpdateMemberRole(member.email, event.target.value as ProjectRole)}
              >
                {projectRoles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <button
                className="icon-button"
                type="button"
                title="Remove member"
                disabled={!canManageAccess || member.role === 'owner'}
                onClick={() => onRemoveMember(member.email)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <input className="editor min-h-0" placeholder="teammate@company.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={!canManageAccess} />
          <select className="editor min-h-0" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as ProjectRole)} disabled={!canManageAccess}>
            {projectRoles.filter((role) => role !== 'owner').map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button className="toggle inline-flex items-center justify-center gap-2" type="button" onClick={onAddMember} disabled={!canManageAccess || !inviteEmail.trim()}>
            <UserPlus size={16} /> Invite
          </button>
        </div>

        {inviteLink ? (
          <div className="read-only-banner">
            <strong>Invite link ready</strong>
            <span>{inviteLink}</span>
          </div>
        ) : null}

        {projectInvites.length ? (
          <div className="workspace-team-list">
            {projectInvites.slice(0, 4).map((invite) => (
              <span key={invite.id}>{invite.email} · {invite.role} · {invite.status}</span>
            ))}
          </div>
        ) : null}

        <div className="hero-actions">
          <button className="toggle inline-flex items-center justify-center" type="button" onClick={onSaveMembers} disabled={!canManageAccess}>
            Save Access
          </button>
        </div>
        <p className="subtle">Invite teammates who should access this project.</p>
      </div>
    </div>
  );
};

const DeploymentWebhookSetup = ({ webhookUrl, copied, onCopy, platform }: { webhookUrl: string; copied: boolean; onCopy: () => void; platform: Project['deploymentPlatform'] }) => (
  <div className="card surface-card">
    <div className="topbar">
      <div>
        <h3>Auto Deployment Tracking</h3>
        <p className="subtle">Record deployments automatically from {platform}.</p>
      </div>
      <button className="toggle inline-flex items-center gap-2" type="button" onClick={onCopy} disabled={!webhookUrl}>
        <Copy size={16} /> {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <input className="editor min-h-0 mt-3" readOnly value={webhookUrl || 'Webhook unavailable.'} />
    <p className="subtle mt-3">{providerInstructions[platform]}</p>
  </div>
);

const DeploymentForm = ({ draft, setDraft, onSubmit, disabled }: { draft: DeploymentDraft; setDraft: (draft: DeploymentDraft) => void; onSubmit: (event: FormEvent) => void; disabled: boolean }) => (
  <form className="card surface-card grid gap-3 md:grid-cols-[180px_1fr_1fr_150px_150px_220px_auto]" onSubmit={onSubmit}>
    <select className="editor min-h-0" value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value as Deployment['provider'] })} disabled={disabled}>
      {deploymentProviders.map((provider) => <option key={provider}>{provider}</option>)}
    </select>
    <input className="editor min-h-0" placeholder="Service" value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} disabled={disabled} />
    <input className="editor min-h-0" placeholder="Version" value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} disabled={disabled} />
    <select className="editor min-h-0" value={draft.environment} onChange={(event) => setDraft({ ...draft, environment: event.target.value as Deployment['environment'] })} disabled={disabled}>
      {['staging', 'production'].map((environment) => <option key={environment}>{environment}</option>)}
    </select>
    <select className="editor min-h-0" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Deployment['status'] })} disabled={disabled}>
      {['Queued', 'Running', 'Succeeded', 'Failed', 'Rolled Back'].map((status) => <option key={status}>{status}</option>)}
    </select>
    <input className="editor min-h-0" type="datetime-local" value={draft.startedAt} onChange={(event) => setDraft({ ...draft, startedAt: event.target.value })} disabled={disabled} />
    <button className="toggle inline-flex items-center justify-center gap-2" type="submit" disabled={disabled}><Plus size={16} /> Add</button>
    <input className="editor min-h-0 md:col-span-2" placeholder="Deployment URL" value={draft.deploymentUrl} onChange={(event) => setDraft({ ...draft, deploymentUrl: event.target.value })} disabled={disabled} />
    <input className="editor min-h-0" placeholder="Commit SHA" value={draft.commitSha} onChange={(event) => setDraft({ ...draft, commitSha: event.target.value })} disabled={disabled} />
    <input className="editor min-h-0" placeholder="Branch" value={draft.branch} onChange={(event) => setDraft({ ...draft, branch: event.target.value })} disabled={disabled} />
    <input className="editor min-h-0" placeholder="Triggered by" value={draft.triggeredBy} onChange={(event) => setDraft({ ...draft, triggeredBy: event.target.value })} disabled={disabled} />
    <input className="editor min-h-0" placeholder="External ID" value={draft.externalId} onChange={(event) => setDraft({ ...draft, externalId: event.target.value })} disabled={disabled} />
  </form>
);

const IncidentTable = ({ incidents, onUpdate, disabled }: { incidents: Incident[]; onUpdate: (incident: Incident, status: Incident['status']) => void; disabled: boolean }) => (
  <div className="card surface-card overflow-x-auto">
    <table className="data-table"><thead><tr><th>Title</th><th>Description</th><th>Severity</th><th>Status</th><th>Related Deployment</th><th>Created At</th><th>Resolved At</th><th>Actions</th></tr></thead><tbody>
      {incidents.map((incident) => (
        <tr key={incident.id}>
          <td>{incident.title}</td>
          <td>{incident.description}</td>
          <td>{incident.severity}</td>
          <td><StatusBadge value={incident.status} /></td>
          <td>{incident.relatedDeploymentId || ''}</td>
          <td>{new Date(incident.createdAt).toLocaleString()}</td>
          <td>{incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString() : ''}</td>
          <td>
            <div className="flex gap-2">
              <select value={incident.status} disabled={disabled} onChange={(event) => onUpdate(incident, event.target.value as Incident['status'])}>
                {['Open', 'Investigating', 'Identified', 'Monitoring', 'Resolved'].map((status) => <option key={status}>{status}</option>)}
              </select>
              {incident.status !== 'Resolved' ? <button className="button-secondary" type="button" disabled={disabled} onClick={() => onUpdate(incident, 'Resolved')}>Resolve</button> : null}
            </div>
          </td>
        </tr>
      ))}
      {!incidents.length ? <tr><td colSpan={8}>No incidents recorded for this project.</td></tr> : null}
    </tbody></table>
  </div>
);

const formatProjectHealthStatus = (check?: ProjectHealthCheck) => {
  if (!check) return 'No checks yet';
  if (check.status === 'healthy') return 'Healthy';
  if (check.status === 'warning') return 'Warning';
  return 'Down';
};

const statusTone = (value: string) => {
  const normalized = value.toLowerCase();
  if (['healthy', 'active', 'succeeded', 'done', 'resolved', 'completed'].includes(normalized)) return 'status-healthy';
  if (['down', 'failed', 'critical'].includes(normalized)) return 'status-down';
  return 'status-warning';
};

const StatusBadge = ({ value }: { value: string }) => (
  <span className={`status-badge ${statusTone(value)}`}>
    <span className="status-badge-dot" />
    {value}
  </span>
);

const MetricTile = ({ label, value, helper, icon: Icon, compact = false }: { label: string; value: string | number; helper?: string; icon: LucideIcon; compact?: boolean }) => (
  <div className={`card surface-card metric-card ${compact ? 'metric-card-compact' : ''}`}>
    <div className="metric-card-top">
      <div className="stack-sm">
        <span className="metric-kicker">{compact ? 'Project metric' : 'Project overview'}</span>
        <h3>{label}</h3>
      </div>
      <span className="metric-icon"><Icon size={18} /></span>
    </div>
    <p className={compact ? 'metric-sm' : 'metric'}>{value}</p>
    {helper ? <p className="subtle">{helper}</p> : null}
  </div>
);

const ProjectHealthPanel = ({ project, healthChecks }: { project: Project; healthChecks: ProjectHealthCheck[] }) => {
  const latest = healthChecks[0];
  const successful = healthChecks.find((check) => check.status === 'healthy');
  const failed = healthChecks.find((check) => check.status === 'down');
  const uptime = healthChecks.length ? Number(((healthChecks.filter((check) => check.status === 'healthy').length / healthChecks.length) * 100).toFixed(1)) : null;
  const avgResponse = healthChecks.length ? Math.round(healthChecks.reduce((sum, check) => sum + check.responseTimeMs, 0) / healthChecks.length) : null;
  const trend = healthChecks.slice(0, 16).reverse();
  return (
  <div className="card surface-card">
    <div className="topbar">
      <div>
        <h3>Service Health</h3>
        <p className="subtle">Latest app check.</p>
      </div>
      {latest ? <StatusBadge value={formatProjectHealthStatus(latest)} /> : null}
    </div>
    <div className="grid grid-dense">
      {project.appUrl ? (
        <div className="health-row">
          <span className={`health-dot ${latest?.status === 'healthy' ? 'health-dot-ok' : latest?.status === 'down' ? 'health-dot-bad' : ''}`} />
          <div>
            <strong>{project.serviceName || project.name}</strong>
            <p className="subtle">
              {formatProjectHealthStatus(latest)}
              {latest?.statusCode ? ` · HTTP ${latest.statusCode}` : ''}
              {latest?.responseTimeMs ? ` · ${latest.responseTimeMs} ms` : ''}
              {latest?.checkedAt ? ` · ${new Date(latest.checkedAt).toLocaleTimeString()}` : ''}
            </p>
          </div>
        </div>
      ) : <p className="subtle">No App URL configured.</p>}
    </div>
    {project.appUrl ? (
      <>
        <div className="grid grid-dense mt-4">
          <MetricTile label="Uptime" value={uptime !== null ? `${uptime}%` : 'No data'} helper="Recent checks" icon={Waypoints} compact />
          <MetricTile label="Avg Response" value={avgResponse !== null ? `${avgResponse} ms` : 'No data'} helper="Recent checks" icon={Gauge} compact />
          <MetricTile label="Last Success" value={successful ? new Date(successful.checkedAt).toLocaleTimeString() : 'None'} helper={successful?.statusCode ? `HTTP ${successful.statusCode}` : ''} icon={Activity} compact />
          <MetricTile label="Last Failure" value={failed ? new Date(failed.checkedAt).toLocaleTimeString() : 'None'} helper={failed?.error || ''} icon={ShieldAlert} compact />
        </div>
        <div className="health-trend" aria-label="Health trend">
          {trend.map((check) => (
            <span key={check.id} className={`health-trend-bar ${check.status === 'healthy' ? 'health-trend-ok' : check.status === 'down' ? 'health-trend-bad' : 'health-trend-warn'}`} title={`${check.status} · HTTP ${check.statusCode} · ${check.responseTimeMs} ms`} />
          ))}
        </div>
      </>
    ) : null}
  </div>
  );
};

const dateKey = (value: string) => new Date(value).toISOString().slice(0, 10);

const buildSeries = (tasks: Task[], deployments: Deployment[], incidents: Incident[]) => {
  const dates = Array.from(new Set([
    ...tasks.map((task) => dateKey(task.createdAt)),
    ...deployments.map((deployment) => dateKey(deployment.startedAt)),
    ...incidents.map((incident) => dateKey(incident.createdAt)),
  ])).sort();

  return dates.map((date) => ({
    date,
    tasks: tasks.filter((task) => dateKey(task.createdAt) === date).length,
    deployments: deployments.filter((deployment) => dateKey(deployment.startedAt) === date).length,
    incidents: incidents.filter((incident) => dateKey(incident.createdAt) === date).length,
  }));
};

const ProjectAnalytics = ({ tasks, deployments, incidents, summary }: { tasks: Task[]; deployments: Deployment[]; incidents: Incident[]; summary: { totalTasks: number; openTasks: number; completedTasks: number; openIncidents: number; deployments: number } }) => {
  const series = buildSeries(tasks, deployments, incidents);
  const cards: Array<[string, number]> = [
    ['Total Tasks', summary.totalTasks],
    ['Completed Tasks', summary.completedTasks],
    ['Open Tasks', summary.openTasks],
    ['Total Deployments', summary.deployments],
    ['Open Incidents', summary.openIncidents],
  ];

  return (
    <div className="space-y-6">
      <div className="grid">
        {cards.map(([label, value]) => (
          <MetricTile key={label} label={label} value={value} icon={label.includes('Incident') ? ShieldAlert : label.includes('Deployment') ? GitBranch : FolderKanban} compact />
        ))}
      </div>
      <div className="section">
        <ProjectAreaChart title="Tasks Over Time" data={series} dataKey="tasks" />
        <ProjectBarChart title="Deployments Over Time" data={series} dataKey="deployments" />
        <ProjectBarChart title="Incidents Over Time" data={series} dataKey="incidents" />
      </div>
    </div>
  );
};

const ProjectAreaChart = ({ title, data, dataKey }: { title: string; data: Array<Record<string, string | number>>; dataKey: string }) => (
  <div className="card surface-card">
    <h3>{title}</h3>
    <div className="chart-container">
      <ResponsiveContainer>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Area dataKey={dataKey} stroke="#2563eb" fill="#93c5fd" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const ProjectBarChart = ({ title, data, dataKey }: { title: string; data: Array<Record<string, string | number>>; dataKey: string }) => (
  <div className="card surface-card">
    <h3>{title}</h3>
    <div className="chart-container">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey={dataKey} fill="#16a34a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const ProjectMonitoring = ({ project, incidents, deployments, healthChecks }: { project: Project; incidents: Incident[]; deployments: Deployment[]; healthChecks: ProjectHealthCheck[] }) => {
  const openIncidents = incidents.filter((incident) => incident.status !== 'Resolved');
  const recentDeployments = deployments.slice(0, 5);
  const failedDeployments = deployments.filter((deployment) => ['Failed', 'Rolled Back'].includes(deployment.status));
  const latestHealthCheck = healthChecks[0];
  const uptime = healthChecks.length ? ((healthChecks.filter((check) => check.status === 'healthy').length / healthChecks.length) * 100).toFixed(1) : null;
  const currentStatus = latestHealthCheck?.status === 'down'
    ? 'Down'
    : latestHealthCheck?.status === 'warning' || openIncidents.length || failedDeployments.length
      ? 'Warning'
      : latestHealthCheck ? 'Healthy' : 'No checks yet';
  const statusCodes = Object.entries(healthChecks.reduce<Record<string, number>>((counts, check) => {
    const code = check.statusCode ? String(check.statusCode) : 'No response';
    counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {})).sort(([a], [b]) => Number(a) - Number(b));
  const healthSeries = healthChecks
    .slice(0, 16)
    .reverse()
    .map((check) => ({
      time: new Date(check.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      responseTime: check.responseTimeMs,
      uptime: check.status === 'healthy' ? 100 : check.status === 'warning' ? 50 : 0,
      statusCode: check.statusCode || 0,
    }));
  const deploymentStatus = deployments.reduce<Record<string, number>>((counts, deployment) => {
    counts[deployment.status] = (counts[deployment.status] || 0) + 1;
    return counts;
  }, {});
  const incidentStatus = incidents.reduce<Record<string, number>>((counts, incident) => {
    counts[incident.status] = (counts[incident.status] || 0) + 1;
    return counts;
  }, {});
  const grafanaPanelData = [
    { name: 'Succeeded', value: deploymentStatus.Succeeded || 0 },
    { name: 'Running', value: deploymentStatus.Running || 0 },
    { name: 'Failed', value: (deploymentStatus.Failed || 0) + (deploymentStatus['Rolled Back'] || 0) },
  ];
  const incidentPanelData = [
    { name: 'Open', value: incidentStatus.Open || 0 },
    { name: 'Investigating', value: incidentStatus.Investigating || 0 },
    { name: 'Resolved', value: incidentStatus.Resolved || 0 },
  ];
  const projectGrafanaUrl = grafanaProjectUrl(project);

  return (
    <div className="space-y-6">
      <div className="monitoring-summary">
        <div className="card surface-card">
          <div className="topbar">
            <div>
              <h3>DevPilot Observability</h3>
              <p className="subtle">Live observability for project health, release status, and incident signals inside DevPilot.</p>
            </div>
            <a className="toggle inline-flex items-center gap-2" href={projectGrafanaUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open Grafana Cloud
            </a>
          </div>
          <div className="monitoring-meta">
            <div className="mini-stat">
              <span className="metric-kicker">Current status</span>
              <div className="hero-meta"><StatusBadge value={currentStatus} /></div>
            </div>
            <div className="mini-stat">
              <span className="metric-kicker">Mapped service</span>
              <span className="metric-sm">{project.serviceName || 'Not mapped'}</span>
            </div>
            <div className="mini-stat">
              <span className="metric-kicker">App URL</span>
              <span className="subtle">{project.appUrl || 'Not configured'}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-monitoring">
          <MetricTile label="URL Health" value={formatProjectHealthStatus(latestHealthCheck)} helper="Latest check" icon={Gauge} compact />
          <MetricTile label="Last Check" value={latestHealthCheck ? new Date(latestHealthCheck.checkedAt).toLocaleTimeString() : 'None'} helper="Completed probe" icon={Activity} compact />
          <MetricTile label="Uptime" value={uptime ? `${uptime}%` : 'No data'} helper="Healthy checks" icon={Waypoints} compact />
          <MetricTile label="Response Time" value={latestHealthCheck ? `${latestHealthCheck.responseTimeMs} ms` : 'No data'} helper="Latest latency" icon={Gauge} compact />
          <MetricTile label="Status Code" value={latestHealthCheck?.statusCode || 'No data'} helper="Latest HTTP code" icon={Boxes} compact />
          <MetricTile label="Open Incidents" value={openIncidents.length} helper="Unresolved" icon={ShieldAlert} compact />
        </div>
      </div>
      <div className="grafana-dashboard">
        <div className="grafana-dashboard-header">
          <div>
            <span className="metric-kicker">Grafana dashboard</span>
            <h3>{project.name} Observability</h3>
            <p>Live dashboard panels rendered directly from DevPilot project telemetry.</p>
          </div>
          <div className="hero-meta">
            <span className="grafana-live">Live</span>
            <a className="toggle inline-flex items-center gap-2" href={projectGrafanaUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Grafana Cloud
            </a>
          </div>
        </div>
        <div className="grafana-panels">
          <div className="grafana-panel grafana-panel-wide">
            <div className="grafana-panel-title">
              <span>Response Time</span>
              <strong>{latestHealthCheck ? `${latestHealthCheck.responseTimeMs} ms` : 'No data'}</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <AreaChart data={healthSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="time" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Area dataKey="responseTime" stroke="#60a5fa" fill="#1d4ed8" fillOpacity={0.35} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>Uptime</span>
              <strong>{uptime ? `${uptime}%` : 'No data'}</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <AreaChart data={healthSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="time" stroke="#94a3b8" hide />
                  <YAxis stroke="#94a3b8" domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Area dataKey="uptime" stroke="#22c55e" fill="#15803d" fillOpacity={0.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>Deployments</span>
              <strong>{deployments.length}</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <BarChart data={grafanaPanelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Bar dataKey="value" fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>Incidents</span>
              <strong>{openIncidents.length} open</strong>
            </div>
            <div className="grafana-chart">
              <ResponsiveContainer>
                <BarChart data={incidentPanelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#263244" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155', color: '#e5e7eb' }} />
                  <Bar dataKey="value" fill="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grafana-panel">
            <div className="grafana-panel-title">
              <span>Status Codes</span>
              <strong>{latestHealthCheck?.statusCode || 'n/a'}</strong>
            </div>
            <div className="grafana-table">
              {statusCodes.map(([code, count]) => (
                <div key={code}><span>{code}</span><strong>{count}</strong></div>
              ))}
              {!statusCodes.length ? <p>No status code samples yet.</p> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="card surface-card">
          <h3>App Health Checks</h3>
          <div className="timeline">
            {healthChecks.slice(0, 8).map((check) => (
              <div className="timeline-item" key={check.id}>
                <span className={`health-dot ${check.status === 'healthy' ? 'health-dot-ok' : check.status === 'down' ? 'health-dot-bad' : ''}`} />
                <div><strong>{check.status} · HTTP {check.statusCode || 'n/a'}</strong><p className="subtle">{check.responseTimeMs} ms · {new Date(check.checkedAt).toLocaleString()}{check.error ? ` · ${check.error}` : ''}</p></div>
              </div>
            ))}
            {!healthChecks.length ? <p className="subtle">No health checks yet.</p> : null}
          </div>
        </div>
        <div className="card surface-card">
          <h3>Status Codes</h3>
          <div className="timeline">
            {statusCodes.map(([code, count]) => (
              <div className="timeline-item" key={code}>
                <span className={`health-dot ${Number(code) >= 500 ? 'health-dot-bad' : Number(code) >= 400 ? '' : 'health-dot-ok'}`} />
                <div><strong>{code}</strong><p className="subtle">{count} checks</p></div>
              </div>
            ))}
            {!statusCodes.length ? <p className="subtle">No status codes yet.</p> : null}
          </div>
        </div>
        <div className="card surface-card">
          <h3>Open Incidents</h3>
          <div className="timeline">
            {openIncidents.slice(0, 5).map((incident) => (
              <div className="timeline-item" key={incident.id}>
                <span className="timeline-dot" />
                <div><strong>{incident.title}</strong><p className="subtle">{incident.severity} · {incident.status} · {new Date(incident.createdAt).toLocaleString()}</p></div>
              </div>
            ))}
            {!openIncidents.length ? <p className="subtle">No open incidents.</p> : null}
          </div>
        </div>
        <div className="card surface-card">
          <h3>Recent Deployments</h3>
          <div className="timeline">
            {recentDeployments.map((deployment) => (
              <div className="timeline-item" key={deployment.id}>
                <span className="timeline-dot" />
                <div><strong>{deployment.version} · {deployment.service}</strong><p className="subtle">{deployment.provider} · {deployment.environment} · {deployment.status} · {new Date(deployment.startedAt).toLocaleString()}</p></div>
              </div>
            ))}
            {!recentDeployments.length ? <p className="subtle">No deployments yet.</p> : null}
          </div>
        </div>
        <ProjectHealthPanel project={project} healthChecks={healthChecks} />
      </div>
    </div>
  );
};
