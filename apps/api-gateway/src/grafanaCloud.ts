import axios from 'axios';
import fs from 'fs';
import path from 'path';
import protobuf from 'protobufjs';
import { readStoreAsync } from './store';

const snappy = require('snappyjs') as { compress(input: Uint8Array): Uint8Array };

type Label = { name: string; value: string };
type Sample = { value: number; timestamp: number };
type TimeSeries = { labels: Label[]; samples: Sample[] };

const root = protobuf.Root.fromJSON({
  nested: {
    prometheus: {
      nested: {
        WriteRequest: {
          fields: {
            timeseries: { rule: 'repeated', type: 'TimeSeries', id: 1 },
          },
        },
        TimeSeries: {
          fields: {
            labels: { rule: 'repeated', type: 'Label', id: 1 },
            samples: { rule: 'repeated', type: 'Sample', id: 2 },
          },
        },
        Label: {
          fields: {
            name: { type: 'string', id: 1 },
            value: { type: 'string', id: 2 },
          },
        },
        Sample: {
          fields: {
            value: { type: 'double', id: 1 },
            timestamp: { type: 'int64', id: 2 },
          },
        },
      },
    },
  },
});

const WriteRequest = root.lookupType('prometheus.WriteRequest');
let lastPushAt = 0;
let lastPushResult: {
  pushed: boolean;
  reason: string;
  series?: number;
  timestamp?: string;
  error?: string;
  urlConfigured: boolean;
  usernameConfigured: boolean;
  tokenConfigured: boolean;
} | null = null;

const escape = (value: string) => String(value || '');

const normalizeRemoteWriteUrl = (value: string) => {
  const trimmed = String(value || '').trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/push')) return trimmed;
  if (trimmed.endsWith('/api/prom')) return `${trimmed}/push`;
  return `${trimmed}/api/prom/push`;
};

export const grafanaCloudStatus = () => ({
  configured: Boolean(process.env.GRAFANA_CLOUD_PROM_URL && process.env.GRAFANA_CLOUD_PROM_USERNAME && process.env.GRAFANA_CLOUD_API_TOKEN),
  remoteWriteUrl: normalizeRemoteWriteUrl(process.env.GRAFANA_CLOUD_PROM_URL || ''),
  stackUrl: process.env.GRAFANA_CLOUD_STACK_URL || '',
  usernameConfigured: Boolean(process.env.GRAFANA_CLOUD_PROM_USERNAME),
  tokenConfigured: Boolean(process.env.GRAFANA_CLOUD_API_TOKEN),
  dashboardTokenConfigured: Boolean(process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN || process.env.GRAFANA_CLOUD_DASHBOARD_TOKEN),
  lastPush: lastPushResult,
});

const normalizeStackUrl = (value: string) => String(value || '').trim().replace(/\/$/, '');

const dashboardToken = () =>
  String(process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN
  || process.env.GRAFANA_CLOUD_DASHBOARD_TOKEN
  || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[\r\n]/g, '');

const dashboardDirectoryCandidates = () => [
  path.resolve(process.cwd(), 'monitoring/grafana/dashboards'),
  path.resolve(__dirname, '../../../monitoring/grafana/dashboards'),
  path.resolve(__dirname, '../../monitoring/grafana/dashboards'),
];

const readDashboardFiles = () => {
  const directory = dashboardDirectoryCandidates().find((candidate) => fs.existsSync(candidate));
  if (!directory) {
    throw new Error('Grafana dashboard JSON directory was not found in the runtime bundle.');
  }
  const cloudDatasource = process.env.GRAFANA_CLOUD_DATASOURCE_NAME || 'grafanacloud-punyviper1770-prom';

  const rewriteDatasource = (value: any): any => {
    if (Array.isArray(value)) return value.map(rewriteDatasource);
    if (value && typeof value === 'object') {
      const rewritten: Record<string, unknown> = {};
      Object.entries(value).forEach(([key, nestedValue]) => {
        if (key === 'datasource' && nestedValue === 'Prometheus') {
          rewritten[key] = cloudDatasource;
          return;
        }
        if (key === 'datasource' && nestedValue && typeof nestedValue === 'object' && (nestedValue as any).type === 'prometheus') {
          rewritten[key] = { ...(nestedValue as Record<string, unknown>), uid: cloudDatasource };
          return;
        }
        rewritten[key] = rewriteDatasource(nestedValue);
      });
      return rewritten;
    }
    return value;
  };

  return fs.readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const fullPath = path.join(directory, file);
      const dashboard = rewriteDatasource(JSON.parse(fs.readFileSync(fullPath, 'utf8')));
      dashboard.id = null;
      dashboard.version = Number(dashboard.version || 0) + 1;
      return { file, dashboard };
    });
};

export const provisionGrafanaCloudDashboards = async () => {
  const stackUrl = normalizeStackUrl(process.env.GRAFANA_CLOUD_STACK_URL || '');
  const token = dashboardToken();

  if (!stackUrl || !token) {
    return {
      ok: false,
      reason: 'Grafana Cloud stack URL or dashboard service-account token is missing.',
      stackConfigured: Boolean(stackUrl),
      dashboardTokenConfigured: Boolean(token),
      dashboards: [] as Array<{ file: string; uid?: string; title?: string; status: string; url?: string; error?: string }>,
    };
  }

  const dashboardFiles = readDashboardFiles();
  const dashboards = [];

  for (const { file, dashboard } of dashboardFiles) {
    try {
      const response = await axios.post(
        `${stackUrl}/api/dashboards/db`,
        {
          dashboard,
          overwrite: true,
          message: 'Provisioned by DevPilot',
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'DevPilot Grafana Dashboard Provisioner/1.0',
          },
          timeout: 15_000,
        },
      );

      dashboards.push({
        file,
        uid: dashboard.uid,
        title: dashboard.title,
        status: String(response.data?.status || 'success'),
        url: response.data?.url ? `${stackUrl}${response.data.url}` : `${stackUrl}/d/${dashboard.uid}`,
      });
    } catch (error: any) {
      dashboards.push({
        file,
        uid: dashboard.uid,
        title: dashboard.title,
        status: 'failed',
        error: error?.response?.data?.message || error?.response?.statusText || error?.message || 'Dashboard import failed',
      });
    }
  }

  return {
    ok: dashboards.every((dashboard) => dashboard.status !== 'failed'),
    stackConfigured: true,
    dashboardTokenConfigured: true,
    dashboards,
  };
};

const series = (name: string, value: number, timestamp: number, labels: Record<string, string> = {}): TimeSeries => ({
  labels: [
    { name: '__name__', value: name },
    ...Object.entries(labels)
      .filter(([, labelValue]) => labelValue !== undefined && labelValue !== null && labelValue !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([labelName, labelValue]) => ({ name: labelName, value: escape(labelValue) })),
  ],
  samples: [{ value, timestamp }],
});

const collectSeries = async (timestamp: number) => {
  const store = await readStoreAsync();
  const healthChecksByProject = new Map<string, typeof store.projectHealthChecks>();

  store.projectHealthChecks.forEach((check) => {
    healthChecksByProject.set(check.projectId, [...(healthChecksByProject.get(check.projectId) || []), check]);
  });

  const lines: TimeSeries[] = [
    series('projects_created_total', store.projects.length, timestamp),
    series('tasks_created_total', store.tasks.length, timestamp),
    series('deployments_created_total', store.deployments.length, timestamp),
    series('incidents_created_total', store.incidents.length, timestamp),
    series('active_projects_total', store.projects.filter((project) => project.status === 'Active').length, timestamp),
  ];

  store.projects.forEach((project) => {
    const checks = healthChecksByProject.get(project.id) || [];
    const labels = {
      project_id: project.id,
      project_name: project.name,
      service: project.serviceName,
      app_url: project.appUrl,
    };
    const projectTasks = store.tasks.filter((task) => task.projectId === project.id);
    const projectDeployments = store.deployments.filter((deployment) => deployment.projectId === project.id);
    const projectIncidents = store.incidents.filter((incident) => incident.projectId === project.id);

    lines.push(series('project_info', 1, timestamp, {
      ...labels,
      project_key: project.projectKey,
      status: project.status,
      owner: project.owner,
    }));
    lines.push(series('project_tasks_total', projectTasks.length, timestamp, labels));
    lines.push(series('project_open_tasks_total', projectTasks.filter((task) => task.status !== 'DONE').length, timestamp, labels));
    lines.push(series('project_completed_tasks_total', projectTasks.filter((task) => task.status === 'DONE').length, timestamp, labels));
    lines.push(series('project_deployments_total', projectDeployments.length, timestamp, labels));
    lines.push(series('project_incidents_total', projectIncidents.length, timestamp, labels));
    lines.push(series('project_open_incidents_total', projectIncidents.filter((incident) => incident.status !== 'Resolved').length, timestamp, labels));
    lines.push(series('project_members_total', (project.members || []).length, timestamp, labels));

    const latest = checks[0];
    if (!latest) return;

    const healthyChecks = checks.filter((check) => check.status === 'healthy').length;
    const uptime = checks.length ? Number(((healthyChecks / checks.length) * 100).toFixed(2)) : 0;
    const healthValue = latest.status === 'healthy' ? 1 : latest.status === 'warning' ? 0.5 : 0;

    lines.push(series('project_health_status', healthValue, timestamp, { ...labels, status: latest.status }));
    lines.push(series('project_response_time_ms', latest.responseTimeMs, timestamp, labels));
    lines.push(series('project_http_status_code', latest.statusCode, timestamp, labels));
    lines.push(series('project_uptime_percent', uptime, timestamp, labels));

    ['healthy', 'warning', 'down'].forEach((status) => {
      lines.push(series('project_health_checks_count', checks.filter((check) => check.status === status).length, timestamp, { ...labels, status }));
    });
  });

  return lines;
};

export const pushMetricsToGrafanaCloud = async (reason: string, options: { force?: boolean } = {}) => {
  const url = normalizeRemoteWriteUrl(process.env.GRAFANA_CLOUD_PROM_URL || '');
  const username = process.env.GRAFANA_CLOUD_PROM_USERNAME;
  const password = process.env.GRAFANA_CLOUD_API_TOKEN;
  const configState = {
    urlConfigured: Boolean(url),
    usernameConfigured: Boolean(username),
    tokenConfigured: Boolean(password),
  };

  if (!url || !username || !password) {
    lastPushResult = { pushed: false, reason: 'Grafana Cloud credentials are not configured.', ...configState };
    return lastPushResult;
  }

  const now = Date.now();
  if (!options.force && now - lastPushAt < 60_000) {
    lastPushResult = { pushed: false, reason: `Skipped duplicate push for ${reason}.`, ...configState };
    return lastPushResult;
  }

  const timeseries = await collectSeries(now);
  const payload = WriteRequest.encode({ timeseries }).finish();
  const compressed = Buffer.from(snappy.compress(payload));

  try {
    await axios.post(url, compressed, {
      auth: { username, password },
      headers: {
        'Content-Type': 'application/x-protobuf',
        'Content-Encoding': 'snappy',
        'X-Prometheus-Remote-Write-Version': '0.1.0',
        'User-Agent': 'DevPilot Grafana Cloud Publisher/1.0',
      },
      timeout: 15_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (error: any) {
    lastPushResult = {
      pushed: false,
      reason,
      error: error?.response?.data?.message || error?.response?.statusText || error?.message || 'Grafana Cloud push failed',
      timestamp: new Date(now).toISOString(),
      ...configState,
    };
    throw error;
  }

  lastPushAt = now;
  lastPushResult = { pushed: true, series: timeseries.length, timestamp: new Date(now).toISOString(), reason, ...configState };
  return lastPushResult;
};
