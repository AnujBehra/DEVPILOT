import 'dotenv/config';
import express from 'express';
import { json } from 'body-parser';
import cors from 'cors';
import http from 'http';
import https from 'https';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createRealtimeServer } from './realtime';
import { requireRole, getRole } from './rbac';
import { listActivity, queryActivity, recordActivity } from './activity';
import { searchRecords } from './search';
import { upload } from './uploads';
import { bump } from './analytics';
import { enqueueJob, startJobWorker } from './jobs';
import {
    createDeployment,
    createIncident,
    createProject,
    createTask,
    databaseInfo,
    DEFAULT_WORKSPACE_ID,
    DEFAULT_WORKSPACE_NAME,
    deleteProject,
    deleteTask,
    ensurePublicProjectCatalog,
    ensurePublicSeedData,
    findProjectByDeploymentWebhookToken,
    listIncidents,
    listIncidentsAsync,
    listProjectHealthChecks,
    listProjectHealthChecksAsync,
    listProjects,
    listProjectsAsync,
    recordProjectHealthCheck,
    readStore,
    readStoreAsync,
    resetStore,
    updateIncident,
    updateProject,
    updateTask
} from './store';
import type { Deployment } from './store';
import type { Project, ProjectHealthCheck } from './store';
import { metricsContentType, observeDeploymentCreated, observeIncidentCreated, observeProjectCreated, observeProjectHealthCheck, observeTaskCreated, prometheusMiddleware, renderMetrics, requestHealthSummary } from './metrics';
import { grafanaCloudStatus, provisionGrafanaCloudDashboards, pushMetricsToGrafanaCloud } from './grafanaCloud';
import { fetchGitHubRepositoryMetrics } from './github';
import { apiConfig, startupWarnings } from './config';
import { authMiddleware, listAuthUsers, loginUser, registerUser, requireAuth } from './auth';
import {
    createAlertIntegration,
    createAlertRule,
    createWorkspaceInvite,
    createBackup,
    createClientReport,
    createComment,
    createIncidentAssistantInsight,
    createProjectInvite,
    createPostmortem,
    createReleaseApproval,
    createSprint,
    deleteProjectFeatureData,
    evaluateAlertRules,
    featureSnapshot,
    listProjectInvites,
    acceptWorkspaceInvite,
    acceptProjectInvite,
    recordAudit,
    testAlertIntegration,
    updateReleaseApproval,
    updateSprint,
    updateTenantProfile,
    upsertOnCall,
    upsertSlo,
    upsertStatusPage,
    upsertCodeMetrics,
    upsertProjectEnvironment,
} from './productFeatures';

export const app = express();
const PORT = apiConfig.port;
const server = http.createServer(app);
const realtime = createRealtimeServer(server);
const isServerless = process.env.VERCEL === '1';

const requesterEmail = (req: express.Request) => String(req.authUser?.email || '').trim().toLowerCase();
const requesterName = (req: express.Request) => String(req.authUser?.name || '').trim();
const requesterWorkspaceId = (req: express.Request) => String(req.authUser?.workspaceId || DEFAULT_WORKSPACE_ID);
const projectMembership = (project: Project, email: string) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return undefined;
    if ((project.ownerEmail || '').trim().toLowerCase() === normalizedEmail) {
        return { email: normalizedEmail, name: project.owner, role: 'owner' as const };
    }
    return (project.members || []).find((member) => String(member.email || '').trim().toLowerCase() === normalizedEmail);
};
const hasWorkspaceProjectAccess = (role: string) => ['owner', 'admin'].includes(String(role || '').toLowerCase());
const projectInWorkspace = (project: Project, workspaceId: string) => !project.workspaceId || project.workspaceId === workspaceId;
const projectAccessibleBy = (project: Project, email: string, workspaceRole = '', workspaceId = DEFAULT_WORKSPACE_ID) =>
    projectInWorkspace(project, workspaceId) && (hasWorkspaceProjectAccess(workspaceRole) || Boolean(projectMembership(project, email)));
const canManageProject = (project: Project, email: string, workspaceRole = '') => {
    if (['owner', 'admin'].includes(String(workspaceRole || '').toLowerCase())) return true;
    const role = projectMembership(project, email)?.role;
    return role === 'owner' || role === 'admin';
};
const canDeleteProject = (project: Project, email: string, workspaceRole = '') => {
    if (['owner', 'admin'].includes(String(workspaceRole || '').toLowerCase())) return true;
    const role = projectMembership(project, email)?.role;
    return role === 'owner' || role === 'admin';
};
const canEditProjectContent = (project: Project, email: string, workspaceRole = '') => {
    if (['owner', 'admin'].includes(String(workspaceRole || '').toLowerCase())) return true;
    const role = projectMembership(project, email)?.role;
    return role === 'owner' || role === 'admin' || role === 'member';
};
const workspaceTeamMembers = async (workspaceId: string, requester?: { email: string; name: string; role: string; workspaceId?: string }) => {
    const members = new Map<string, { email: string; name: string; role: 'admin' | 'member' | 'viewer' }>();
    (await listAuthUsers()).forEach((user) => {
        if ((user.workspaceId || DEFAULT_WORKSPACE_ID) !== workspaceId) return;
        const email = String(user.email || '').trim().toLowerCase();
        if (!email) return;
        const role = user.role === 'owner' || user.role === 'admin' ? 'admin' : user.role === 'viewer' ? 'viewer' : 'member';
        members.set(email, { email, name: user.name || email, role });
    });
    if (requester?.email) {
        const email = requester.email.trim().toLowerCase();
        const role = requester.role === 'owner' || requester.role === 'admin' ? 'admin' : requester.role === 'viewer' ? 'viewer' : 'member';
        members.set(email, { email, name: requester.name || email, role });
    }
    return Array.from(members.values());
};
const mergeWorkspaceMembers = (members: unknown, requester: { email: string; name: string; role: string }) => {
    const merged = new Map<string, { email: string; name: string; role: 'admin' | 'member' | 'viewer' }>();
    const requesterEmail = requester.email.trim().toLowerCase();
    if (Array.isArray(members)) {
        members.forEach((candidate: any) => {
            const email = String(candidate?.email || '').trim().toLowerCase();
            if (!email) return;
            const role = candidate?.role === 'admin' || candidate?.role === 'viewer' ? candidate.role : 'member';
            merged.set(email, { email, name: String(candidate?.name || '').trim() || email, role });
        });
    }
    if (requesterEmail) {
        merged.set(requesterEmail, { email: requesterEmail, name: requester.name || requesterEmail, role: 'admin' });
    }
    return Array.from(merged.values());
};
const requireRequesterEmail = (req: express.Request, res: express.Response) => {
    const email = requesterEmail(req);
    if (!email) {
        res.status(401).json({ error: 'Login required' });
        return undefined;
    }
    return email;
};
const visibleProjects = (projects: Project[], email: string, workspaceRole = '', workspaceId = DEFAULT_WORKSPACE_ID) =>
    projects.filter((project) => projectAccessibleBy(project, email, workspaceRole, workspaceId));

const evaluateProjectAlertsFor = async (projectId: string, reason: string) => {
    const store = await readStoreAsync();
    const evaluations = await evaluateAlertRules({
        projectId,
        deployments: store.deployments.filter((deployment) => deployment.projectId === projectId),
        incidents: store.incidents.filter((incident) => incident.projectId === projectId),
        healthChecks: store.projectHealthChecks.filter((check) => check.projectId === projectId),
    });
    evaluations.filter((evaluation) => evaluation.matched).forEach((evaluation) => {
        recordActivity({
            actor: 'alert-engine',
            role: 'system',
            projectId,
            eventType: 'alert_rule.matched',
            action: `alert_rule.matched:${evaluation.ruleName}:${reason}`,
        });
        realtime.broadcast({ type: 'alert_rule.matched', payload: evaluation });
    });
    return evaluations;
};

const normalizeDeploymentStatus = (status: unknown): Deployment['status'] => {
    const value = String(status || '').trim().toLowerCase();
    if (['success', 'succeeded', 'ready', 'completed', 'complete'].includes(value)) return 'Succeeded';
    if (['failed', 'failure', 'error', 'errored', 'cancelled', 'canceled'].includes(value)) return 'Failed';
    if (['running', 'in_progress', 'in-progress', 'building', 'deploying'].includes(value)) return 'Running';
    if (['rolled_back', 'rolled-back', 'rollback'].includes(value)) return 'Rolled Back';
    return 'Queued';
};

const normalizeDeploymentProvider = (provider: unknown): Deployment['provider'] => {
    const value = String(provider || '').trim().toLowerCase();
    const providers: Record<string, Deployment['provider']> = {
        vercel: 'Vercel',
        github: 'GitHub Actions',
        'github actions': 'GitHub Actions',
        github_actions: 'GitHub Actions',
        railway: 'Railway',
        render: 'Render',
        manual: 'Manual',
    };
    return providers[value] || (value ? 'Other' : 'Manual');
};

const deploymentProviderFromPlatform = (platform: string): Deployment['provider'] => {
    const value = String(platform || '').trim().toLowerCase();
    if (value === 'github-pages' || value === 'github') return 'GitHub Actions';
    if (value === 'vercel') return 'Vercel';
    if (value === 'railway') return 'Railway';
    if (value === 'render') return 'Render';
    return 'Other';
};

const webhookPlatformSlug = (platform: Project['deploymentPlatform']) =>
    platform === 'GitHub Pages' ? 'github-pages' : String(platform || 'Other').toLowerCase();

const normalizeDeploymentEnvironment = (environment: unknown): Deployment['environment'] =>
    String(environment || '').trim().toLowerCase() === 'production' ? 'production' : 'staging';

const normalizeDeploymentTimestamp = (value: unknown) => {
    if (!value) return new Date().toISOString();
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) ? new Date(numeric) : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const classifyProjectHealth = (statusCode: number, responseTimeMs: number, error = '') => {
    if (error || statusCode >= 500 || statusCode === 0) return 'down';
    if (statusCode >= 400 || responseTimeMs > 1500) return 'warning';
    return 'healthy';
};

const checkProjectAppUrl = (projectId: string, appUrl: string) =>
    new Promise<{ statusCode: number; responseTimeMs: number; error: string }>((resolve) => {
        const startedAt = Date.now();
        let url: URL;
        try {
            url = new URL(appUrl);
        } catch {
            resolve({ statusCode: 0, responseTimeMs: 0, error: 'Invalid app URL' });
            return;
        }

        const client = url.protocol === 'https:' ? https : http;
        const request = client.get(url, { timeout: 5000, headers: { 'user-agent': `DevPilot Health Checker/${projectId}` } }, (response) => {
            response.resume();
            response.on('end', () => {
                resolve({
                    statusCode: response.statusCode || 0,
                    responseTimeMs: Date.now() - startedAt,
                    error: '',
                });
            });
        });
        request.setTimeout(5000, () => {
            request.destroy();
            resolve({ statusCode: 0, responseTimeMs: Date.now() - startedAt, error: 'Health check timed out' });
        });
        request.on('error', (error) => {
            resolve({ statusCode: 0, responseTimeMs: Date.now() - startedAt, error: error.message });
        });
    });

const recordProjectHealthForProject = async (project: Project) => {
    const result = await checkProjectAppUrl(project.id, project.appUrl);
    const status = classifyProjectHealth(result.statusCode, result.responseTimeMs, result.error);
    const check = await recordProjectHealthCheck({
        projectId: project.id,
        appUrl: project.appUrl,
        status,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        error: result.error,
    });
    observeProjectHealthCheck(status);

    if (status === 'down') {
        await recordIncidentIfMissing({
            projectId: project.id,
            title: `Application health check failed: ${project.name}`,
            description: result.error || `${project.appUrl} returned HTTP ${result.statusCode}.`,
            severity: 'High',
            service: project.serviceName,
            actor: 'project-health-checker',
        });
        recordActivity({
            actor: 'project-health-checker',
            role: 'system',
            projectId: project.id,
            eventType: 'health.failed',
            action: `health.failed:${project.name}`,
        });
        realtime.broadcast({ type: 'project.health.failed', payload: check });
    }

    await upsertProjectEnvironment({
        projectId: project.id,
        name: 'Production',
        appUrl: project.appUrl,
        healthStatus: status,
        lastCheckedAt: check.checkedAt,
    }).catch((error) => console.error('Environment sync failed', error));
    await evaluateProjectAlertsFor(project.id, 'health-check').catch((error) => console.error('Alert evaluation failed', error));
    realtime.broadcast({ type: 'project.health.checked', payload: check });
    return check;
};

const ensureRecentProjectHealthCheck = async (project: Project, checks: ProjectHealthCheck[]) => {
    if (!project.appUrl || project.status !== 'Active') return undefined;
    const latest = checks.find((check) => check.projectId === project.id);
    if (latest && Date.now() - new Date(latest.checkedAt).getTime() < 25000) return latest;
    return recordProjectHealthForProject(project);
};

const runProjectHealthChecks = async () => {
    const projects = (await listProjectsAsync()).filter((project) => project.status === 'Active' && project.appUrl);
    await Promise.all(projects.map(recordProjectHealthForProject));
};

const runProjectHealthChecksForProjects = async (projects: Project[], concurrency = 20) => {
    const checks: ProjectHealthCheck[] = [];
    const batchSize = Math.max(1, Math.min(25, Math.floor(concurrency) || 20));
    for (let index = 0; index < projects.length; index += batchSize) {
        const batch = projects.slice(index, index + batchSize);
        const results = await Promise.allSettled(batch.map(recordProjectHealthForProject));
        results.forEach((result) => {
            if (result.status === 'fulfilled') checks.push(result.value);
        });
    }
    return checks;
};

const syncGrafanaCloud = async (reason: string, options: { force?: boolean } = {}) => {
    try {
        return await pushMetricsToGrafanaCloud(reason, options);
    } catch (error) {
        console.error('Grafana Cloud push failed', reason, error);
        return { pushed: false, reason: 'push failed' };
    }
};

const deploymentFromWebhookPayload = (projectId: string, body: any): Partial<Deployment> => ({
    projectId,
    provider: normalizeDeploymentProvider(body.provider || body.source || body.deployment?.provider),
    service: String(body.service || body.serviceName || body.name || body.deployment?.service || 'application-service'),
    environment: normalizeDeploymentEnvironment(body.environment || body.target || body.deployment?.environment || 'production'),
    status: normalizeDeploymentStatus(body.status || body.conclusion || body.state || body.deployment?.status),
    version: String(body.version || body.release || body.tag || body.sha || body.commitSha || body.deployment?.version || `deploy-${Date.now()}`),
    deploymentUrl: String(body.deploymentUrl || body.url || body.html_url || body.deploy_url || body.deployment?.url || ''),
    commitSha: String(body.commitSha || body.sha || body.head_sha || body.commit?.sha || body.deployment?.commitSha || ''),
    branch: String(body.branch || body.ref || body.git?.branch || body.deployment?.branch || ''),
    triggeredBy: String(body.triggeredBy || body.actor || body.sender?.login || body.user?.login || body.deployment?.triggeredBy || ''),
    externalId: String(body.externalId || body.id || body.deployment?.id || ''),
    startedAt: String(body.deployedAt || body.startedAt || body.createdAt || body.created_at || new Date().toISOString()),
    durationMinutes: Number(body.durationMinutes || body.duration || 0),
});

const deploymentFromVercelPayload = (projectId: string, serviceName: string, body: any): Partial<Deployment> => {
    const payload = body.payload || body;
    const deployment = payload.deployment || payload;
    const meta = deployment.meta || payload.meta || {};
    const eventType = String(body.type || payload.type || deployment.type || '').toLowerCase();
    const deploymentId = deployment.id || payload.id || body.id || deployment.uid || '';
    const deploymentUrl = deployment.url
        ? String(deployment.url).startsWith('http') ? String(deployment.url) : `https://${deployment.url}`
        : String(payload.url || body.url || '');
    const commitSha = meta.githubCommitSha || meta.gitCommitSha || payload.gitSource?.sha || payload.sha || deployment.sha || '';
    const branch = meta.githubCommitRef || meta.gitCommitRef || payload.gitSource?.ref || payload.target || deployment.target || '';
    const status = eventType.includes('error') || eventType.includes('failed')
        ? 'Failed'
        : eventType.includes('ready') || eventType.includes('succeeded') || eventType.includes('success')
            ? 'Succeeded'
            : normalizeDeploymentStatus(deployment.state || payload.state || body.status);

    return {
        projectId,
        provider: 'Vercel',
        service: String(serviceName || payload.name || deployment.name || 'vercel-app'),
        environment: normalizeDeploymentEnvironment(payload.target || deployment.target || meta.vercelTarget || 'production'),
        status,
        version: String(payload.name || deployment.name || (commitSha ? String(commitSha).slice(0, 7) : deploymentId || `vercel-${Date.now()}`)),
        deploymentUrl,
        commitSha: String(commitSha),
        branch: String(branch),
        triggeredBy: String(meta.githubCommitAuthorName || payload.user?.username || payload.creator?.username || body.user?.username || 'vercel'),
        externalId: String(deploymentId),
        startedAt: normalizeDeploymentTimestamp(deployment.createdAt || payload.createdAt || body.createdAt),
        durationMinutes: 0,
    };
};

const deploymentFromGitHubPayload = (projectId: string, serviceName: string, body: any): Partial<Deployment> => {
    const deployment = body.deployment || {};
    const deploymentStatus = body.deployment_status || {};
    const repository = body.repository || {};
    const commitSha = deployment.sha || body.workflow_run?.head_sha || body.check_run?.head_sha || '';
    const deploymentUrl = deploymentStatus.environment_url || deploymentStatus.target_url || deploymentStatus.log_url || repository.html_url || '';

    return {
        projectId,
        provider: 'GitHub Actions',
        service: String(serviceName || repository.name || 'github-actions'),
        environment: normalizeDeploymentEnvironment(deployment.environment || deploymentStatus.environment || 'production'),
        status: normalizeDeploymentStatus(deploymentStatus.state || body.workflow_run?.conclusion || body.action),
        version: String(commitSha ? String(commitSha).slice(0, 7) : deployment.id || body.workflow_run?.id || `github-${Date.now()}`),
        deploymentUrl: String(deploymentUrl),
        commitSha: String(commitSha),
        branch: String(deployment.ref || body.workflow_run?.head_branch || ''),
        triggeredBy: String(body.sender?.login || body.workflow_run?.actor?.login || 'github'),
        externalId: String(deploymentStatus.id || deployment.id || body.workflow_run?.id || ''),
        startedAt: normalizeDeploymentTimestamp(deploymentStatus.created_at || deployment.created_at || body.workflow_run?.created_at),
        durationMinutes: 0,
    };
};

const deploymentFromGitHubPushPayload = (projectId: string, serviceName: string, body: any): Partial<Deployment> => {
    const repository = body.repository || {};
    const commitSha = String(body.after || body.head_commit?.id || '');
    const branch = String(body.ref || '').replace(/^refs\/heads\//, '');

    return {
        projectId,
        provider: 'GitHub Actions',
        service: String(serviceName || repository.name || 'github-pages'),
        environment: 'production',
        status: 'Succeeded',
        version: String(commitSha ? commitSha.slice(0, 7) : `github-push-${Date.now()}`),
        deploymentUrl: String(repository.homepage || repository.html_url || ''),
        commitSha,
        branch,
        triggeredBy: String(body.pusher?.name || body.sender?.login || 'github'),
        externalId: String(body.after || body.head_commit?.id || `${repository.id || 'github'}-${Date.now()}`),
        startedAt: normalizeDeploymentTimestamp(body.head_commit?.timestamp || body.repository?.updated_at || new Date().toISOString()),
        durationMinutes: 0,
    };
};

const deploymentFromGitHubPageBuildPayload = (projectId: string, serviceName: string, body: any): Partial<Deployment> => {
    const repository = body.repository || {};
    const build = body.build || {};
    const error = build.error || {};
    const commitSha = String(build.commit || '');

    return {
        projectId,
        provider: 'GitHub Actions',
        service: String(serviceName || repository.name || 'github-pages'),
        environment: 'production',
        status: error.message ? 'Failed' : 'Succeeded',
        version: String(commitSha ? commitSha.slice(0, 7) : `page-build-${Date.now()}`),
        deploymentUrl: String(repository.homepage || repository.html_url || ''),
        commitSha,
        branch: String(build.pusher || ''),
        triggeredBy: String(build.pusher || body.sender?.login || 'github-pages'),
        externalId: String(build.id || commitSha || `${repository.id || 'github-pages'}-${Date.now()}`),
        startedAt: normalizeDeploymentTimestamp(build.created_at || new Date().toISOString()),
        durationMinutes: 0,
    };
};

const deploymentFromGitHubEvent = (projectId: string, serviceName: string, githubEvent: string, body: any): Partial<Deployment> | null => {
    if (['deployment_status', 'workflow_run', 'check_run'].includes(githubEvent) || body?.deployment_status || body?.workflow_run || body?.check_run) {
        return deploymentFromGitHubPayload(projectId, serviceName, body);
    }
    if (githubEvent === 'push') {
        return deploymentFromGitHubPushPayload(projectId, serviceName, body);
    }
    if (githubEvent === 'page_build') {
        return deploymentFromGitHubPageBuildPayload(projectId, serviceName, body);
    }
    return null;
};

const recordIncidentIfMissing = async (input: {
    projectId: string;
    relatedDeploymentId?: string;
    title: string;
    description: string;
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
    service: string;
    actor: string;
}) => {
    const alreadyOpen = (await listIncidentsAsync()).some((incident) =>
        incident.projectId === input.projectId &&
        incident.service === input.service &&
        incident.title === input.title &&
        incident.status !== 'Resolved'
    );
    if (alreadyOpen) return undefined;

    const incident = await createIncident({
        projectId: input.projectId,
        relatedDeploymentId: input.relatedDeploymentId || '',
        title: input.title,
        description: input.description,
        severity: input.severity,
        status: 'Open',
        service: input.service,
        summary: input.description,
    });
    observeIncidentCreated();
    recordActivity({
        actor: input.actor,
        role: 'system',
        projectId: input.projectId,
        eventType: 'incident.created',
        action: `incident.created:${incident.title}`,
    });
    realtime.broadcast({ type: 'incident.created', payload: incident });
    return incident;
};

const recordDeploymentFailureIncident = async (deployment: Deployment, actor: string) => {
    if (!['Failed', 'Rolled Back'].includes(deployment.status)) return;
    await recordIncidentIfMissing({
        projectId: deployment.projectId,
        title: `Deployment ${deployment.status}: ${deployment.version}`,
        description: `${deployment.provider} reported ${deployment.status.toLowerCase()} for ${deployment.service} ${deployment.version}.`,
        severity: deployment.status === 'Failed' ? 'High' : 'Medium',
        service: deployment.service,
        actor,
        relatedDeploymentId: deployment.id,
    });
    realtime.broadcast({ type: 'deployment.failed', payload: deployment });
};

const limiter = rateLimit({
    windowMs: apiConfig.rateLimitWindowMs,
    limit: apiConfig.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
});

const requestIdMiddleware: express.RequestHandler = (req, res, next) => {
    const incoming = String(req.header('x-request-id') || '').trim();
    const requestId = incoming || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
};

const securityHeaders: express.RequestHandler = (_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (apiConfig.isProduction) {
        res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
    next();
};

// Middleware
app.set('trust proxy', apiConfig.trustProxy);
app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use(cors({ origin: apiConfig.corsOrigin, credentials: true }));
app.use(json({ limit: apiConfig.jsonLimit }));
app.use(limiter);
app.use(authMiddleware);
app.use(prometheusMiddleware);
// TODO(gateway): introduce structured request logging with correlation IDs
// TECH-DEBT(gateway): move proxy route configuration to config service

app.use((req, _res, next) => {
    ensurePublicSeedData();
    bump('requests');
    next();
});

app.get('/', (_req, res) => {
    res.json({
        service: 'API Gateway',
        status: 'running',
        version: '1.0.0',
        endpoints: [
            '/health',
            '/api/dashboard',
            '/api/projects',
            '/api/tasks',
            '/api/deployments',
            '/api/incidents',
            '/api/service-health',
            '/metrics',
            '/activity',
        ]
    });
});

app.get('/api/dashboard', async (_req, res) => {
    const email = requireRequesterEmail(_req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const projects = visibleProjects(store.projects, email, getRole(_req), requesterWorkspaceId(_req));
    const projectIds = new Set(projects.map((project) => project.id));
    const tasks = store.tasks.filter((task) => projectIds.has(task.projectId));
    const incidents = store.incidents.filter((incident) => projectIds.has(incident.projectId));
    const deployments = store.deployments.filter((deployment) => projectIds.has(deployment.projectId));
    const healthChecks = store.projectHealthChecks.filter((check) => projectIds.has(check.projectId));
    const oneWeekAgo = Date.now() - 7 * 86400000;
    const completedTasks = tasks.filter((task) => task.status === 'DONE').length;
    const openTrackedIncidents = incidents.filter((incident) => incident.status !== 'Resolved').length;
    const deploymentsThisWeek = deployments.filter((deployment) => new Date(deployment.startedAt).getTime() >= oneWeekAgo).length;
    const latestHealthByProject = new Map<string, ProjectHealthCheck>();
    healthChecks.forEach((check) => {
        if (!latestHealthByProject.has(check.projectId)) {
            latestHealthByProject.set(check.projectId, check);
        }
    });

    res.json({
        metrics: [
            { label: 'Total Projects', value: String(projects.length) },
            { label: 'Open Tasks', value: String(tasks.filter((task) => task.status !== 'DONE').length) },
            { label: 'Completed Tasks', value: String(completedTasks) },
            { label: 'Open Incidents', value: String(openTrackedIncidents) },
            { label: 'Deployments This Week', value: String(deploymentsThisWeek) },
        ],
        timeline: deployments.map((deployment) => ({
            title: `${deployment.service} ${deployment.status}`,
            owner: deployment.environment,
            time: new Date(deployment.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        })),
        deployments: deployments.slice(0, 5),
        incidents: incidents.filter((incident) => incident.status !== 'Resolved').slice(0, 5),
        projectHealth: projects.map((project) => {
            const latest = latestHealthByProject.get(project.id);
            return {
                projectId: project.id,
                name: project.name,
                serviceName: project.serviceName,
                appUrl: project.appUrl,
                status: latest?.status || 'unknown',
                statusCode: latest?.statusCode || null,
                responseTimeMs: latest?.responseTimeMs || null,
                checkedAt: latest?.checkedAt || null,
            };
        }),
    });
});

app.get('/api/database', (_req, res) => {
    res.json(databaseInfo());
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const result = await registerUser({
            name: String(req.body?.name || ''),
            email: String(req.body?.email || ''),
            password: String(req.body?.password || ''),
        });
        recordActivity({
            actor: result.user.name,
            role: result.user.role,
            eventType: 'auth.registered',
            action: `auth.registered:${result.user.email}`,
        });
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const result = await loginUser({
            email: String(req.body?.email || ''),
            password: String(req.body?.password || ''),
        });
        recordActivity({
            actor: result.user.name,
            role: result.user.role,
            eventType: 'auth.login',
            action: `auth.login:${result.user.email}`,
        });
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: error instanceof Error ? error.message : 'Login failed' });
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.authUser });
});

app.get('/api/workspace/team', requireAuth, async (req, res) => {
    const workspaceId = requesterWorkspaceId(req);
    const features = await featureSnapshot();
    res.json({
        workspace: {
            id: workspaceId,
            name: DEFAULT_WORKSPACE_NAME,
            mode: 'shared',
            policy: 'One shared team workspace. Members can view shared projects; owners, admins, and project leads manage access and changes.',
        },
        members: await workspaceTeamMembers(workspaceId, req.authUser ? { email: req.authUser.email, name: req.authUser.name, role: req.authUser.role, workspaceId } : undefined),
        invites: features.workspaceInvites.filter((invite) => invite.workspaceId === workspaceId),
    });
});

app.post('/api/workspace/invites', requireRole(['owner', 'admin']), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'A valid teammate email is required' });
        return;
    }
    const role = req.body?.role === 'admin' || req.body?.role === 'viewer' ? req.body.role : 'member';
    const invite = await createWorkspaceInvite({
        workspaceId: requesterWorkspaceId(req),
        email,
        role,
        invitedBy: requesterName(req) || requesterEmail(req) || 'workspace-admin',
    });
    recordActivity({
        actor: requesterName(req) || requesterEmail(req),
        role: getRole(req),
        eventType: 'workspace.invite.created',
        action: `workspace.invite.created:${email}`,
    });
    realtime.broadcast({ type: 'workspace.invite.created', payload: invite });
    res.status(201).json({ invite, inviteUrl: `/login?invite=${invite.token}&email=${encodeURIComponent(email)}` });
});

app.get('/api/launch-readiness', requireAuth, async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;

    const workspaceId = requesterWorkspaceId(req);
    const store = await readStoreAsync();
    const projects = visibleProjects(store.projects, email, getRole(req), workspaceId);
    const projectIds = new Set(projects.map((project) => project.id));
    const tasks = store.tasks.filter((task) => projectIds.has(task.projectId));
    const deployments = store.deployments.filter((deployment) => projectIds.has(deployment.projectId));
    const incidents = store.incidents.filter((incident) => projectIds.has(incident.projectId));
    const healthChecks = store.projectHealthChecks.filter((check) => projectIds.has(check.projectId));
    const features = await featureSnapshot();
    const projectFeatureFilter = (item: { projectId: string }) => projectIds.has(item.projectId);
    const database = databaseInfo();
    const grafana = grafanaCloudStatus();

    const checklist = [
        {
            id: 'workspace',
            label: 'Shared workspace',
            done: (await workspaceTeamMembers(workspaceId, req.authUser ? { email: req.authUser.email, name: req.authUser.name, role: req.authUser.role, workspaceId } : undefined)).length > 0,
            detail: 'Team space has at least one authenticated member.',
        },
        {
            id: 'projects',
            label: 'Client projects',
            done: projects.length > 0,
            detail: `${projects.length} visible project${projects.length === 1 ? '' : 's'} in this workspace.`,
        },
        {
            id: 'monitoring',
            label: 'Project monitoring',
            done: projects.some((project) => Boolean(project.appUrl)) && healthChecks.length > 0,
            detail: `${healthChecks.length} health check${healthChecks.length === 1 ? '' : 's'} stored for visible projects.`,
        },
        {
            id: 'deployments',
            label: 'Deployment evidence',
            done: deployments.length > 0,
            detail: `${deployments.length} deployment record${deployments.length === 1 ? '' : 's'} captured.`,
        },
        {
            id: 'incidents',
            label: 'Incident workflow',
            done: incidents.length > 0 || healthChecks.some((check) => check.status !== 'healthy'),
            detail: `${incidents.length} incident record${incidents.length === 1 ? '' : 's'} available.`,
        },
        {
            id: 'github',
            label: 'Code metrics',
            done: features.codeMetrics.some(projectFeatureFilter),
            detail: `${features.codeMetrics.filter(projectFeatureFilter).length} code metric profile${features.codeMetrics.filter(projectFeatureFilter).length === 1 ? '' : 's'} connected.`,
        },
        {
            id: 'alerts',
            label: 'Alerting rules',
            done: features.alertRules.some(projectFeatureFilter) || features.alertIntegrations.some(projectFeatureFilter),
            detail: `${features.alertRules.filter(projectFeatureFilter).length} alert rule${features.alertRules.filter(projectFeatureFilter).length === 1 ? '' : 's'} and ${features.alertIntegrations.filter(projectFeatureFilter).length} channel${features.alertIntegrations.filter(projectFeatureFilter).length === 1 ? '' : 's'}.`,
        },
        {
            id: 'reports',
            label: 'Client reporting',
            done: features.clientReports.some(projectFeatureFilter),
            detail: `${features.clientReports.filter(projectFeatureFilter).length} client report${features.clientReports.filter(projectFeatureFilter).length === 1 ? '' : 's'} generated.`,
        },
        {
            id: 'database',
            label: 'Durable database',
            done: database.engine === 'Postgres' && database.durable,
            detail: `${database.engine} is configured as the production data layer.`,
        },
        {
            id: 'grafana',
            label: 'Grafana Cloud metrics',
            done: grafana.configured && Boolean(grafana.lastPush?.pushed),
            detail: grafana.lastPush?.timestamp ? `Last metrics push at ${grafana.lastPush.timestamp}.` : 'Grafana Cloud connection is configured.',
        },
    ];

    const score = Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100);
    res.json({
        score,
        status: score >= 85 ? 'Launch Ready' : score >= 60 ? 'Almost Ready' : 'Needs Setup',
        workspace: { id: workspaceId, name: DEFAULT_WORKSPACE_NAME },
        metrics: {
            projects: projects.length,
            tasks: tasks.length,
            deployments: deployments.length,
            incidents: incidents.length,
            healthChecks: healthChecks.length,
            openIncidents: incidents.filter((incident) => incident.status !== 'Resolved').length,
        },
        checklist,
        database,
        grafana: {
            configured: grafana.configured,
            stackUrl: grafana.stackUrl,
            lastPush: grafana.lastPush,
        },
        tenant: features.tenant,
        generatedAt: new Date().toISOString(),
    });
});

app.get('/api/backups', requireRole(['owner', 'admin']), async (_req, res) => {
    res.json({ backups: (await featureSnapshot()).backups });
});

app.post('/api/backups', requireRole(['owner', 'admin']), async (req, res) => {
    const store = await readStoreAsync();
    const features = await featureSnapshot();
    const backup = await createBackup({ store, features }, [
        'projects',
        'tasks',
        'deployments',
        'incidents',
        'healthChecks',
        'tenant',
        'comments',
        'sprints',
        'codeMetrics',
        'alertIntegrations',
    ]);
    recordActivity({
        actor: req.header('x-user') || 'admin',
        role: getRole(req),
        eventType: 'backup.created',
        action: `backup.created:${backup.fileName}`,
    });
    realtime.broadcast({ type: 'backup.created', payload: backup });
    res.status(201).json({ backup });
});

app.get('/api/projects', async (_req, res) => {
    const email = requireRequesterEmail(_req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const projects = visibleProjects(store.projects, email, getRole(_req), requesterWorkspaceId(_req)).map((project) => ({
        ...project,
        taskCount: store.tasks.filter((task) => task.projectId === project.id).length,
        openTasks: store.tasks.filter((task) => task.projectId === project.id && task.status !== 'DONE').length,
        openIncidents: store.incidents.filter((incident) => incident.projectId === project.id && incident.status !== 'Resolved').length,
    }));
    res.json({ projects });
});

app.post('/api/projects', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    if (getRole(req) === 'viewer') {
        res.status(403).json({ error: 'Viewer role cannot create projects' });
        return;
    }
    const project = await createProject({
        ...(req.body || {}),
        workspaceId: requesterWorkspaceId(req),
        owner: req.body?.owner || requesterName(req) || 'Workspace Owner',
        ownerEmail: email,
        members: mergeWorkspaceMembers(req.body?.members, { email, name: requesterName(req) || email, role: getRole(req) }),
    });
    observeProjectCreated();
    recordActivity({
        actor: requesterName(req) || 'product',
        role: getRole(req),
        projectId: project.id,
        eventType: 'project.created',
        action: `project.created:${project.name}`,
    });
    await syncGrafanaCloud('project.created');
    realtime.broadcast({ type: 'project.created', payload: project });
    res.status(201).json({ project });
});

app.patch('/api/projects/:id', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const current = (await listProjectsAsync()).find((item) => item.id === req.params.id);
    if (!current || !canManageProject(current, email, getRole(req))) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const project = await updateProject(req.params.id, req.body || {});
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'appUrl') && project.appUrl) {
        await recordProjectHealthForProject(project).catch((error) => console.error('Project health check failed', error));
    }
    recordActivity({
        actor: req.header('x-user') || 'product',
        role: getRole(req),
        projectId: project.id,
        eventType: 'project.updated',
        action: `project.updated:${project.name}`,
    });
    await syncGrafanaCloud('project.updated');
    realtime.broadcast({ type: 'project.updated', payload: project });
    res.json({ project });
});

app.delete('/api/projects/:id', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const current = (await listProjectsAsync()).find((item) => item.id === req.params.id);
    if (!current || !canDeleteProject(current, email, getRole(req))) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const deleted = await deleteProject(req.params.id);
    if (!deleted) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    await deleteProjectFeatureData(req.params.id);
    recordActivity({
        actor: requesterName(req) || email,
        role: getRole(req),
        projectId: req.params.id,
        eventType: 'project.deleted',
        action: `project.deleted:${current.name}`,
    });
    await syncGrafanaCloud('project.deleted');
    realtime.broadcast({ type: 'project.deleted', payload: { id: req.params.id, name: current.name } });
    res.json({ ok: true });
});

app.get('/api/projects/:projectId/tasks', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const project = store.projects.find((item) => item.id === req.params.projectId);
    if (!project || !projectAccessibleBy(project, email, getRole(req), requesterWorkspaceId(req))) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const tasks = store.tasks.filter((task) => task.projectId === req.params.projectId);
    res.json({ tasks });
});

app.get('/api/projects/:projectId/summary', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const project = store.projects.find((item) => item.id === req.params.projectId);
    if (!project || !projectAccessibleBy(project, email, getRole(req), requesterWorkspaceId(req))) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    const tasks = store.tasks.filter((task) => task.projectId === project.id);
    const deployments = store.deployments.filter((deployment) => deployment.projectId === project.id);
    const incidents = store.incidents.filter((incident) => incident.projectId === project.id);
    await ensureRecentProjectHealthCheck(project, store.projectHealthChecks).catch((error) => console.error('Project health check failed', error));
    const healthChecks = (await listProjectHealthChecksAsync(project.id)).slice(0, 50);
    await syncGrafanaCloud('project.summary');
    res.json({ project, tasks, deployments, incidents, healthChecks });
});

app.get('/api/projects/:projectId/health-checks', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const project = (await listProjectsAsync()).find((item) => item.id === req.params.projectId);
    if (!project || !projectAccessibleBy(project, email, getRole(req), requesterWorkspaceId(req))) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    res.json({ healthChecks: (await listProjectHealthChecksAsync(req.params.projectId)).slice(0, 50) });
});

const loadAccessibleProject = async (req: express.Request, res: express.Response) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return undefined;
    const project = (await listProjectsAsync()).find((item) => item.id === req.params.projectId);
    if (!project || !projectAccessibleBy(project, email, getRole(req), requesterWorkspaceId(req))) {
        res.status(404).json({ error: 'Project not found' });
        return undefined;
    }
    return { project, email };
};

app.get('/api/product/features', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const projectId = String(req.query.projectId || '');
    if (projectId) {
        const project = (await listProjectsAsync()).find((item) => item.id === projectId);
        if (!project || !projectAccessibleBy(project, email, getRole(req), requesterWorkspaceId(req))) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
    }
    res.json(await featureSnapshot(projectId));
});

app.get('/api/projects/:projectId/environments', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    const snapshot = await featureSnapshot(access.project.id);
    const existing = snapshot.environments;
    if (!existing.length) {
        const baseWebhook = `${req.protocol}://${req.get('host')}/webhooks/deployments/${webhookPlatformSlug(access.project.deploymentPlatform)}/${access.project.deploymentWebhookToken}`;
        const production = await upsertProjectEnvironment({
            projectId: access.project.id,
            name: 'Production',
            appUrl: access.project.appUrl,
            deploymentWebhookUrl: baseWebhook,
            healthStatus: 'unknown',
        });
        res.json({ environments: [production] });
        return;
    }
    res.json({ environments: existing });
});

app.post('/api/projects/:projectId/environments', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    const name = String(req.body?.name || '').trim();
    if (!name) {
        res.status(400).json({ error: 'Environment name is required' });
        return;
    }
    const environment = await upsertProjectEnvironment({
        ...req.body,
        projectId: access.project.id,
        name,
    });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'environment.upserted', entity: environment.name });
    recordActivity({ actor: requesterName(req) || access.email, role: getRole(req), projectId: access.project.id, eventType: 'environment.upserted', action: `environment.upserted:${environment.name}` });
    realtime.broadcast({ type: 'environment.upserted', payload: environment });
    res.status(201).json({ environment });
});

app.get(['/api/status/:slug', '/status/:slug'], async (req, res) => {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const snapshot = await featureSnapshot();
    const statusPage = snapshot.statusPages.find((page) => page.publicSlug === slug);
    if (!statusPage) {
        res.status(404).json({ error: 'Status page not found' });
        return;
    }
    const store = await readStoreAsync();
    const project = store.projects.find((item) => item.id === statusPage.projectId);
    const healthChecks = store.projectHealthChecks.filter((check) => check.projectId === statusPage.projectId).slice(0, 20);
    const incidents = store.incidents.filter((incident) => incident.projectId === statusPage.projectId).slice(0, 10);
    const uptime = healthChecks.length
        ? Number(((healthChecks.filter((check) => check.status === 'healthy').length / healthChecks.length) * 100).toFixed(1))
        : null;
    res.json({
        statusPage,
        project: project ? { id: project.id, name: project.name, serviceName: project.serviceName, appUrl: project.appUrl } : null,
        uptime,
        currentHealth: healthChecks[0] || null,
        incidents,
        updatedAt: new Date().toISOString(),
    });
});

app.put('/api/tenant', requireRole(['owner', 'admin']), async (req, res) => {
    const tenant = await updateTenantProfile(req.body || {});
    recordActivity({
        actor: req.header('x-user') || 'admin',
        role: getRole(req),
        eventType: 'tenant.updated',
        action: `tenant.updated:${tenant.name}`,
    });
    realtime.broadcast({ type: 'tenant.updated', payload: tenant });
    res.json({ tenant });
});

app.get('/api/projects/:projectId/comments', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    res.json({ comments: (await featureSnapshot(access.project.id)).comments });
});

app.get('/api/projects/:projectId/invites', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    res.json({ invites: await listProjectInvites(access.project.id) });
});

app.post('/api/projects/:projectId/invites', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
        res.status(400).json({ error: 'A valid invite email is required' });
        return;
    }
    const role = req.body?.role === 'admin' || req.body?.role === 'viewer' ? req.body.role : 'member';
    const members = access.project.members.some((member) => member.email.toLowerCase() === email)
        ? access.project.members
        : [...access.project.members, { email, name: email, role }];
    const project = await updateProject(access.project.id, { members });
    const invite = await createProjectInvite({
        projectId: access.project.id,
        workspaceId: access.project.workspaceId || requesterWorkspaceId(req),
        email,
        role,
        invitedBy: requesterName(req) || access.email,
    });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'project.invite.created', entity: email });
    recordActivity({ actor: requesterName(req) || access.email, role: getRole(req), projectId: access.project.id, eventType: 'project.invite.created', action: `project.invite.created:${email}` });
    realtime.broadcast({ type: 'project.invite.created', payload: { invite, project } });
    res.status(201).json({ invite, project, inviteUrl: `/login?invite=${invite.token}&email=${encodeURIComponent(email)}` });
});

app.post('/api/invites/:token/accept', requireAuth, async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const invite = await acceptProjectInvite(req.params.token, email);
    if (invite) {
        recordActivity({ actor: requesterName(req) || email, role: getRole(req), projectId: invite.projectId, eventType: 'project.invite.accepted', action: `project.invite.accepted:${email}` });
        realtime.broadcast({ type: 'project.invite.accepted', payload: invite });
        res.json({ invite, scope: 'project' });
        return;
    }

    const workspaceInvite = await acceptWorkspaceInvite(req.params.token, email);
    if (!workspaceInvite) {
        res.status(404).json({ error: 'Invite not found or already used' });
        return;
    }
    recordActivity({ actor: requesterName(req) || email, role: getRole(req), eventType: 'workspace.invite.accepted', action: `workspace.invite.accepted:${email}` });
    realtime.broadcast({ type: 'workspace.invite.accepted', payload: workspaceInvite });
    res.json({ invite: workspaceInvite, scope: 'workspace' });
});

app.post('/api/projects/:projectId/comments', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
        res.status(400).json({ error: 'Comment body is required' });
        return;
    }
    const comment = await createComment({
        projectId: access.project.id,
        taskId: String(req.body?.taskId || ''),
        body,
        author: requesterName(req) || access.email,
    });
    recordActivity({
        actor: requesterName(req) || access.email,
        role: getRole(req),
        projectId: access.project.id,
        eventType: 'comment.created',
        action: `comment.created:${access.project.name}`,
    });
    realtime.broadcast({ type: 'comment.created', payload: comment });
    res.status(201).json({ comment });
});

app.get('/api/projects/:projectId/sprints', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    res.json({ sprints: (await featureSnapshot(access.project.id)).sprints });
});

app.post('/api/projects/:projectId/sprints', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const name = String(req.body?.name || '').trim();
    if (!name) {
        res.status(400).json({ error: 'Sprint name is required' });
        return;
    }
    const sprint = await createSprint({ ...req.body, projectId: access.project.id, name });
    recordActivity({
        actor: requesterName(req) || access.email,
        role: getRole(req),
        projectId: access.project.id,
        eventType: 'sprint.created',
        action: `sprint.created:${sprint.name}`,
    });
    realtime.broadcast({ type: 'sprint.created', payload: sprint });
    res.status(201).json({ sprint });
});

app.patch('/api/projects/:projectId/sprints/:sprintId', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const sprint = await updateSprint(req.params.sprintId, req.body || {});
    if (!sprint || sprint.projectId !== access.project.id) {
        res.status(404).json({ error: 'Sprint not found' });
        return;
    }
    recordActivity({
        actor: requesterName(req) || access.email,
        role: getRole(req),
        projectId: access.project.id,
        eventType: 'sprint.updated',
        action: `sprint.updated:${sprint.name}`,
    });
    realtime.broadcast({ type: 'sprint.updated', payload: sprint });
    res.json({ sprint });
});

app.get('/api/projects/:projectId/code-metrics', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    res.json({ codeMetrics: (await featureSnapshot(access.project.id)).codeMetrics });
});

app.post('/api/projects/:projectId/code-metrics', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const codeMetric = await upsertCodeMetrics({ ...req.body, projectId: access.project.id });
    recordActivity({
        actor: requesterName(req) || access.email,
        role: getRole(req),
        projectId: access.project.id,
        eventType: 'code_metrics.synced',
        action: `code_metrics.synced:${codeMetric.repository || access.project.name}`,
    });
    realtime.broadcast({ type: 'code_metrics.synced', payload: codeMetric });
    res.status(201).json({ codeMetric });
});

app.post('/api/projects/:projectId/github/sync', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    try {
        const metrics = await fetchGitHubRepositoryMetrics(String(req.body?.repository || ''));
        const codeMetric = await upsertCodeMetrics({
            projectId: access.project.id,
            provider: 'GitHub',
            repository: metrics.fullName,
            branch: metrics.defaultBranch,
            commits: metrics.commits,
            pullRequests: metrics.pullRequests,
            openIssues: metrics.openIssues,
            coverage: Number(req.body?.coverage || 0),
            deploymentFrequency: metrics.deploymentFrequency,
            leadTimeHours: metrics.leadTimeHours,
            sourceUrl: metrics.sourceUrl,
        });
        await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'github.synced', entity: metrics.fullName });
        recordActivity({ actor: requesterName(req) || access.email, role: getRole(req), projectId: access.project.id, eventType: 'github.synced', action: `github.synced:${metrics.fullName}` });
        realtime.broadcast({ type: 'github.synced', payload: codeMetric });
        res.status(201).json({ codeMetric, metrics });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'GitHub sync failed' });
    }
});

app.get('/api/projects/:projectId/alert-integrations', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    res.json({ alertIntegrations: (await featureSnapshot(access.project.id)).alertIntegrations });
});

app.post('/api/projects/:projectId/alert-integrations', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    const provider = String(req.body?.provider || '').toLowerCase() === 'discord' ? 'Discord' : 'Slack';
    const alertIntegration = await createAlertIntegration({ ...req.body, provider, projectId: access.project.id });
    recordActivity({
        actor: requesterName(req) || access.email,
        role: getRole(req),
        projectId: access.project.id,
        eventType: 'alert_integration.created',
        action: `alert_integration.created:${provider}`,
    });
    realtime.broadcast({ type: 'alert_integration.created', payload: alertIntegration });
    res.status(201).json({ alertIntegration });
});

app.post('/api/projects/:projectId/alert-integrations/:integrationId/test', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    const message = String(req.body?.message || `DevPilot test alert for ${access.project.name}`);
    const result = await testAlertIntegration(req.params.integrationId, message);
    if (!result || result.integration.projectId !== access.project.id) {
        res.status(404).json({ error: 'Alert integration not found' });
        return;
    }
    recordActivity({
        actor: requesterName(req) || access.email,
        role: getRole(req),
        projectId: access.project.id,
        eventType: 'alert_integration.tested',
        action: `alert_integration.tested:${result.integration.provider}`,
    });
    res.json(result);
});

app.post('/api/projects/:projectId/assistant/incidents/:incidentId', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    const store = await readStoreAsync();
    const incident = store.incidents.find((item) => item.id === req.params.incidentId && item.projectId === access.project.id);
    if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
    }
    const insight = await createIncidentAssistantInsight({
        projectId: access.project.id,
        incident,
        deployments: store.deployments.filter((deployment) => deployment.projectId === access.project.id),
        healthChecks: store.projectHealthChecks.filter((check) => check.projectId === access.project.id),
    });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'incident.assistant.generated', entity: incident.title });
    recordActivity({ actor: requesterName(req) || access.email, role: getRole(req), projectId: access.project.id, eventType: 'incident.assistant.generated', action: `incident.assistant.generated:${incident.title}` });
    realtime.broadcast({ type: 'incident.assistant.generated', payload: insight });
    res.status(201).json({ insight });
});

app.post('/api/projects/:projectId/postmortems/:incidentId', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    const store = await readStoreAsync();
    const incident = store.incidents.find((item) => item.id === req.params.incidentId && item.projectId === access.project.id);
    if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
    }
    const postmortem = await createPostmortem({
        projectId: access.project.id,
        incident,
        deployments: store.deployments.filter((deployment) => deployment.projectId === access.project.id),
        healthChecks: store.projectHealthChecks.filter((check) => check.projectId === access.project.id),
    });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'postmortem.generated', entity: incident.title });
    recordActivity({ actor: requesterName(req) || access.email, role: getRole(req), projectId: access.project.id, eventType: 'postmortem.generated', action: `postmortem.generated:${incident.title}` });
    realtime.broadcast({ type: 'postmortem.generated', payload: postmortem });
    res.status(201).json({ postmortem });
});

app.post('/api/projects/:projectId/slos', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const name = String(req.body?.name || 'Availability SLO');
    const slo = await upsertSlo({ ...req.body, projectId: access.project.id, name });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'slo.upserted', entity: slo.name });
    realtime.broadcast({ type: 'slo.upserted', payload: slo });
    res.status(201).json({ slo });
});

app.post('/api/projects/:projectId/client-reports', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    const store = await readStoreAsync();
    const report = await createClientReport({
        projectId: access.project.id,
        projectName: access.project.name,
        format: String(req.body?.format || '').toLowerCase() === 'monthly' ? 'Monthly' : 'Weekly',
        tasks: store.tasks.filter((task) => task.projectId === access.project.id),
        deployments: store.deployments.filter((deployment) => deployment.projectId === access.project.id),
        incidents: store.incidents.filter((incident) => incident.projectId === access.project.id),
        healthChecks: store.projectHealthChecks.filter((check) => check.projectId === access.project.id),
    });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'client_report.generated', entity: report.period });
    recordActivity({ actor: requesterName(req) || access.email, role: getRole(req), projectId: access.project.id, eventType: 'client_report.generated', action: `client_report.generated:${report.format}` });
    realtime.broadcast({ type: 'client_report.generated', payload: report });
    res.status(201).json({ report });
});

app.post('/api/projects/:projectId/release-approvals', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    const title = String(req.body?.title || '').trim();
    if (!title) {
        res.status(400).json({ error: 'Approval title is required' });
        return;
    }
    const approval = await createReleaseApproval({ ...req.body, projectId: access.project.id, title, requester: requesterName(req) || access.email });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'release_approval.created', entity: approval.title });
    realtime.broadcast({ type: 'release_approval.created', payload: approval });
    res.status(201).json({ approval });
});

app.patch('/api/projects/:projectId/release-approvals/:approvalId', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    const approval = await updateReleaseApproval(req.params.approvalId, { ...req.body, approver: requesterName(req) || access.email });
    if (!approval || approval.projectId !== access.project.id) {
        res.status(404).json({ error: 'Release approval not found' });
        return;
    }
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: `release_approval.${String(approval.status).toLowerCase()}`, entity: approval.title });
    realtime.broadcast({ type: 'release_approval.updated', payload: approval });
    res.json({ approval });
});

app.put('/api/projects/:projectId/status-page', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const statusPage = await upsertStatusPage({ ...req.body, projectId: access.project.id, projectName: access.project.name });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'status_page.updated', entity: statusPage.publicSlug });
    realtime.broadcast({ type: 'status_page.updated', payload: statusPage });
    res.json({ statusPage });
});

app.put('/api/projects/:projectId/on-call', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canManageProject(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project admin access required' });
        return;
    }
    const schedule = await upsertOnCall({ ...req.body, projectId: access.project.id });
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'on_call.updated', entity: schedule.primary || access.project.name });
    realtime.broadcast({ type: 'on_call.updated', payload: schedule });
    res.json({ schedule });
});

app.post('/api/projects/:projectId/alert-rules', async (req, res) => {
    const access = await loadAccessibleProject(req, res);
    if (!access) return;
    if (!canEditProjectContent(access.project, access.email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const name = String(req.body?.name || '').trim();
    if (!name) {
        res.status(400).json({ error: 'Alert rule name is required' });
        return;
    }
    const rule = await createAlertRule({ ...req.body, projectId: access.project.id, name });
    const evaluations = await evaluateProjectAlertsFor(access.project.id, 'rule-created');
    await recordAudit({ projectId: access.project.id, actor: requesterName(req) || access.email, action: 'alert_rule.created', entity: rule.name });
    realtime.broadcast({ type: 'alert_rule.created', payload: rule });
    res.status(201).json({ rule, evaluations });
});

app.get('/api/tasks', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const projectId = String(req.query.projectId || '');
    const store = await readStoreAsync();
    const projectIds = new Set(visibleProjects(store.projects, email, getRole(req), requesterWorkspaceId(req)).map((project) => project.id));
    const tasks = store.tasks.filter((task) => projectIds.has(task.projectId) && (!projectId || task.projectId === projectId));
    res.json({ tasks });
});

app.post('/api/tasks', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const project = (await listProjectsAsync()).find((item) => item.id === String(req.body?.projectId || ''));
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (!canEditProjectContent(project, email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const task = await createTask(req.body || {});
    observeTaskCreated();
    recordActivity({
        actor: req.header('x-user') || 'product',
        role: getRole(req),
        projectId: task.projectId,
        eventType: 'task.created',
        action: `task.created:${task.title}`,
    });
    await syncGrafanaCloud('task.created');
    realtime.broadcast({ type: 'task.created', payload: task });
    res.status(201).json({ task });
});

app.patch('/api/tasks/:id', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const existing = store.tasks.find((item) => item.id === req.params.id);
    const fallbackProjectId = String(req.body?.projectId || '');
    const project = existing
        ? store.projects.find((item) => item.id === existing.projectId)
        : store.projects.find((item) => item.id === fallbackProjectId);
    if (!project) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    if (!canEditProjectContent(project, email, getRole(req))) {
        res.status(403).json({ error: 'Task access denied' });
        return;
    }
    const task = existing
        ? await updateTask(req.params.id, req.body || {})
        : await createTask({ ...(req.body || {}), id: req.params.id, projectId: project.id });
    if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    recordActivity({
        actor: req.header('x-user') || 'product',
        role: getRole(req),
        projectId: task.projectId,
        eventType: task.status === 'DONE' ? 'task.completed' : 'task.updated',
        action: req.body?.status === 'DONE' ? `task.completed:${task.title}` : req.body?.status ? `task.updated:${task.title}` : `task.updated:${task.title}`,
    });
    await syncGrafanaCloud('task.updated');
    realtime.broadcast({ type: 'task.updated', payload: task });
    if (existing?.status !== 'DONE' && task.status === 'DONE') {
        realtime.broadcast({ type: 'task.completed', payload: task });
    }
    res.json({ task });
});

app.delete('/api/tasks/:id', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const existing = store.tasks.find((item) => item.id === req.params.id);
    const project = existing ? store.projects.find((item) => item.id === existing.projectId) : undefined;
    if (!existing || !project) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    if (!canEditProjectContent(project, email, getRole(req))) {
        res.status(403).json({ error: 'Task access denied' });
        return;
    }
    const deleted = await deleteTask(req.params.id);
    if (!deleted) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    recordActivity({
        actor: req.header('x-user') || 'product',
        role: getRole(req),
        action: `task.deleted:${req.params.id}`,
    });
    realtime.broadcast({ type: 'task.deleted', payload: { id: req.params.id } });
    res.json({ ok: true });
});

app.get('/api/deployments', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const projectId = String(req.query.projectId || '');
    const store = await readStoreAsync();
    const projectIds = new Set(visibleProjects(store.projects, email, getRole(req), requesterWorkspaceId(req)).map((project) => project.id));
    const deployments = store.deployments.filter((deployment) => projectIds.has(deployment.projectId) && (!projectId || deployment.projectId === projectId));
    res.json({ deployments });
});

app.post('/api/deployments', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const project = (await listProjectsAsync()).find((item) => item.id === String(req.body?.projectId || ''));
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (!canEditProjectContent(project, email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const deployment = await createDeployment(req.body || {});
    observeDeploymentCreated();
    recordActivity({
        actor: req.header('x-user') || 'release',
        role: getRole(req),
        projectId: deployment.projectId,
        eventType: ['Failed', 'Rolled Back'].includes(deployment.status) ? 'deployment.failed' : 'deployment.created',
        action: `deployment.added:${deployment.version}`,
    });
    await recordDeploymentFailureIncident(deployment, req.header('x-user') || deployment.triggeredBy || deployment.provider);
    await evaluateProjectAlertsFor(deployment.projectId, 'deployment').catch((error) => console.error('Alert evaluation failed', error));
    await syncGrafanaCloud('deployment.created');
    realtime.broadcast({ type: 'deployment.created', payload: deployment });
    res.status(201).json({ deployment });
});

app.post('/api/projects/:projectId/deployments/webhook', async (req, res) => {
    const project = (await listProjectsAsync()).find((item) => item.id === req.params.projectId);
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }

    const deployment = await createDeployment(deploymentFromWebhookPayload(project.id, req.body || {}));
    observeDeploymentCreated();
    recordActivity({
        actor: req.header('x-user') || deployment.triggeredBy || deployment.provider,
        role: getRole(req),
        projectId: deployment.projectId,
        eventType: ['Failed', 'Rolled Back'].includes(deployment.status) ? 'deployment.failed' : 'deployment.created',
        action: `deployment.added:${deployment.version}`,
    });
    await recordDeploymentFailureIncident(deployment, req.header('x-user') || deployment.triggeredBy || deployment.provider);
    await evaluateProjectAlertsFor(deployment.projectId, 'deployment-webhook').catch((error) => console.error('Alert evaluation failed', error));
    await syncGrafanaCloud('deployment.webhook');
    realtime.broadcast({ type: 'deployment.created', payload: deployment });
    res.status(201).json({ deployment });
});

const handleDeploymentWebhook = async (req: express.Request, res: express.Response) => {
    if (String(req.header('x-github-event') || '').toLowerCase() === 'ping') {
        res.json({ ok: true, message: 'DevPilot deployment webhook is reachable.' });
        return;
    }

    const project = await findProjectByDeploymentWebhookToken(req.params.token);
    if (!project) {
        res.status(404).json({ error: 'Deployment webhook not found' });
        return;
    }

    const githubEvent = String(req.header('x-github-event') || '').toLowerCase();
    const rawProvider = req.body?.provider || req.body?.source || req.body?.type?.split('.')?.[0];
    const provider = rawProvider
        ? normalizeDeploymentProvider(rawProvider)
        : deploymentProviderFromPlatform(req.params.platform || project.deploymentPlatform);
    const githubDeployment = deploymentFromGitHubEvent(project.id, project.serviceName, githubEvent, req.body || {});
    const deploymentInput = githubDeployment
        ? githubDeployment
        : provider === 'Vercel' || String(req.body?.type || '').toLowerCase().startsWith('deployment.')
        ? deploymentFromVercelPayload(project.id, project.serviceName, req.body || {})
        : {
            ...deploymentFromWebhookPayload(project.id, req.body || {}),
            service: req.body?.service || req.body?.serviceName || project.serviceName || 'application-service',
        };
    const deployment = await createDeployment(deploymentInput);
    observeDeploymentCreated();
    recordActivity({
        actor: deployment.triggeredBy || deployment.provider,
        role: 'system',
        projectId: deployment.projectId,
        eventType: ['Failed', 'Rolled Back'].includes(deployment.status) ? 'deployment.failed' : 'deployment.created',
        action: `deployment.added:${deployment.version}`,
    });
    await recordDeploymentFailureIncident(deployment, deployment.triggeredBy || deployment.provider);
    await evaluateProjectAlertsFor(deployment.projectId, 'platform-webhook').catch((error) => console.error('Alert evaluation failed', error));
    await syncGrafanaCloud('deployment.platform-webhook');
    realtime.broadcast({ type: 'deployment.created', payload: deployment });
    res.status(201).json({ deployment });
};

app.post('/webhooks/deployments/:token', handleDeploymentWebhook);
app.post('/webhooks/deployments/:platform/:token', handleDeploymentWebhook);

app.get('/api/slos', async (_req, res) => {
    res.json({ slos: (await readStoreAsync()).slos });
});

app.get('/api/incidents', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const projectId = String(req.query.projectId || '');
    const store = await readStoreAsync();
    const projectIds = new Set(visibleProjects(store.projects, email, getRole(req), requesterWorkspaceId(req)).map((project) => project.id));
    const incidents = store.incidents.filter((incident) => projectIds.has(incident.projectId) && (!projectId || incident.projectId === projectId));
    res.json({ incidents });
});

app.post('/api/incidents', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const project = (await listProjectsAsync()).find((item) => item.id === String(req.body?.projectId || ''));
    if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
    }
    if (!canEditProjectContent(project, email, getRole(req))) {
        res.status(403).json({ error: 'Project access denied' });
        return;
    }
    const incident = await createIncident(req.body || {});
    observeIncidentCreated();
    recordActivity({
        actor: req.header('x-user') || 'support',
        role: getRole(req),
        projectId: incident.projectId,
        eventType: 'incident.created',
        action: `incident.created:${incident.title}`,
    });
    await syncGrafanaCloud('incident.created');
    await evaluateProjectAlertsFor(incident.projectId, 'incident-created').catch((error) => console.error('Alert evaluation failed', error));
    realtime.broadcast({ type: 'incident.created', payload: incident });
    res.status(201).json({ incident });
});

app.patch('/api/incidents/:id', async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;
    const store = await readStoreAsync();
    const existing = store.incidents.find((item) => item.id === req.params.id);
    const project = existing ? store.projects.find((item) => item.id === existing.projectId) : undefined;
    if (!existing || !project) {
        res.status(404).json({ error: 'Incident not found' });
        return;
    }
    if (!canEditProjectContent(project, email, getRole(req))) {
        res.status(403).json({ error: 'Incident access denied' });
        return;
    }
    const incident = await updateIncident(req.params.id, req.body || {});
    if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
    }
    recordActivity({
        actor: req.header('x-user') || 'support',
        role: getRole(req),
        projectId: incident.projectId,
        eventType: existing.status !== 'Resolved' && incident.status === 'Resolved' ? 'incident.resolved' : 'incident.updated',
        action: existing.status !== 'Resolved' && incident.status === 'Resolved' ? `incident.resolved:${incident.title}` : `incident.updated:${incident.title}`,
    });
    realtime.broadcast({ type: 'incident.updated', payload: incident });
    await evaluateProjectAlertsFor(incident.projectId, 'incident-updated').catch((error) => console.error('Alert evaluation failed', error));
    if (existing.status !== 'Resolved' && incident.status === 'Resolved') {
        realtime.broadcast({ type: 'incident.resolved', payload: incident });
    }
    res.json({ incident });
});

app.post('/api/tasks/reset', async (_req, res) => {
    const store = await resetStore();
    res.json({ tasks: store.tasks });
});

const healthPayload = (service: string) => ({
    status: 'healthy',
    service,
    version: apiConfig.version,
    environment: apiConfig.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    database: databaseInfo(),
    timestamp: new Date().toISOString(),
});

const serviceChecks = [
    { name: 'API Gateway', service: 'api-gateway', path: '/gateway/health', url: process.env.GATEWAY_HEALTH_URL || `http://localhost:${PORT}/gateway/health` },
    { name: 'Auth Service', service: 'auth-service', path: '/auth/health', url: process.env.AUTH_HEALTH_URL || 'http://localhost:3001/health' },
    { name: 'Project Service', service: 'project-service', path: '/project/health', url: process.env.PROJECT_HEALTH_URL || 'http://localhost:3002/health' },
    { name: 'Analytics Service', service: 'analytics-service', path: '/analytics/health', url: process.env.ANALYTICS_HEALTH_URL || 'http://localhost:3003/health' },
    { name: 'Notification Service', service: 'notification-service', path: '/notification/health', url: process.env.NOTIFICATION_HEALTH_URL || 'http://localhost:3004/health' },
];

const checkUrl = (url: string) =>
    new Promise<boolean>((resolve) => {
        const request = http.get(url, (response) => {
            response.resume();
            resolve(response.statusCode ? response.statusCode >= 200 && response.statusCode < 300 : false);
        });
        request.setTimeout(1200, () => {
            request.destroy();
            resolve(false);
        });
        request.on('error', () => resolve(false));
    });

app.get('/health', (_req, res) => {
    res.json(healthPayload('api-gateway'));
});

app.get('/gateway/health', (_req, res) => {
    res.json(healthPayload('api-gateway'));
});

app.get('/auth/health', (_req, res) => {
    res.json(healthPayload('auth-service'));
});

app.get('/project/health', (_req, res) => {
    res.json(healthPayload('project-service'));
});

app.get('/analytics/health', (_req, res) => {
    res.json(healthPayload('analytics-service'));
});

app.get('/notification/health', (_req, res) => {
    res.json(healthPayload('notification-service'));
});

app.get('/api/service-health', async (_req, res) => {
    const services = await Promise.all(serviceChecks.map(async (service) => {
        const healthy = await checkUrl(service.url);
        return {
            name: service.name,
            path: service.path,
            service: service.service,
            status: healthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
        };
    }));
    const projects = await listProjectsAsync();
    services
        .filter((service) => service.status === 'unhealthy')
        .forEach((service) => {
            projects
                .filter((project) => project.serviceName === service.service)
                .forEach((project) => {
                    recordIncidentIfMissing({
                        projectId: project.id,
                        title: `Health check failed: ${service.name}`,
                        description: `${service.name} health endpoint ${service.path} is currently unhealthy.`,
                        severity: 'High',
                        service: service.service,
                        actor: 'health-monitor',
                    });
                });
        });
    res.json({ services });
});

app.get('/api/monitoring/summary', (_req, res) => {
    res.json(requestHealthSummary());
});

app.get('/api/grafana/status', async (_req, res) => {
    const result = await syncGrafanaCloud('status.check');
    res.json({ ...grafanaCloudStatus(), check: result });
});

app.post('/api/grafana/provision', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.header('authorization') !== `Bearer ${cronSecret}`) {
        res.status(401).json({ error: 'Unauthorized Grafana provisioning request' });
        return;
    }

    const result = await provisionGrafanaCloudDashboards();
    res.status(result.ok ? 200 : 502).json(result);
});

app.post('/api/admin/seed-public-projects', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.header('authorization') !== `Bearer ${cronSecret}`) {
        res.status(401).json({ error: 'Unauthorized seed request' });
        return;
    }

    const limit = Math.max(1, Math.min(100, Number(req.body?.limit || req.query.limit || 100)));
    const concurrency = Math.max(1, Math.min(25, Number(req.body?.concurrency || req.query.concurrency || 20)));
    const seed = await ensurePublicProjectCatalog(limit);
    const projectIds = new Set(seed.projectIds);
    const projects = (await listProjectsAsync())
        .filter((project) => projectIds.has(project.id) && project.status === 'Active' && project.appUrl);
    const checks = await runProjectHealthChecksForProjects(projects, concurrency);
    const grafana = await syncGrafanaCloud('public.project.catalog.seed', { force: true });
    realtime.broadcast({
        type: 'project.catalog.seeded',
        payload: { requested: seed.requested, created: seed.created, existing: seed.existing, healthChecks: checks.length },
    });
    res.json({
        ok: true,
        seed: {
            requested: seed.requested,
            created: seed.created,
            existing: seed.existing,
            projects: seed.projectIds.length,
        },
        healthChecks: checks.length,
        grafana,
        at: new Date().toISOString(),
    });
});

app.post('/api/demo/workspace', requireRole(['owner', 'admin']), async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;

    const limit = Math.max(10, Math.min(100, Number(req.body?.limit || 100)));
    const seed = await ensurePublicProjectCatalog(limit);
    const store = await readStoreAsync();
    const visible = visibleProjects(store.projects, email, getRole(req), requesterWorkspaceId(req));
    const activeProjects = visible.filter((project) => project.status === 'Active' && project.appUrl).slice(0, 12);
    const checks = await runProjectHealthChecksForProjects(activeProjects, 6);
    const grafana = await syncGrafanaCloud('demo.workspace.prepared', { force: true });
    const log = recordActivity({
        actor: requesterName(req) || email,
        role: getRole(req),
        eventType: 'demo.workspace.prepared',
        action: `demo.workspace.prepared:${seed.projectIds.length} public projects`,
    });
    realtime.broadcast({
        type: 'demo.workspace.prepared',
        payload: {
            projects: seed.projectIds.length,
            created: seed.created,
            existing: seed.existing,
            healthChecks: checks.length,
        },
    });
    res.json({
        ok: true,
        activity: log,
        seed: {
            requested: seed.requested,
            created: seed.created,
            existing: seed.existing,
            projects: seed.projectIds.length,
        },
        totals: {
            visibleProjects: visible.length,
            healthChecks: checks.length,
        },
        grafana,
        at: new Date().toISOString(),
    });
});

app.get('/metrics', async (req, res) => {
    const accept = String(req.header('accept') || '').toLowerCase();
    const userAgent = String(req.header('user-agent') || '').toLowerCase();
    const wantsRawMetrics = req.query.raw === '1'
        || accept.includes('openmetrics')
        || accept.includes('text/plain')
        || userAgent.includes('prometheus')
        || userAgent.includes('grafana')
        || userAgent.includes('curl');
    const wantsBrowserPage = !wantsRawMetrics;
    if (wantsBrowserPage) {
        res.redirect(302, '/app/monitoring');
        return;
    }
    if (apiConfig.checkProjectsOnMetrics) {
        await runProjectHealthChecks().catch((error) => console.error('Project health check failed', error));
    }
    await syncGrafanaCloud('metrics.scrape');
    res.type(metricsContentType()).send(await renderMetrics());
});

app.get('/api/cron/push-metrics', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.header('authorization') !== `Bearer ${cronSecret}`) {
        res.status(401).json({ error: 'Unauthorized cron invocation' });
        return;
    }

    await runProjectHealthChecks().catch((error) => console.error('Project health check failed', error));
    const result = await syncGrafanaCloud('vercel.cron', { force: true });
    res.json({ ok: true, result, at: new Date().toISOString() });
});

const notificationTitle = (log: { eventType?: string; action: string }) => {
    const type = log.eventType || log.action.split(':')[0];
    const labels: Record<string, string> = {
        'project.created': 'Project created',
        'project.deleted': 'Project deleted',
        'task.created': 'Task created',
        'task.completed': 'Task completed',
        'deployment.created': 'Deployment created',
        'deployment.failed': 'Deployment failed',
        'incident.created': 'Incident created',
        'incident.resolved': 'Incident resolved',
        'project.health.failed': 'Health check failed',
        'project.invite.created': 'Invite sent',
        'github.synced': 'Repository synced',
        'alert_rule.created': 'Alert rule created',
        'client_report.generated': 'Client report generated',
    };
    return labels[type] || type.replace(/[._]/g, ' ');
};

app.get('/activity', async (req, res) => {
    const hasFilters = req.query.projectId || req.query.eventType || req.query.from || req.query.to;
    if (!hasFilters) {
        res.json(await listActivity());
        return;
    }
    res.json(await queryActivity({
        projectId: String(req.query.projectId || ''),
        eventType: String(req.query.eventType || ''),
        from: String(req.query.from || ''),
        to: String(req.query.to || ''),
    }));
});

app.post('/activity', (req, res) => {
    const role = getRole(req);
    const log = recordActivity({
        actor: req.header('x-user') || 'system',
        role,
        projectId: req.body?.projectId,
        eventType: req.body?.eventType,
        action: req.body?.action || 'activity.recorded',
    });
    realtime.broadcast({ type: 'activity', payload: log });
    res.json(log);
});

app.get('/api/notifications', requireAuth, async (req, res) => {
    const email = requireRequesterEmail(req, res);
    if (!email) return;

    const store = await readStoreAsync();
    const projectIds = new Set(visibleProjects(store.projects, email, getRole(req), requesterWorkspaceId(req)).map((project) => project.id));
    const logs = (await queryActivity({})).filter((log) => !log.projectId || projectIds.has(log.projectId));
    res.json({
        notifications: logs.slice(0, 50).map((log) => {
            const [, ...detailParts] = log.action.split(':');
            return {
                id: log.id,
                type: log.eventType || log.action.split(':')[0],
                title: notificationTitle(log),
                detail: detailParts.join(':') || log.action,
                timestamp: log.timestamp,
                projectId: log.projectId || '',
                actor: log.actor,
            };
        }),
    });
});

app.get('/search', async (req, res) => {
    bump('searches');
    const query = String(req.query.q || '');
    const results = await searchRecords(query);
    res.json({ query, results });
});

app.post('/uploads', requireRole(['admin', 'manager']), upload.single('file'), (req, res) => {
    bump('uploads');
            const file = (req as typeof req & { file?: Express.Multer.File }).file;
    const response = {
        filename: file?.filename,
        originalName: file?.originalname,
        size: file?.size,
    };
    recordActivity({
        actor: req.header('x-user') || 'uploader',
        role: getRole(req),
        action: `upload:${file?.originalname ?? 'unknown'}`,
    });
    res.json(response);
});

app.post('/jobs', requireRole(['admin']), (req, res) => {
    const job = {
        id: `${Date.now()}`,
        type: req.body?.type || 'sync.analytics',
        payload: req.body?.payload || {},
    };
    enqueueJob(job);
    recordActivity({
        actor: req.header('x-user') || 'automation',
        role: getRole(req),
        action: `job.enqueued:${job.type}`,
    });
    res.json({ status: 'queued', job });
});

if (process.env.ENABLE_SERVICE_PROXY === 'true') {
    const serviceRoutes = {
        '/auth': { target: 'http://auth-service:3001', changeOrigin: true },
        '/projects': { target: 'http://project-service:3002', changeOrigin: true },
        '/notifications': { target: 'http://notification-service:3004', changeOrigin: true },
    } as const;

    (Object.keys(serviceRoutes) as Array<keyof typeof serviceRoutes>).forEach(route => {
        app.use(route, createProxyMiddleware(serviceRoutes[route]));
    });
}

app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.originalUrl,
        requestId: res.locals.requestId,
    });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error('Unhandled request error', { requestId: res.locals.requestId, error });
    res.status(500).json({
        error: 'Internal Server Error',
        message: apiConfig.isProduction ? 'Unexpected server error' : message,
        requestId: res.locals.requestId,
    });
});

if (!isServerless) {
    startJobWorker(realtime.broadcast);
    runProjectHealthChecks().catch((error) => console.error('Project health check failed', error));
    setInterval(() => {
        runProjectHealthChecks().catch((error) => console.error('Project health check failed', error));
    }, apiConfig.projectHealthCheckIntervalMs);

    // Start the server
    server.listen(PORT, () => {
        console.log(`API Gateway is running on http://localhost:${PORT}`);
        startupWarnings().forEach((warning) => console.warn(`Startup warning: ${warning}`));
        // NOTE(git:perf/gateway): add connection pooling + keep-alive tuning
    });
}

export default app;
