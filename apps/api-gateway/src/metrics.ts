import client from 'prom-client';
import type { NextFunction, Request, Response } from 'express';
import { readStoreAsync } from './store';

type RequestMetric = {
  method: string;
  route: string;
  status: number;
  durationSeconds: number;
};

const registry = new client.Registry();
client.collectDefaultMetrics({
  register: registry,
  eventLoopMonitoringPrecision: 20,
  prefix: 'devpilot_',
});

const recentRequests: RequestMetric[] = [];
const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const storedCounterValues = {
  projectsCreated: 0,
  tasksCreated: 0,
  deploymentsCreated: 0,
  incidentsCreated: 0,
  projectHealthChecks: 0,
};
const storedHealthStatusCounts: Record<string, number> = {};

const routeLabel = (req: Request) => req.route?.path ? String(req.route.path) : req.path;

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests.',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'],
  buckets,
  registers: [registry],
});

const projectsCreatedTotal = new client.Counter({
  name: 'projects_created_total',
  help: 'Total projects created through the API.',
  registers: [registry],
});

const tasksCreatedTotal = new client.Counter({
  name: 'tasks_created_total',
  help: 'Total tasks created through the API.',
  registers: [registry],
});

const deploymentsCreatedTotal = new client.Counter({
  name: 'deployments_created_total',
  help: 'Total deployments created through the API.',
  registers: [registry],
});

const incidentsCreatedTotal = new client.Counter({
  name: 'incidents_created_total',
  help: 'Total incidents created through the API.',
  registers: [registry],
});

const projectHealthChecksTotal = new client.Counter({
  name: 'project_health_checks_total',
  help: 'Total project health checks recorded by DevPilot.',
  labelNames: ['status'],
  registers: [registry],
});

const activeProjectsTotal = new client.Gauge({
  name: 'active_projects_total',
  help: 'Active projects currently stored.',
  registers: [registry],
});

const projectInfo = new client.Gauge({
  name: 'project_info',
  help: 'Project metadata exposed as a labeled gauge.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url', 'project_key', 'status', 'owner'],
  registers: [registry],
});

const projectHealthStatus = new client.Gauge({
  name: 'project_health_status',
  help: 'Current project health status, 1 healthy, 0.5 warning, 0 down.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url', 'status'],
  registers: [registry],
});

const projectTasksTotal = new client.Gauge({
  name: 'project_tasks_total',
  help: 'Total issues recorded for a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectOpenTasksTotal = new client.Gauge({
  name: 'project_open_tasks_total',
  help: 'Open issues recorded for a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectCompletedTasksTotal = new client.Gauge({
  name: 'project_completed_tasks_total',
  help: 'Completed issues recorded for a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectDeploymentsTotal = new client.Gauge({
  name: 'project_deployments_total',
  help: 'Total deployments recorded for a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectIncidentsTotal = new client.Gauge({
  name: 'project_incidents_total',
  help: 'Total incidents recorded for a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectOpenIncidentsTotal = new client.Gauge({
  name: 'project_open_incidents_total',
  help: 'Open incidents recorded for a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectMembersTotal = new client.Gauge({
  name: 'project_members_total',
  help: 'Total members assigned to a project.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectResponseTimeMs = new client.Gauge({
  name: 'project_response_time_ms',
  help: 'Latest project app response time in milliseconds.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectHttpStatusCode = new client.Gauge({
  name: 'project_http_status_code',
  help: 'Latest project app HTTP status code.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectUptimePercent = new client.Gauge({
  name: 'project_uptime_percent',
  help: 'Project app uptime percentage across recent health checks.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url'],
  registers: [registry],
});

const projectHealthChecksCount = new client.Gauge({
  name: 'project_health_checks_count',
  help: 'Recent project health checks recorded by status.',
  labelNames: ['project_id', 'project_name', 'service', 'app_url', 'status'],
  registers: [registry],
});

const deploymentStatusTotal = new client.Gauge({
  name: 'deployment_status_total',
  help: 'Deployments grouped by provider, environment, and status.',
  labelNames: ['provider', 'environment', 'status'],
  registers: [registry],
});

const incidentSeverityTotal = new client.Gauge({
  name: 'incident_severity_total',
  help: 'Incidents grouped by severity and status.',
  labelNames: ['severity', 'status'],
  registers: [registry],
});

const incTo = (counter: { inc: (labelsOrValue?: any, value?: number) => void }, key: keyof typeof storedCounterValues, value: number, labels?: Record<string, string>) => {
  const delta = Math.max(0, value - storedCounterValues[key]);
  if (delta > 0) {
    labels ? counter.inc(labels, delta) : counter.inc(delta);
    storedCounterValues[key] = value;
  }
};

export const observeProjectCreated = () => {
  projectsCreatedTotal.inc();
  storedCounterValues.projectsCreated += 1;
};

export const observeTaskCreated = () => {
  tasksCreatedTotal.inc();
  storedCounterValues.tasksCreated += 1;
};

export const observeDeploymentCreated = () => {
  deploymentsCreatedTotal.inc();
  storedCounterValues.deploymentsCreated += 1;
};

export const observeIncidentCreated = () => {
  incidentsCreatedTotal.inc();
  storedCounterValues.incidentsCreated += 1;
};

export const observeProjectHealthCheck = (status: string) => {
  projectHealthChecksTotal.inc({ status });
  storedCounterValues.projectHealthChecks += 1;
  storedHealthStatusCounts[status] = (storedHealthStatusCounts[status] || 0) + 1;
};

export const prometheusMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (req.path === '/metrics') return;
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const metric = {
      method: req.method,
      route: routeLabel(req),
      status: res.statusCode,
      durationSeconds,
    };
    httpRequestsTotal.inc({ method: metric.method, route: metric.route, status: String(metric.status) });
    httpRequestDurationSeconds.observe({ method: metric.method, route: metric.route, status: String(metric.status) }, metric.durationSeconds);
    recentRequests.push(metric);
    if (recentRequests.length > 5000) {
      recentRequests.splice(0, recentRequests.length - 5000);
    }
  });

  next();
};

const resetDynamicMetrics = () => {
  activeProjectsTotal.reset();
  projectInfo.reset();
  projectHealthStatus.reset();
  projectTasksTotal.reset();
  projectOpenTasksTotal.reset();
  projectCompletedTasksTotal.reset();
  projectDeploymentsTotal.reset();
  projectIncidentsTotal.reset();
  projectOpenIncidentsTotal.reset();
  projectMembersTotal.reset();
  projectResponseTimeMs.reset();
  projectHttpStatusCode.reset();
  projectUptimePercent.reset();
  projectHealthChecksCount.reset();
  deploymentStatusTotal.reset();
  incidentSeverityTotal.reset();
};

const syncStoreMetrics = async () => {
  const store = await readStoreAsync();
  const healthChecksByProject = new Map<string, typeof store.projectHealthChecks>();

  store.projectHealthChecks.forEach((check) => {
    healthChecksByProject.set(check.projectId, [...(healthChecksByProject.get(check.projectId) || []), check]);
  });

  incTo(projectsCreatedTotal, 'projectsCreated', store.projects.length);
  incTo(tasksCreatedTotal, 'tasksCreated', store.tasks.length);
  incTo(deploymentsCreatedTotal, 'deploymentsCreated', store.deployments.length);
  incTo(incidentsCreatedTotal, 'incidentsCreated', store.incidents.length);

  const healthCounts = store.projectHealthChecks.reduce<Record<string, number>>((counts, check) => {
    counts[check.status] = (counts[check.status] || 0) + 1;
    return counts;
  }, {});
  Object.entries(healthCounts).forEach(([status, count]) => {
    const delta = Math.max(0, count - (storedHealthStatusCounts[status] || 0));
    if (delta > 0) projectHealthChecksTotal.inc({ status }, delta);
    storedHealthStatusCounts[status] = Math.max(storedHealthStatusCounts[status] || 0, count);
  });
  storedCounterValues.projectHealthChecks = Math.max(storedCounterValues.projectHealthChecks, store.projectHealthChecks.length);

  resetDynamicMetrics();
  activeProjectsTotal.set(store.projects.filter((project) => project.status === 'Active').length);

  store.deployments.forEach((deployment) => {
    deploymentStatusTotal.inc({
      provider: deployment.provider,
      environment: deployment.environment,
      status: deployment.status,
    });
  });

  store.incidents.forEach((incident) => {
    incidentSeverityTotal.inc({
      severity: incident.severity,
      status: incident.status,
    });
  });

  store.projects.forEach((project) => {
    const checks = healthChecksByProject.get(project.id) || [];
    const latest = checks[0];
    const labels = {
      project_id: project.id,
      project_name: project.name,
      service: project.serviceName,
      app_url: project.appUrl,
    };
    const projectTasks = store.tasks.filter((task) => task.projectId === project.id);
    const projectDeployments = store.deployments.filter((deployment) => deployment.projectId === project.id);
    const projectIncidents = store.incidents.filter((incident) => incident.projectId === project.id);

    projectInfo.set({ ...labels, project_key: project.projectKey, status: project.status, owner: project.owner }, 1);
    projectTasksTotal.set(labels, projectTasks.length);
    projectOpenTasksTotal.set(labels, projectTasks.filter((task) => task.status !== 'DONE').length);
    projectCompletedTasksTotal.set(labels, projectTasks.filter((task) => task.status === 'DONE').length);
    projectDeploymentsTotal.set(labels, projectDeployments.length);
    projectIncidentsTotal.set(labels, projectIncidents.length);
    projectOpenIncidentsTotal.set(labels, projectIncidents.filter((incident) => incident.status !== 'Resolved').length);
    projectMembersTotal.set(labels, (project.members || []).length);

    if (!latest) return;
    const healthyChecks = checks.filter((check) => check.status === 'healthy').length;
    const uptime = checks.length ? Number(((healthyChecks / checks.length) * 100).toFixed(2)) : 0;
    const healthValue = latest.status === 'healthy' ? 1 : latest.status === 'warning' ? 0.5 : 0;

    projectHealthStatus.set({ ...labels, status: latest.status }, healthValue);
    projectResponseTimeMs.set(labels, latest.responseTimeMs);
    projectHttpStatusCode.set(labels, latest.statusCode);
    projectUptimePercent.set(labels, uptime);
    ['healthy', 'warning', 'down'].forEach((status) => {
      projectHealthChecksCount.set({ ...labels, status }, checks.filter((check) => check.status === status).length);
    });
  });
};

export const renderMetrics = async () => {
  await syncStoreMetrics();
  return registry.metrics();
};

export const metricsContentType = () => registry.contentType;

export const requestHealthSummary = () => {
  const recent = recentRequests.slice(-200);
  const total = recent.length;
  const statusCodes = recent.reduce<Record<string, number>>((counts, request) => {
    const code = String(request.status);
    counts[code] = (counts[code] || 0) + 1;
    return counts;
  }, {});
  const errorCount = recent.filter((request) => request.status >= 500).length;
  const warningCount = recent.filter((request) => request.status >= 400 && request.status < 500).length;
  const avgResponseTimeMs = total
    ? Math.round((recent.reduce((sum, request) => sum + request.durationSeconds, 0) / total) * 1000)
    : null;
  const uptimePercent = total ? Number((((total - errorCount) / total) * 100).toFixed(2)) : null;
  const status = errorCount > 0 ? 'Down' : warningCount > 0 || (avgResponseTimeMs !== null && avgResponseTimeMs > 1000) ? 'Warning' : 'Healthy';

  return {
    status,
    totalRequests: total,
    uptimePercent,
    avgResponseTimeMs,
    statusCodes,
    lastUpdatedAt: new Date().toISOString(),
  };
};
