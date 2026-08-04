import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';

export type CommentRecord = {
  id: string;
  projectId: string;
  taskId: string;
  body: string;
  author: string;
  mentions: string[];
  createdAt: string;
};

export type SprintRecord = {
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

export type CodeMetricRecord = {
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

export type AlertIntegrationRecord = {
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

export type IncidentAssistantRecord = {
  id: string;
  projectId: string;
  incidentId: string;
  summary: string;
  likelyRootCause: string;
  nextActions: string[];
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  createdAt: string;
};

export type PostmortemRecord = {
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

export type ClientReportRecord = {
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

export type ReleaseApprovalRecord = {
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

export type StatusPageRecord = {
  id: string;
  projectId: string;
  publicSlug: string;
  headline: string;
  status: 'Operational' | 'Degraded' | 'Outage' | 'Maintenance';
  message: string;
  updatedAt: string;
};

export type OnCallRecord = {
  id: string;
  projectId: string;
  primary: string;
  secondary: string;
  escalationMinutes: number;
  rotation: string;
  timezone: string;
  updatedAt: string;
};

export type AlertRuleRecord = {
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

export type AuditRecord = {
  id: string;
  projectId: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
};

export type ProjectInviteRecord = {
  id: string;
  projectId: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  invitedBy: string;
  status: 'Pending' | 'Accepted' | 'Revoked';
  createdAt: string;
  acceptedAt: string;
};

export type WorkspaceInviteRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  invitedBy: string;
  status: 'Pending' | 'Accepted' | 'Revoked';
  createdAt: string;
  acceptedAt: string;
};

export type ProjectEnvironmentRecord = {
  id: string;
  projectId: string;
  name: 'Production' | 'Staging' | 'Development' | string;
  appUrl: string;
  deploymentWebhookUrl: string;
  healthStatus: 'healthy' | 'warning' | 'down' | 'unknown';
  lastCheckedAt: string;
  lastDeploymentId: string;
  createdAt: string;
  updatedAt: string;
};

export type AlertEvaluationRecord = {
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

export type ProductFeatureState = {
  tenant: TenantProfile;
  comments: CommentRecord[];
  sprints: SprintRecord[];
  codeMetrics: CodeMetricRecord[];
  alertIntegrations: AlertIntegrationRecord[];
  backups: BackupRecord[];
  incidentAssistant: IncidentAssistantRecord[];
  postmortems: PostmortemRecord[];
  slos: SloRecord[];
  clientReports: ClientReportRecord[];
  releaseApprovals: ReleaseApprovalRecord[];
  statusPages: StatusPageRecord[];
  onCall: OnCallRecord[];
  alertRules: AlertRuleRecord[];
  audit: AuditRecord[];
  invites: ProjectInviteRecord[];
  workspaceInvites: WorkspaceInviteRecord[];
  environments: ProjectEnvironmentRecord[];
  alertEvaluations: AlertEvaluationRecord[];
};

const dataDir = process.env.DEVPILOT_DATA_DIR
  ? path.resolve(process.env.DEVPILOT_DATA_DIR)
  : process.env.VERCEL
    ? path.join('/tmp', 'devpilot-ai')
    : path.resolve(__dirname, '..', '.data');
const featurePath = path.join(dataDir, 'product-features.json');
const backupDir = path.join(dataDir, 'backups');
const now = () => new Date().toISOString();
const databaseUrl = process.env.DATABASE_URL;

const shouldUseSsl = (connectionString: string) => {
  if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) return true;
  if (/sslmode=disable/i.test(connectionString)) return false;
  return !/localhost|127\.0\.0\.1|postgres:5432/i.test(connectionString);
};

const pool = databaseUrl
  ? new Pool({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  })
  : null;
let featureStoreInitialized: Promise<void> | null = null;

const defaultState = (): ProductFeatureState => ({
  tenant: {
    id: 'tenant-default',
    name: process.env.DEVPILOT_TENANT_NAME || 'Xorism',
    domain: process.env.DEVPILOT_TENANT_DOMAIN || 'xorism.local',
    plan: 'Professional',
    primaryRegion: process.env.DEVPILOT_REGION || 'ap-south-1',
    dataRetentionDays: 90,
    ssoEnabled: false,
    createdAt: now(),
    updatedAt: now(),
  },
  comments: [],
  sprints: [],
  codeMetrics: [],
  alertIntegrations: [],
  backups: [],
  incidentAssistant: [],
  postmortems: [],
  slos: [],
  clientReports: [],
  releaseApprovals: [],
  statusPages: [],
  onCall: [],
  alertRules: [],
  audit: [],
  invites: [],
  workspaceInvites: [],
  environments: [],
  alertEvaluations: [],
});

const ensureDataDir = () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
};

const readState = (): ProductFeatureState => {
  ensureDataDir();
  if (!fs.existsSync(featurePath)) {
    const state = defaultState();
    fs.writeFileSync(featurePath, JSON.stringify(state, null, 2));
    return state;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(featurePath, 'utf8')) as Partial<ProductFeatureState>;
    return {
      ...defaultState(),
      ...parsed,
      tenant: { ...defaultState().tenant, ...(parsed.tenant || {}) },
      comments: parsed.comments || [],
      sprints: parsed.sprints || [],
      codeMetrics: parsed.codeMetrics || [],
      alertIntegrations: parsed.alertIntegrations || [],
      backups: parsed.backups || [],
      incidentAssistant: parsed.incidentAssistant || [],
      postmortems: parsed.postmortems || [],
      slos: parsed.slos || [],
      clientReports: parsed.clientReports || [],
      releaseApprovals: parsed.releaseApprovals || [],
      statusPages: parsed.statusPages || [],
      onCall: parsed.onCall || [],
      alertRules: parsed.alertRules || [],
      audit: parsed.audit || [],
      invites: parsed.invites || [],
      workspaceInvites: parsed.workspaceInvites || [],
      environments: parsed.environments || [],
      alertEvaluations: parsed.alertEvaluations || [],
    };
  } catch {
    const state = defaultState();
    fs.writeFileSync(featurePath, JSON.stringify(state, null, 2));
    return state;
  }
};

const writeState = (state: ProductFeatureState) => {
  ensureDataDir();
  fs.writeFileSync(featurePath, JSON.stringify(state, null, 2));
  return state;
};

const initFeatureStore = async () => {
  if (!pool) return;
  if (featureStoreInitialized) return featureStoreInitialized;
  featureStoreInitialized = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_feature_state (
        key TEXT PRIMARY KEY,
        state_json JSONB NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  })();
  return featureStoreInitialized;
};

const readFeatureState = async (): Promise<ProductFeatureState> => {
  if (!pool) return readState();
  await initFeatureStore();
  const result = await pool.query('SELECT state_json FROM product_feature_state WHERE key = $1 LIMIT 1', ['default']);
  const row = result.rows[0]?.state_json as Partial<ProductFeatureState> | undefined;
  if (!row) {
    const state = defaultState();
    await writeFeatureState(state);
    return state;
  }
  const defaults = defaultState();
  return {
    ...defaults,
    ...row,
    tenant: { ...defaults.tenant, ...(row.tenant || {}) },
    comments: row.comments || [],
    sprints: row.sprints || [],
    codeMetrics: row.codeMetrics || [],
    alertIntegrations: row.alertIntegrations || [],
    backups: row.backups || [],
    incidentAssistant: row.incidentAssistant || [],
    postmortems: row.postmortems || [],
    slos: row.slos || [],
    clientReports: row.clientReports || [],
    releaseApprovals: row.releaseApprovals || [],
    statusPages: row.statusPages || [],
    onCall: row.onCall || [],
    alertRules: row.alertRules || [],
    audit: row.audit || [],
    invites: row.invites || [],
    workspaceInvites: row.workspaceInvites || [],
    environments: row.environments || [],
    alertEvaluations: row.alertEvaluations || [],
  };
};

const writeFeatureState = async (state: ProductFeatureState) => {
  if (!pool) return writeState(state);
  await initFeatureStore();
  await pool.query(
    `INSERT INTO product_feature_state (key, state_json, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at`,
    ['default', JSON.stringify(state), now()],
  );
  return state;
};

const sanitizeIntegration = (integration: AlertIntegrationRecord) => ({
  ...integration,
  webhookUrl: integration.webhookUrl ? `${integration.webhookUrl.slice(0, 28)}...` : '',
});

export const featureSnapshot = async (projectId?: string) => {
  const state = await readFeatureState();
  const projectFilter = (value: { projectId: string }) => !projectId || value.projectId === projectId;
  return {
    tenant: state.tenant,
    comments: state.comments.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    sprints: state.sprints.filter(projectFilter).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    codeMetrics: state.codeMetrics.filter(projectFilter).sort((a, b) => b.lastSyncedAt.localeCompare(a.lastSyncedAt)),
    alertIntegrations: state.alertIntegrations.filter(projectFilter).map(sanitizeIntegration),
    backups: state.backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    incidentAssistant: state.incidentAssistant.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    postmortems: state.postmortems.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    slos: state.slos.filter(projectFilter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    clientReports: state.clientReports.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    releaseApprovals: state.releaseApprovals.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    statusPages: state.statusPages.filter(projectFilter),
    onCall: state.onCall.filter(projectFilter),
    alertRules: state.alertRules.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    audit: state.audit.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    invites: state.invites.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    workspaceInvites: state.workspaceInvites.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    environments: state.environments.filter(projectFilter).sort((a, b) => a.name.localeCompare(b.name)),
    alertEvaluations: state.alertEvaluations.filter(projectFilter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
};

export const deleteProjectFeatureData = async (projectId: string) => {
  const state = await readFeatureState();
  const keep = <T extends { projectId: string }>(items: T[]) => items.filter((item) => item.projectId !== projectId);
  await writeFeatureState({
    ...state,
    comments: keep(state.comments),
    sprints: keep(state.sprints),
    codeMetrics: keep(state.codeMetrics),
    alertIntegrations: keep(state.alertIntegrations),
    incidentAssistant: keep(state.incidentAssistant),
    postmortems: keep(state.postmortems),
    slos: keep(state.slos),
    clientReports: keep(state.clientReports),
    releaseApprovals: keep(state.releaseApprovals),
    statusPages: keep(state.statusPages),
    onCall: keep(state.onCall),
    alertRules: keep(state.alertRules),
    audit: keep(state.audit),
    invites: keep(state.invites),
    workspaceInvites: state.workspaceInvites,
    environments: keep(state.environments),
    alertEvaluations: keep(state.alertEvaluations),
  });
};

export const createWorkspaceInvite = async (input: {
  workspaceId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitedBy: string;
}) => {
  const state = await readFeatureState();
  const email = String(input.email || '').trim().toLowerCase();
  const role = input.role === 'admin' || input.role === 'viewer' ? input.role : 'member';
  const existing = state.workspaceInvites.find((invite) =>
    invite.workspaceId === input.workspaceId &&
    invite.email === email &&
    invite.status === 'Pending'
  );
  if (existing) return existing;
  const invite: WorkspaceInviteRecord = {
    id: uuid(),
    workspaceId: input.workspaceId,
    email,
    role,
    token: uuid(),
    invitedBy: String(input.invitedBy || 'workspace-admin'),
    status: 'Pending',
    createdAt: now(),
    acceptedAt: '',
  };
  state.workspaceInvites.unshift(invite);
  await writeFeatureState(state);
  return invite;
};

export const acceptWorkspaceInvite = async (token: string, email: string) => {
  const state = await readFeatureState();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const invite = state.workspaceInvites.find((item) => item.token === token && item.email === normalizedEmail && item.status === 'Pending');
  if (!invite) return undefined;
  invite.status = 'Accepted';
  invite.acceptedAt = now();
  await writeFeatureState(state);
  return invite;
};

export const upsertProjectEnvironment = async (input: Partial<ProjectEnvironmentRecord> & {
  projectId: string;
  name: string;
}) => {
  const state = await readFeatureState();
  const name = String(input.name || 'Production').trim() || 'Production';
  const existing = state.environments.find((environment) => environment.projectId === input.projectId && environment.name.toLowerCase() === name.toLowerCase());
  const environment: ProjectEnvironmentRecord = {
    id: existing?.id || uuid(),
    projectId: input.projectId,
    name,
    appUrl: String(input.appUrl ?? existing?.appUrl ?? ''),
    deploymentWebhookUrl: String(input.deploymentWebhookUrl ?? existing?.deploymentWebhookUrl ?? ''),
    healthStatus: (input.healthStatus || existing?.healthStatus || 'unknown') as ProjectEnvironmentRecord['healthStatus'],
    lastCheckedAt: String(input.lastCheckedAt || existing?.lastCheckedAt || ''),
    lastDeploymentId: String(input.lastDeploymentId || existing?.lastDeploymentId || ''),
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  state.environments = [environment, ...state.environments.filter((item) => item.id !== environment.id)];
  await writeFeatureState(state);
  return environment;
};

export const createProjectInvite = async (input: {
  projectId: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  invitedBy: string;
}) => {
  const state = await readFeatureState();
  const email = String(input.email || '').trim().toLowerCase();
  const role = input.role === 'admin' || input.role === 'viewer' ? input.role : 'member';
  const existing = state.invites.find((invite) =>
    invite.projectId === input.projectId &&
    invite.email === email &&
    invite.status === 'Pending'
  );
  if (existing) return existing;
  const invite: ProjectInviteRecord = {
    id: uuid(),
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    email,
    role,
    token: uuid(),
    invitedBy: String(input.invitedBy || 'workspace-admin'),
    status: 'Pending',
    createdAt: now(),
    acceptedAt: '',
  };
  state.invites.unshift(invite);
  await writeFeatureState(state);
  return invite;
};

export const listProjectInvites = async (projectId: string) =>
  (await readFeatureState()).invites
    .filter((invite) => invite.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const acceptProjectInvite = async (token: string, email: string) => {
  const state = await readFeatureState();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const invite = state.invites.find((item) => item.token === token && item.email === normalizedEmail && item.status === 'Pending');
  if (!invite) return undefined;
  invite.status = 'Accepted';
  invite.acceptedAt = now();
  await writeFeatureState(state);
  return invite;
};

export const updateTenantProfile = async (patch: Partial<TenantProfile>) => {
  const state = await readFeatureState();
  state.tenant = {
    ...state.tenant,
    name: String(patch.name || state.tenant.name),
    domain: String(patch.domain || state.tenant.domain),
    plan: (patch.plan || state.tenant.plan) as TenantProfile['plan'],
    primaryRegion: String(patch.primaryRegion || state.tenant.primaryRegion),
    dataRetentionDays: Number(patch.dataRetentionDays || state.tenant.dataRetentionDays),
    ssoEnabled: Boolean(patch.ssoEnabled ?? state.tenant.ssoEnabled),
    updatedAt: now(),
  };
  await writeFeatureState(state);
  return state.tenant;
};

export const createComment = async (input: Partial<CommentRecord> & { projectId: string; body: string; author: string }) => {
  const state = await readFeatureState();
  const mentions = Array.from(new Set((input.body.match(/@[\w.+-]+@?[\w.-]*/g) || []).map((mention) => mention.replace(/^@/, '').toLowerCase())));
  const comment: CommentRecord = {
    id: uuid(),
    projectId: input.projectId,
    taskId: String(input.taskId || ''),
    body: String(input.body || '').trim(),
    author: String(input.author || 'teammate'),
    mentions,
    createdAt: now(),
  };
  state.comments.unshift(comment);
  await writeFeatureState(state);
  return comment;
};

export const createSprint = async (input: Partial<SprintRecord> & { projectId: string; name: string }) => {
  const state = await readFeatureState();
  const sprint: SprintRecord = {
    id: uuid(),
    projectId: input.projectId,
    name: String(input.name || 'Sprint'),
    goal: String(input.goal || ''),
    startDate: String(input.startDate || now().slice(0, 10)),
    endDate: String(input.endDate || now().slice(0, 10)),
    capacity: Number(input.capacity || 0),
    status: (input.status || 'Planned') as SprintRecord['status'],
    createdAt: now(),
    updatedAt: now(),
  };
  state.sprints.unshift(sprint);
  await writeFeatureState(state);
  return sprint;
};

export const updateSprint = async (id: string, patch: Partial<SprintRecord>) => {
  const state = await readFeatureState();
  let updated: SprintRecord | undefined;
  state.sprints = state.sprints.map((sprint) => {
    if (sprint.id !== id) return sprint;
    updated = { ...sprint, ...patch, capacity: Number(patch.capacity ?? sprint.capacity), updatedAt: now() };
    return updated;
  });
  await writeFeatureState(state);
  return updated;
};

export const upsertCodeMetrics = async (input: Partial<CodeMetricRecord> & { projectId: string }) => {
  const state = await readFeatureState();
  const existing = state.codeMetrics.find((metric) => metric.projectId === input.projectId && metric.repository === input.repository);
  const metric: CodeMetricRecord = {
    id: existing?.id || uuid(),
    projectId: input.projectId,
    provider: (input.provider || 'Manual') as CodeMetricRecord['provider'],
    repository: String(input.repository || existing?.repository || ''),
    branch: String(input.branch || existing?.branch || 'main'),
    commits: Number(input.commits ?? existing?.commits ?? 0),
    pullRequests: Number(input.pullRequests ?? existing?.pullRequests ?? 0),
    openIssues: Number(input.openIssues ?? existing?.openIssues ?? 0),
    coverage: Number(input.coverage ?? existing?.coverage ?? 0),
    deploymentFrequency: Number(input.deploymentFrequency ?? existing?.deploymentFrequency ?? 0),
    leadTimeHours: Number(input.leadTimeHours ?? existing?.leadTimeHours ?? 0),
    sourceUrl: String(input.sourceUrl || existing?.sourceUrl || ''),
    lastSyncedAt: now(),
  };
  state.codeMetrics = [metric, ...state.codeMetrics.filter((item) => item.id !== metric.id)];
  await writeFeatureState(state);
  return metric;
};

export const createAlertIntegration = async (input: Partial<AlertIntegrationRecord> & { projectId: string; provider: 'Slack' | 'Discord' }) => {
  const state = await readFeatureState();
  const integration: AlertIntegrationRecord = {
    id: uuid(),
    projectId: input.projectId,
    provider: input.provider,
    channel: String(input.channel || '#deployments'),
    webhookUrl: String(input.webhookUrl || ''),
    enabled: Boolean(input.enabled ?? true),
    createdAt: now(),
    lastTestAt: '',
  };
  state.alertIntegrations.unshift(integration);
  await writeFeatureState(state);
  return sanitizeIntegration(integration);
};

const postJson = (urlValue: string, body: unknown) =>
  new Promise<{ ok: boolean; statusCode: number; error: string }>((resolve) => {
    let url: URL;
    try {
      url = new URL(urlValue);
    } catch {
      resolve({ ok: false, statusCode: 0, error: 'Invalid webhook URL' });
      return;
    }
    const payload = JSON.stringify(body);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
      timeout: 5000,
    }, (response) => {
      response.resume();
      response.on('end', () => resolve({
        ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
        statusCode: response.statusCode || 0,
        error: '',
      }));
    });
    request.on('error', (error) => resolve({ ok: false, statusCode: 0, error: error.message }));
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, statusCode: 0, error: 'Webhook request timed out' });
    });
    request.write(payload);
    request.end();
  });

export const testAlertIntegration = async (id: string, message: string) => {
  const state = await readFeatureState();
  const integration = state.alertIntegrations.find((item) => item.id === id);
  if (!integration) return undefined;
  const result = integration.webhookUrl
    ? await postJson(integration.webhookUrl, { text: message, content: message })
    : { ok: false, statusCode: 0, error: 'Webhook URL is not configured' };
  integration.lastTestAt = now();
  await writeFeatureState(state);
  return { integration: sanitizeIntegration(integration), result };
};

export const createBackup = async (snapshot: unknown, includes: string[]) => {
  const state = await readFeatureState();
  ensureDataDir();
  const createdAt = now();
  const id = uuid();
  const fileName = `devpilot-backup-${createdAt.replace(/[:.]/g, '-')}.json`;
  const fullPath = path.join(backupDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify({ id, createdAt, snapshot }, null, 2));
  const stat = fs.statSync(fullPath);
  const backup: BackupRecord = { id, fileName, sizeBytes: stat.size, createdAt, includes };
  state.backups.unshift(backup);
  await writeFeatureState(state);
  return backup;
};

export const recordAudit = async (input: { projectId: string; actor: string; action: string; entity: string }) => {
  const state = await readFeatureState();
  const audit: AuditRecord = {
    id: uuid(),
    projectId: input.projectId,
    actor: input.actor || 'system',
    action: input.action,
    entity: input.entity,
    createdAt: now(),
  };
  state.audit.unshift(audit);
  await writeFeatureState(state);
  return audit;
};

export const createIncidentAssistantInsight = async (input: {
  projectId: string;
  incident: { id: string; title: string; description: string; severity: string; service: string; status: string };
  deployments: Array<{ status: string; version: string; service: string; startedAt: string }>;
  healthChecks: Array<{ status: string; statusCode: number; responseTimeMs: number; error: string; checkedAt: string }>;
}) => {
  const state = await readFeatureState();
  const recentFailedDeployment = input.deployments.find((deployment) => ['Failed', 'Rolled Back'].includes(deployment.status));
  const latestFailedCheck = input.healthChecks.find((check) => check.status === 'down');
  const riskLevel = input.incident.severity === 'Critical' || (latestFailedCheck?.statusCode || 0) >= 500
    ? 'Critical'
    : input.incident.severity === 'High' || recentFailedDeployment
      ? 'High'
      : 'Medium';
  const insight: IncidentAssistantRecord = {
    id: uuid(),
    projectId: input.projectId,
    incidentId: input.incident.id,
    summary: `${input.incident.title} is ${input.incident.status.toLowerCase()} for ${input.incident.service}. ${input.incident.description || 'No additional description was provided.'}`,
    likelyRootCause: recentFailedDeployment
      ? `Recent ${recentFailedDeployment.status.toLowerCase()} deployment ${recentFailedDeployment.version} on ${recentFailedDeployment.service}.`
      : latestFailedCheck
        ? `Latest health probe failed with HTTP ${latestFailedCheck.statusCode || 'no response'}${latestFailedCheck.error ? ` (${latestFailedCheck.error})` : ''}.`
        : 'Insufficient signals. Review recent code, deployment, and health-check changes.',
    nextActions: [
      recentFailedDeployment ? 'Compare the failed deployment with the previous successful release.' : 'Inspect recent deployment and configuration changes.',
      latestFailedCheck ? 'Validate app URL availability and upstream dependencies.' : 'Run a fresh health check and collect service logs.',
      'Assign an incident owner and update client-facing status if impact is confirmed.',
      'Create or update the postmortem once the incident is resolved.',
    ],
    riskLevel,
    createdAt: now(),
  };
  state.incidentAssistant.unshift(insight);
  await writeFeatureState(state);
  return insight;
};

export const createPostmortem = async (input: {
  projectId: string;
  incident: { id: string; title: string; description: string; service: string; severity: string; createdAt: string; resolvedAt: string | null };
  deployments: Array<{ version: string; status: string; startedAt: string }>;
  healthChecks: Array<{ status: string; statusCode: number; responseTimeMs: number; checkedAt: string }>;
}) => {
  const state = await readFeatureState();
  const failedDeployments = input.deployments.filter((deployment) => ['Failed', 'Rolled Back'].includes(deployment.status));
  const failedChecks = input.healthChecks.filter((check) => check.status === 'down');
  const postmortem: PostmortemRecord = {
    id: uuid(),
    projectId: input.projectId,
    incidentId: input.incident.id,
    title: `Postmortem: ${input.incident.title}`,
    impact: `${input.incident.severity} incident affecting ${input.incident.service}. ${input.incident.description || ''}`.trim(),
    rootCause: failedDeployments[0]
      ? `Release ${failedDeployments[0].version} ended with ${failedDeployments[0].status}.`
      : failedChecks[0]
        ? `Service health dropped during checks with HTTP ${failedChecks[0].statusCode || 'no response'}.`
        : 'Root cause requires engineering review.',
    timeline: [
      `Incident opened at ${new Date(input.incident.createdAt).toLocaleString()}.`,
      ...input.deployments.slice(0, 3).map((deployment) => `Deployment ${deployment.version} was ${deployment.status} at ${new Date(deployment.startedAt).toLocaleString()}.`),
      ...input.healthChecks.slice(0, 3).map((check) => `Health check ${check.status} HTTP ${check.statusCode || 'n/a'} at ${new Date(check.checkedAt).toLocaleString()}.`),
      input.incident.resolvedAt ? `Incident resolved at ${new Date(input.incident.resolvedAt).toLocaleString()}.` : 'Incident is not resolved yet.',
    ],
    whatWentWell: [
      'Incident was captured in DevPilot and attached to the project.',
      'Deployment and health signals are available for review.',
      'Follow-up actions can be tracked as project issues.',
    ],
    actionItems: [
      'Add a regression check for the affected service path.',
      'Review deployment rollback and approval rules.',
      'Update alert threshold if detection was delayed.',
    ],
    createdAt: now(),
  };
  state.postmortems.unshift(postmortem);
  await writeFeatureState(state);
  return postmortem;
};

export const upsertSlo = async (input: Partial<SloRecord> & { projectId: string; name: string }) => {
  const state = await readFeatureState();
  const existing = state.slos.find((slo) => slo.projectId === input.projectId && slo.name === input.name);
  const target = Number(input.target ?? existing?.target ?? 99.9);
  const current = Number(input.current ?? existing?.current ?? target);
  const errorBudgetRemaining = Math.max(0, Number((100 - target + (current - target)).toFixed(2)));
  const slo: SloRecord = {
    id: existing?.id || uuid(),
    projectId: input.projectId,
    name: input.name,
    target,
    current,
    windowDays: Number(input.windowDays ?? existing?.windowDays ?? 30),
    errorBudgetRemaining: Number(input.errorBudgetRemaining ?? errorBudgetRemaining),
    burnRate: Number(input.burnRate ?? existing?.burnRate ?? Math.max(0, Number(((target - current) * 10).toFixed(2)))),
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  state.slos = [slo, ...state.slos.filter((item) => item.id !== slo.id)];
  await writeFeatureState(state);
  return slo;
};

export const createClientReport = async (input: {
  projectId: string;
  format: 'Weekly' | 'Monthly';
  projectName: string;
  tasks: Array<{ status: string }>;
  deployments: unknown[];
  incidents: Array<{ status: string; severity: string }>;
  healthChecks: Array<{ status: string; responseTimeMs: number }>;
}) => {
  const state = await readFeatureState();
  const uptime = input.healthChecks.length
    ? Number(((input.healthChecks.filter((check) => check.status === 'healthy').length / input.healthChecks.length) * 100).toFixed(1))
    : 100;
  const report: ClientReportRecord = {
    id: uuid(),
    projectId: input.projectId,
    period: `${input.format} report generated ${now().slice(0, 10)}`,
    format: input.format,
    summary: `${input.projectName} completed ${input.tasks.filter((task) => task.status === 'DONE').length} tracked issues, recorded ${input.deployments.length} deployments, and maintained ${uptime}% recent uptime.`,
    uptime,
    deployments: input.deployments.length,
    incidents: input.incidents.length,
    completedTasks: input.tasks.filter((task) => task.status === 'DONE').length,
    risks: [
      ...(input.incidents.some((incident) => incident.status !== 'Resolved') ? ['Open incidents require client communication.'] : []),
      ...(uptime < 99 ? ['Recent uptime is below a production-grade SLA target.'] : []),
      ...(input.deployments.length === 0 ? ['No deployment evidence captured for this period.'] : []),
    ],
    createdAt: now(),
  };
  state.clientReports.unshift(report);
  await writeFeatureState(state);
  return report;
};

export const createReleaseApproval = async (input: Partial<ReleaseApprovalRecord> & { projectId: string; title: string; requester: string }) => {
  const state = await readFeatureState();
  const approval: ReleaseApprovalRecord = {
    id: uuid(),
    projectId: input.projectId,
    deploymentId: String(input.deploymentId || ''),
    title: input.title,
    requester: input.requester,
    approver: String(input.approver || ''),
    status: (input.status || 'Pending') as ReleaseApprovalRecord['status'],
    notes: String(input.notes || ''),
    createdAt: now(),
    decidedAt: input.status && input.status !== 'Pending' ? now() : '',
  };
  state.releaseApprovals.unshift(approval);
  await writeFeatureState(state);
  return approval;
};

export const updateReleaseApproval = async (id: string, patch: Partial<ReleaseApprovalRecord>) => {
  const state = await readFeatureState();
  let updated: ReleaseApprovalRecord | undefined;
  state.releaseApprovals = state.releaseApprovals.map((approval) => {
    if (approval.id !== id) return approval;
    updated = { ...approval, ...patch, decidedAt: patch.status && patch.status !== 'Pending' ? now() : approval.decidedAt };
    return updated;
  });
  await writeFeatureState(state);
  return updated;
};

export const upsertStatusPage = async (input: Partial<StatusPageRecord> & { projectId: string; projectName: string }) => {
  const state = await readFeatureState();
  const existing = state.statusPages.find((page) => page.projectId === input.projectId);
  const slug = String(input.publicSlug || existing?.publicSlug || input.projectName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const page: StatusPageRecord = {
    id: existing?.id || uuid(),
    projectId: input.projectId,
    publicSlug: slug,
    headline: String(input.headline || existing?.headline || `${input.projectName} status`),
    status: (input.status || existing?.status || 'Operational') as StatusPageRecord['status'],
    message: String(input.message || existing?.message || 'All monitored systems are operational.'),
    updatedAt: now(),
  };
  state.statusPages = [page, ...state.statusPages.filter((item) => item.id !== page.id)];
  await writeFeatureState(state);
  return page;
};

export const upsertOnCall = async (input: Partial<OnCallRecord> & { projectId: string }) => {
  const state = await readFeatureState();
  const existing = state.onCall.find((schedule) => schedule.projectId === input.projectId);
  const schedule: OnCallRecord = {
    id: existing?.id || uuid(),
    projectId: input.projectId,
    primary: String(input.primary || existing?.primary || ''),
    secondary: String(input.secondary || existing?.secondary || ''),
    escalationMinutes: Number(input.escalationMinutes ?? existing?.escalationMinutes ?? 15),
    rotation: String(input.rotation || existing?.rotation || 'Weekly'),
    timezone: String(input.timezone || existing?.timezone || 'Asia/Kolkata'),
    updatedAt: now(),
  };
  state.onCall = [schedule, ...state.onCall.filter((item) => item.id !== schedule.id)];
  await writeFeatureState(state);
  return schedule;
};

export const createAlertRule = async (input: Partial<AlertRuleRecord> & { projectId: string; name: string }) => {
  const state = await readFeatureState();
  const rule: AlertRuleRecord = {
    id: uuid(),
    projectId: input.projectId,
    name: input.name,
    condition: String(input.condition || 'health_failures'),
    threshold: Number(input.threshold ?? 3),
    channel: String(input.channel || '#alerts'),
    enabled: Boolean(input.enabled ?? true),
    createdAt: now(),
    updatedAt: now(),
  };
  state.alertRules.unshift(rule);
  await writeFeatureState(state);
  return rule;
};

export const evaluateAlertRules = async (input: {
  projectId: string;
  deployments: Array<{ status: string }>;
  incidents: Array<{ status: string }>;
  healthChecks: Array<{ status: string; responseTimeMs: number }>;
}) => {
  const state = await readFeatureState();
  const rules = state.alertRules.filter((rule) => rule.projectId === input.projectId && rule.enabled);
  const recentChecks = input.healthChecks.slice(0, 10);
  const failedHealthChecks = recentChecks.filter((check) => check.status === 'down').length;
  const averageResponseTime = recentChecks.length
    ? recentChecks.reduce((sum, check) => sum + Number(check.responseTimeMs || 0), 0) / recentChecks.length
    : 0;
  const failedDeployments = input.deployments.slice(0, 5).filter((deployment) => ['Failed', 'Rolled Back'].includes(deployment.status)).length;
  const openIncidents = input.incidents.filter((incident) => incident.status !== 'Resolved').length;

  const evaluations = rules.map((rule) => {
    const condition = rule.condition;
    const value = condition === 'response_time'
      ? Number(averageResponseTime.toFixed(0))
      : condition === 'deployment_failed'
        ? failedDeployments
        : condition === 'open_incidents'
          ? openIncidents
          : failedHealthChecks;
    const matched = value >= rule.threshold;
    const signal = condition === 'response_time'
      ? 'Average response time in ms'
      : condition === 'deployment_failed'
        ? 'Recent failed deployments'
        : condition === 'open_incidents'
          ? 'Open incidents'
          : 'Recent failed health checks';
    return {
      id: uuid(),
      projectId: input.projectId,
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      signal,
      value,
      threshold: rule.threshold,
      createdAt: now(),
    } satisfies AlertEvaluationRecord;
  });

  if (evaluations.length) {
    state.alertEvaluations = [...evaluations, ...state.alertEvaluations].slice(0, 500);
    await writeFeatureState(state);
  }
  return evaluations;
};
