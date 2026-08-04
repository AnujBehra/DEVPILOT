import { v4 as uuid } from 'uuid';
import * as pgStore from './pgStore';
import { publicProjectCatalog } from './publicProjects';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. DevPilot uses PostgreSQL only.');
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectMember = {
  email: string;
  name: string;
  role: ProjectRole;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  projectKey: string;
  description: string;
  owner: string;
  ownerEmail: string;
  members: ProjectMember[];
  serviceName: string;
  deploymentPlatform: 'GitHub Pages' | 'Vercel' | 'Railway' | 'Render' | 'Other';
  appUrl: string;
  deploymentWebhookToken: string;
  status: 'Active' | 'Paused' | 'Completed';
  createdAt: string;
  updatedAt: string;
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

export type Slo = {
  id: string;
  service: string;
  objective: string;
  target: number;
  current: number;
  errorBudgetRemaining: number;
};

export type GitHubRepository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  stars: number;
  openIssues: number;
  lastSyncedAt: string;
};

export type GitHubCommit = {
  sha: string;
  repositoryId: string;
  message: string;
  author: string;
  committedAt: string;
  url: string;
};

export type GitHubPullRequest = {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  state: string;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  url: string;
};

export type KubernetesNode = {
  id: string;
  name: string;
  status: 'Ready' | 'NotReady';
  cpuCores: number;
  memoryGi: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
};

export type KubernetesPod = {
  id: string;
  name: string;
  namespace: string;
  status: 'Running' | 'Pending' | 'CrashLoopBackOff';
  restarts: number;
  cpuMillicores: number;
  memoryMi: number;
  nodeName: string;
};

export type KubernetesDeployment = {
  id: string;
  name: string;
  namespace: string;
  desiredReplicas: number;
  availableReplicas: number;
  image: string;
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

export type DoraMetrics = {
  deploymentFrequency: number;
  leadTimeHours: number;
  changeFailureRate: number;
  mttrMinutes: number;
};

export type IncidentAnalysis = {
  riskScore: number;
  summary: string;
  recommendations: string[];
  signals: Array<{ label: string; value: string; severity: Priority }>;
};

export type StoreState = {
  projects: Project[];
  tasks: Task[];
  deployments: Deployment[];
  slos: Slo[];
  githubRepositories: GitHubRepository[];
  githubCommits: GitHubCommit[];
  githubPullRequests: GitHubPullRequest[];
  kubernetesNodes: KubernetesNode[];
  kubernetesPods: KubernetesPod[];
  kubernetesDeployments: KubernetesDeployment[];
  incidents: Incident[];
  projectHealthChecks: ProjectHealthCheck[];
};

export const DEFAULT_WORKSPACE_ID = process.env.DEVPILOT_WORKSPACE_ID || 'my-software-team';
export const DEFAULT_WORKSPACE_NAME = process.env.DEVPILOT_WORKSPACE_NAME || 'DevPilot Team Space';

const normalizeAppUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const deploymentProviderForPublicProject = (platform: Project['deploymentPlatform']): Deployment['provider'] => {
  if (platform === 'GitHub Pages') return 'GitHub Actions';
  if (platform === 'Vercel' || platform === 'Railway' || platform === 'Render') return platform;
  return 'Other';
};

const publicProjectSeedOwner = {
  name: 'DevPilot Admin',
  email: 'admin@devpilot.local',
};

export const readStore = async (): Promise<StoreState> => pgStore.readStore();
export const readStoreAsync = readStore;
export const resetStore = () => pgStore.resetStore();

export const listProjects = () => pgStore.listProjects();
export const listProjectsAsync = listProjects;
export const findProjectByDeploymentWebhookToken = (token: string) => pgStore.findProjectByDeploymentWebhookToken(token);
export const createProject = (input: Partial<Project>) => pgStore.createProject(input);
export const updateProject = (id: string, patch: Partial<Project>) => pgStore.updateProject(id, patch);
export const deleteProject = (id: string) => pgStore.deleteProject(id);

export const createTask = (input: Partial<Task>) => pgStore.createTask(input);
export const updateTask = (id: string, patch: Partial<Task>) => pgStore.updateTask(id, patch);
export const deleteTask = (id: string) => pgStore.deleteTask(id);

export const createDeployment = (input: Partial<Deployment>) => pgStore.createDeployment(input);
export const createIncident = (input: Partial<Incident>) => pgStore.createIncident(input);
export const updateIncident = (id: string, patch: Partial<Incident>) => pgStore.updateIncident(id, patch);
export const listIncidents = () => pgStore.listIncidents();
export const listIncidentsAsync = listIncidents;

export const recordProjectHealthCheck = (input: Omit<ProjectHealthCheck, 'id' | 'checkedAt'> & { checkedAt?: string }) =>
  pgStore.recordProjectHealthCheck(input);
export const listProjectHealthChecks = (projectId?: string) => pgStore.listProjectHealthChecks(projectId);
export const listProjectHealthChecksAsync = listProjectHealthChecks;

export const ensurePublicSeedData = async () => readStore();

export const ensurePublicProjectCatalog = async (limit = 100) => {
  const desiredLimit = Math.max(1, Math.min(limit, publicProjectCatalog.length));
  const catalog = publicProjectCatalog.slice(0, desiredLimit);
  const existingProjects = await listProjects();
  const projectsByUrl = new Map(existingProjects.map((project) => [normalizeAppUrl(project.appUrl).toLowerCase(), project]));
  const projectsByName = new Map(existingProjects.map((project) => [project.name.trim().toLowerCase(), project]));
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const created: Project[] = [];
  const existing: Project[] = [];

  for (const item of catalog) {
    const appUrl = normalizeAppUrl(item.appUrl);
    const project = projectsByUrl.get(appUrl.toLowerCase()) || projectsByName.get(item.name.trim().toLowerCase());
    if (project) {
      existing.push(project);
      continue;
    }

    const createdProject = await createProject({
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: item.name,
      projectKey: item.projectKey,
      description: item.description,
      owner: publicProjectSeedOwner.name,
      ownerEmail: publicProjectSeedOwner.email,
      members: [{ email: publicProjectSeedOwner.email, name: publicProjectSeedOwner.name, role: 'owner' }],
      serviceName: item.serviceName,
      deploymentPlatform: item.deploymentPlatform,
      appUrl,
      status: 'Active',
    });
    created.push(createdProject);
    projectsByUrl.set(appUrl.toLowerCase(), createdProject);
    projectsByName.set(item.name.trim().toLowerCase(), createdProject);

    await createTask({
      projectId: createdProject.id,
      title: `Monitor ${item.name} production availability`,
      description: `Track uptime, response time, and deployment signal for ${appUrl}.`,
      type: 'Task',
      status: 'IN_PROGRESS',
      priority: 'High',
      assignee: publicProjectSeedOwner.name,
      points: 2,
      due,
      labels: ['production', 'health-check'],
    });
    await createTask({
      projectId: createdProject.id,
      title: `Connect ${item.serviceName} deployment history`,
      description: `Keep deployment records and webhook metadata aligned for ${item.name}.`,
      type: 'Task',
      status: 'DONE',
      priority: 'Medium',
      assignee: publicProjectSeedOwner.name,
      points: 1,
      due,
      labels: ['deployment', 'webhook'],
    });
    await createDeployment({
      projectId: createdProject.id,
      provider: deploymentProviderForPublicProject(item.deploymentPlatform),
      service: item.serviceName,
      environment: 'production',
      status: 'Succeeded',
      version: `public-${item.projectKey.toLowerCase()}-${item.commitSha.slice(0, 7)}`,
      deploymentUrl: appUrl,
      commitSha: item.commitSha,
      branch: item.branch,
      triggeredBy: 'public-project-catalog',
      externalId: `public-catalog:${item.projectKey}:${item.commitSha}`,
      startedAt: new Date(Date.now() - (created.length + existing.length + 1) * 45 * 60_000).toISOString(),
      durationMinutes: 2 + ((created.length + existing.length) % 6),
    });
  }

  return {
    requested: desiredLimit,
    created: created.length,
    existing: existing.length,
    projectIds: [...existing, ...created].map((project) => project.id),
    appUrls: catalog.map((project) => normalizeAppUrl(project.appUrl)),
  };
};

export const upsertGitHubRepository = async (repo: Omit<GitHubRepository, 'id' | 'lastSyncedAt'>) => {
  const existing = (await listGitHubRepositories()).find((item) => item.fullName === repo.fullName);
  return existing?.id || uuid();
};

export const replaceGitHubCommits = async (_repositoryId: string, _commits: GitHubCommit[]) => undefined;
export const replaceGitHubPullRequests = async (_repositoryId: string, _prs: GitHubPullRequest[]) => undefined;
export const listGitHubRepositories = async (): Promise<GitHubRepository[]> => [];
export const listGitHubCommits = async (): Promise<GitHubCommit[]> => [];
export const listGitHubPullRequests = async (): Promise<GitHubPullRequest[]> => [];

export const listKubernetesNodes = async (): Promise<KubernetesNode[]> => [];
export const listKubernetesPods = async (): Promise<KubernetesPod[]> => [];
export const listKubernetesDeployments = async (): Promise<KubernetesDeployment[]> => [];

export const calculateDoraMetrics = async (): Promise<DoraMetrics> => {
  const store = await readStore();
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recentDeployments = store.deployments.filter((deployment) => new Date(deployment.startedAt).getTime() >= sevenDaysAgo);
  const failedDeployments = recentDeployments.filter((deployment) => ['Failed', 'Rolled Back'].includes(deployment.status));
  const resolvedIncidentTimes = store.incidents
    .filter((incident) => incident.resolvedAt)
    .map((incident) => (new Date(incident.resolvedAt as string).getTime() - new Date(incident.createdAt).getTime()) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);

  return {
    deploymentFrequency: Number((recentDeployments.length / 7).toFixed(2)),
    leadTimeHours: 0,
    changeFailureRate: Number(((failedDeployments.length / Math.max(recentDeployments.length, 1)) * 100).toFixed(1)),
    mttrMinutes: Number((resolvedIncidentTimes.reduce((sum, value) => sum + value, 0) / Math.max(resolvedIncidentTimes.length, 1)).toFixed(0)),
  };
};

export const analyzeIncidents = async (): Promise<IncidentAnalysis> => {
  const store = await readStore();
  const openCriticalTasks = store.tasks.filter((task) => task.status !== 'DONE' && ['Critical', 'High'].includes(task.priority)).length;
  const failedDeployments = store.deployments.filter((deployment) => ['Failed', 'Rolled Back'].includes(deployment.status));
  const activeIncidents = store.incidents.filter((incident) => incident.status !== 'Resolved');
  const riskScore = Math.min(100, openCriticalTasks * 12 + failedDeployments.length * 10 + activeIncidents.length * 20);

  return {
    riskScore,
    summary: riskScore >= 70 ? 'High operational risk: active incidents overlap with delivery signals.' : riskScore >= 40 ? 'Moderate operational risk: watch the next deploy window closely.' : 'Low operational risk: delivery and reliability signals are stable.',
    recommendations: [
      failedDeployments.length ? 'Run a rollback readiness review for recent failed or rolled-back deployments.' : 'No failed production deployment requires immediate rollback follow-up.',
      activeIncidents.length ? 'Prioritize active incident ownership and customer-facing status updates.' : 'No active incidents require escalation.',
    ],
    signals: [
      { label: 'High-priority open work', value: String(openCriticalTasks), severity: openCriticalTasks > 1 ? 'High' : 'Medium' },
      { label: 'Failed deployments', value: String(failedDeployments.length), severity: failedDeployments.length ? 'High' : 'Low' },
      { label: 'Active incidents', value: String(activeIncidents.length), severity: activeIncidents.length ? 'High' : 'Low' },
    ],
  };
};

export const databaseInfo = () => pgStore.databaseInfo();
