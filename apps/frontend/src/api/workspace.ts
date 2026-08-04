import { apiClient } from './client';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectMember = {
  email: string;
  name: string;
  role: ProjectRole;
};

export type WorkspaceTeam = {
  workspace: {
    id: string;
    name: string;
    mode: 'shared';
    policy: string;
  };
  members: ProjectMember[];
  invites: WorkspaceInvite[];
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  projectKey: string;
  description: string;
  owner: string;
  ownerEmail?: string;
  members: ProjectMember[];
  serviceName: string;
  deploymentPlatform: 'GitHub Pages' | 'Vercel' | 'Railway' | 'Render' | 'Other';
  appUrl: string;
  deploymentWebhookToken: string;
  status: 'Active' | 'Paused' | 'Completed';
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  openTasks?: number;
  openIncidents?: number;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: 'Feature' | 'Bug' | 'Task' | 'Incident';
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  points: number;
  due: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
};

export type ServiceHealth = {
  name: string;
  path: string;
  status: 'healthy' | 'unhealthy';
  service: string;
  timestamp: string;
};

export type MonitoringSummary = {
  status: 'Healthy' | 'Warning' | 'Down';
  totalRequests: number;
  uptimePercent: number | null;
  avgResponseTimeMs: number | null;
  statusCodes: Record<string, number>;
  lastUpdatedAt: string;
};

export type GrafanaStatus = {
  configured: boolean;
  remoteWriteUrl: string;
  stackUrl: string;
  usernameConfigured: boolean;
  tokenConfigured: boolean;
  lastPush: null | {
    pushed: boolean;
    reason: string;
    series?: number;
    timestamp?: string;
    error?: string;
  };
  check: {
    pushed: boolean;
    reason: string;
    series?: number;
    timestamp?: string;
    error?: string;
  };
};

export type Dashboard = {
  metrics: Array<{ label: string; value: string }>;
  timeline: Array<{ title: string; owner: string; time: string }>;
  deployments: Deployment[];
  incidents: Incident[];
  projectHealth: Array<{
    projectId: string;
    name: string;
    serviceName: string;
    appUrl: string;
    status: ProjectHealthCheck['status'] | 'unknown';
    statusCode: number | null;
    responseTimeMs: number | null;
    checkedAt: string | null;
  }>;
};

export type Deployment = {
  id: string;
  projectId: string;
  provider: 'Manual' | 'Vercel' | 'GitHub Actions' | 'Railway' | 'Render' | 'Other';
  service: string;
  environment: 'staging' | 'production';
  status: 'Queued' | 'Running' | 'Succeeded' | 'Failed' | 'Rolled Back';
  version: string;
  deploymentUrl: string;
  commitSha: string;
  branch: string;
  triggeredBy: string;
  externalId: string;
  startedAt: string;
  durationMinutes: number;
};

export type Incident = {
  id: string;
  projectId: string;
  relatedDeploymentId: string;
  title: string;
  description: string;
  severity: Priority;
  status: 'Open' | 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';
  service: string;
  createdAt: string;
  resolvedAt: string | null;
  summary: string;
};

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<ProjectRole, 'owner'>;
  token: string;
  invitedBy: string;
  status: 'Pending' | 'Accepted' | 'Revoked';
  createdAt: string;
  acceptedAt: string;
};

export type ProjectEnvironment = {
  id: string;
  projectId: string;
  name: string;
  appUrl: string;
  deploymentWebhookUrl: string;
  healthStatus: 'healthy' | 'warning' | 'down' | 'unknown';
  lastCheckedAt: string;
  lastDeploymentId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectHealthCheck = {
  id: string;
  projectId: string;
  appUrl: string;
  status: 'healthy' | 'warning' | 'down';
  statusCode: number;
  responseTimeMs: number;
  checkedAt: string;
  error: string;
};

export type ProjectComment = {
  id: string;
  projectId: string;
  taskId: string;
  body: string;
  author: string;
  mentions: string[];
  createdAt: string;
};

export type ProjectInvite = {
  id: string;
  projectId: string;
  workspaceId: string;
  email: string;
  role: Exclude<ProjectRole, 'owner'>;
  token: string;
  invitedBy: string;
  status: 'Pending' | 'Accepted' | 'Revoked';
  createdAt: string;
  acceptedAt: string;
};

export type Sprint = {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  capacity: number;
  status: 'Planned' | 'Active' | 'Completed';
  createdAt: string;
  updatedAt: string;
};

export type CodeMetric = {
  id: string;
  projectId: string;
  provider: 'GitHub' | 'GitLab' | 'Manual';
  repository: string;
  branch: string;
  commits: number;
  pullRequests: number;
  openIssues: number;
  coverage: number;
  deploymentFrequency: number;
  leadTimeHours: number;
  sourceUrl: string;
  lastSyncedAt: string;
};

export type AlertIntegration = {
  id: string;
  projectId: string;
  provider: 'Slack' | 'Discord';
  channel: string;
  webhookUrl: string;
  enabled: boolean;
  createdAt: string;
  lastTestAt: string;
};

export type TenantProfile = {
  id: string;
  name: string;
  domain: string;
  plan: 'Starter' | 'Professional' | 'Enterprise';
  primaryRegion: string;
  dataRetentionDays: number;
  ssoEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BackupRecord = {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  includes: string[];
};

export type IncidentAssistantInsight = {
  id: string;
  projectId: string;
  incidentId: string;
  summary: string;
  likelyRootCause: string;
  nextActions: string[];
  riskLevel: Priority;
  createdAt: string;
};

export type Postmortem = {
  id: string;
  projectId: string;
  incidentId: string;
  title: string;
  impact: string;
  rootCause: string;
  timeline: string[];
  whatWentWell: string[];
  actionItems: string[];
  createdAt: string;
};

export type SloRecord = {
  id: string;
  projectId: string;
  name: string;
  target: number;
  current: number;
  windowDays: number;
  errorBudgetRemaining: number;
  burnRate: number;
  createdAt: string;
  updatedAt: string;
};

export type ClientReport = {
  id: string;
  projectId: string;
  period: string;
  format: 'Weekly' | 'Monthly';
  summary: string;
  uptime: number;
  deployments: number;
  incidents: number;
  completedTasks: number;
  risks: string[];
  createdAt: string;
};

export type ReleaseApproval = {
  id: string;
  projectId: string;
  deploymentId: string;
  title: string;
  requester: string;
  approver: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  notes: string;
  createdAt: string;
  decidedAt: string;
};

export type StatusPage = {
  id: string;
  projectId: string;
  publicSlug: string;
  headline: string;
  status: 'Operational' | 'Degraded' | 'Outage' | 'Maintenance';
  message: string;
  updatedAt: string;
};

export type OnCallSchedule = {
  id: string;
  projectId: string;
  primary: string;
  secondary: string;
  escalationMinutes: number;
  rotation: string;
  timezone: string;
  updatedAt: string;
};

export type AlertRule = {
  id: string;
  projectId: string;
  name: string;
  condition: string;
  threshold: number;
  channel: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AlertEvaluation = {
  id: string;
  projectId: string;
  ruleId: string;
  ruleName: string;
  matched: boolean;
  signal: string;
  value: number;
  threshold: number;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  projectId: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
};

export type ProductFeatures = {
  tenant: TenantProfile;
  comments: ProjectComment[];
  invites: ProjectInvite[];
  sprints: Sprint[];
  codeMetrics: CodeMetric[];
  alertIntegrations: AlertIntegration[];
  backups: BackupRecord[];
  incidentAssistant: IncidentAssistantInsight[];
  postmortems: Postmortem[];
  slos: SloRecord[];
  clientReports: ClientReport[];
  releaseApprovals: ReleaseApproval[];
  statusPages: StatusPage[];
  onCall: OnCallSchedule[];
  alertRules: AlertRule[];
  environments: ProjectEnvironment[];
  alertEvaluations: AlertEvaluation[];
  workspaceInvites: WorkspaceInvite[];
  audit: AuditRecord[];
};

export type LaunchReadiness = {
  score: number;
  status: 'Launch Ready' | 'Almost Ready' | 'Needs Setup';
  workspace: { id: string; name: string };
  metrics: {
    projects: number;
    tasks: number;
    deployments: number;
    incidents: number;
    healthChecks: number;
    openIncidents: number;
  };
  checklist: Array<{
    id: string;
    label: string;
    done: boolean;
    detail: string;
  }>;
  database: {
    engine: string;
    durable: boolean;
    workspaceId: string;
    tables: string[];
  };
  grafana: {
    configured: boolean;
    stackUrl: string;
    lastPush: null | {
      pushed: boolean;
      reason: string;
      series?: number;
      timestamp?: string;
      error?: string;
    };
  };
  tenant: TenantProfile;
  generatedAt: string;
};

export type ActivityLog = {
  id: string;
  actor: string;
  role: string;
  action: string;
  projectId?: string;
  eventType?: string;
  timestamp: string;
};

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  detail: string;
  timestamp: string;
  projectId: string;
  actor: string;
};

export type DemoWorkspaceResult = {
  ok: boolean;
  seed: {
    requested: number;
    created: number;
    existing: number;
    projects: number;
  };
  totals: {
    visibleProjects: number;
    healthChecks: number;
  };
  grafana: unknown;
  at: string;
};

export const workspaceApi = {
  team: () => apiClient.get<WorkspaceTeam>('/api/workspace/team'),
  createWorkspaceInvite: (invite: { email: string; role: Exclude<ProjectRole, 'owner'> }) =>
    apiClient.post<{ invite: WorkspaceInvite; inviteUrl: string }>('/api/workspace/invites', invite),
  launchReadiness: () => apiClient.get<LaunchReadiness>('/api/launch-readiness'),
  prepareDemoWorkspace: () => apiClient.post<DemoWorkspaceResult>('/api/demo/workspace', { limit: 100 }),
  activity: (filters?: { projectId?: string; eventType?: string; from?: string; to?: string }) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return apiClient.get<ActivityLog[]>(query ? `/activity?${query}` : '/activity');
  },
  notifications: () => apiClient.get<{ notifications: NotificationRecord[] }>('/api/notifications'),
  search: (query: string) => apiClient.get<{ query: string; results: string[] }>(`/search?q=${encodeURIComponent(query)}`),
  dashboard: () => apiClient.get<Dashboard>('/api/dashboard'),
  projects: () => apiClient.get<{ projects: Project[] }>('/api/projects'),
  createProject: (project: Partial<Project>) => apiClient.post<{ project: Project }>('/api/projects', project),
  updateProject: (id: string, patch: Partial<Project>) => apiClient.patch<{ project: Project }>(`/api/projects/${id}`, patch),
  deleteProject: (id: string) => apiClient.delete<{ ok: true }>(`/api/projects/${id}`),
  projectSummary: (id: string) => apiClient.get<{ project: Project; tasks: Task[]; deployments: Deployment[]; incidents: Incident[]; healthChecks: ProjectHealthCheck[] }>(`/api/projects/${id}/summary`),
  tasks: (projectId?: string) => apiClient.get<{ tasks: Task[] }>(projectId ? `/api/tasks?projectId=${projectId}` : '/api/tasks'),
  createTask: (task: Partial<Task>) => apiClient.post<{ task: Task }>('/api/tasks', task),
  updateTask: (id: string, patch: Partial<Task>) => apiClient.patch<{ task: Task }>(`/api/tasks/${id}`, patch),
  deleteTask: (id: string) => apiClient.delete<{ ok: true }>(`/api/tasks/${id}`),
  serviceHealth: () => apiClient.get<{ services: ServiceHealth[] }>('/api/service-health'),
  monitoringSummary: () => apiClient.get<MonitoringSummary>('/api/monitoring/summary'),
  grafanaStatus: () => apiClient.get<GrafanaStatus>('/api/grafana/status'),
  projectHealthChecks: (projectId: string) => apiClient.get<{ healthChecks: ProjectHealthCheck[] }>(`/api/projects/${projectId}/health-checks`),
  deployments: () => apiClient.get<{ deployments: Deployment[] }>('/api/deployments'),
  projectDeployments: (projectId: string) => apiClient.get<{ deployments: Deployment[] }>(`/api/deployments?projectId=${projectId}`),
  createDeployment: (deployment: Partial<Deployment>) => apiClient.post<{ deployment: Deployment }>('/api/deployments', deployment),
  incidents: (projectId?: string) => apiClient.get<{ incidents: Incident[] }>(projectId ? `/api/incidents?projectId=${projectId}` : '/api/incidents'),
  createIncident: (incident: Partial<Incident>) => apiClient.post<{ incident: Incident }>('/api/incidents', incident),
  updateIncident: (id: string, patch: Partial<Incident>) => apiClient.patch<{ incident: Incident }>(`/api/incidents/${id}`, patch),
  productFeatures: (projectId?: string) => apiClient.get<ProductFeatures>(projectId ? `/api/product/features?projectId=${projectId}` : '/api/product/features'),
  environments: (projectId: string) => apiClient.get<{ environments: ProjectEnvironment[] }>(`/api/projects/${projectId}/environments`),
  upsertEnvironment: (projectId: string, environment: Partial<ProjectEnvironment>) =>
    apiClient.post<{ environment: ProjectEnvironment }>(`/api/projects/${projectId}/environments`, environment),
  comments: (projectId: string) => apiClient.get<{ comments: ProjectComment[] }>(`/api/projects/${projectId}/comments`),
  createComment: (projectId: string, comment: Partial<ProjectComment>) => apiClient.post<{ comment: ProjectComment }>(`/api/projects/${projectId}/comments`, comment),
  projectInvites: (projectId: string) => apiClient.get<{ invites: ProjectInvite[] }>(`/api/projects/${projectId}/invites`),
  createProjectInvite: (projectId: string, invite: { email: string; role: Exclude<ProjectRole, 'owner'> }) =>
    apiClient.post<{ invite: ProjectInvite; project: Project; inviteUrl: string }>(`/api/projects/${projectId}/invites`, invite),
  acceptInvite: (token: string) => apiClient.post<{ invite: ProjectInvite }>(`/api/invites/${token}/accept`, {}),
  sprints: (projectId: string) => apiClient.get<{ sprints: Sprint[] }>(`/api/projects/${projectId}/sprints`),
  createSprint: (projectId: string, sprint: Partial<Sprint>) => apiClient.post<{ sprint: Sprint }>(`/api/projects/${projectId}/sprints`, sprint),
  updateSprint: (projectId: string, sprintId: string, patch: Partial<Sprint>) => apiClient.patch<{ sprint: Sprint }>(`/api/projects/${projectId}/sprints/${sprintId}`, patch),
  codeMetrics: (projectId: string) => apiClient.get<{ codeMetrics: CodeMetric[] }>(`/api/projects/${projectId}/code-metrics`),
  upsertCodeMetric: (projectId: string, codeMetric: Partial<CodeMetric>) => apiClient.post<{ codeMetric: CodeMetric }>(`/api/projects/${projectId}/code-metrics`, codeMetric),
  syncGitHubRepository: (projectId: string, repository: string) =>
    apiClient.post<{ codeMetric: CodeMetric; metrics: unknown }>(`/api/projects/${projectId}/github/sync`, { repository }),
  alertIntegrations: (projectId: string) => apiClient.get<{ alertIntegrations: AlertIntegration[] }>(`/api/projects/${projectId}/alert-integrations`),
  createAlertIntegration: (projectId: string, alertIntegration: Partial<AlertIntegration>) => apiClient.post<{ alertIntegration: AlertIntegration }>(`/api/projects/${projectId}/alert-integrations`, alertIntegration),
  testAlertIntegration: (projectId: string, integrationId: string, message: string) => apiClient.post<{ result: { ok: boolean; statusCode: number; error: string }; integration: AlertIntegration }>(`/api/projects/${projectId}/alert-integrations/${integrationId}/test`, { message }),
  generateIncidentInsight: (projectId: string, incidentId: string) => apiClient.post<{ insight: IncidentAssistantInsight }>(`/api/projects/${projectId}/assistant/incidents/${incidentId}`, {}),
  generatePostmortem: (projectId: string, incidentId: string) => apiClient.post<{ postmortem: Postmortem }>(`/api/projects/${projectId}/postmortems/${incidentId}`, {}),
  upsertSlo: (projectId: string, slo: Partial<SloRecord>) => apiClient.post<{ slo: SloRecord }>(`/api/projects/${projectId}/slos`, slo),
  createClientReport: (projectId: string, format: 'Weekly' | 'Monthly') => apiClient.post<{ report: ClientReport }>(`/api/projects/${projectId}/client-reports`, { format }),
  createReleaseApproval: (projectId: string, approval: Partial<ReleaseApproval>) => apiClient.post<{ approval: ReleaseApproval }>(`/api/projects/${projectId}/release-approvals`, approval),
  updateReleaseApproval: (projectId: string, approvalId: string, patch: Partial<ReleaseApproval>) => apiClient.patch<{ approval: ReleaseApproval }>(`/api/projects/${projectId}/release-approvals/${approvalId}`, patch),
  updateStatusPage: (projectId: string, statusPage: Partial<StatusPage>) => apiClient.put<{ statusPage: StatusPage }>(`/api/projects/${projectId}/status-page`, statusPage),
  updateOnCall: (projectId: string, schedule: Partial<OnCallSchedule>) => apiClient.put<{ schedule: OnCallSchedule }>(`/api/projects/${projectId}/on-call`, schedule),
  createAlertRule: (projectId: string, rule: Partial<AlertRule>) => apiClient.post<{ rule: AlertRule; evaluations: AlertEvaluation[] }>(`/api/projects/${projectId}/alert-rules`, rule),
  backups: () => apiClient.get<{ backups: BackupRecord[] }>('/api/backups'),
  createBackup: () => apiClient.post<{ backup: BackupRecord }>('/api/backups', {}),
  updateTenant: (tenant: Partial<TenantProfile>) => apiClient.put<{ tenant: TenantProfile }>('/api/tenant', tenant),
};
