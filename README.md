# DevPilot

DevPilot is a project-centric DevOps and observability platform for engineering teams. It combines project management, task boards, deployment tracking, incident response, health monitoring, Prometheus metrics, Grafana dashboards, and WebSocket notifications without changing the existing React + Express architecture.

Core flow:

```text
Login -> Overview -> Projects -> Project Detail -> Issues / Board / Releases / Incidents / Analytics / Monitoring
```

## Architecture

```mermaid
flowchart LR
  User["User"] --> Frontend["React + TypeScript frontend"]
  Frontend --> Gateway["Express API Gateway"]
  Frontend <-->|"/realtime WebSocket"| Gateway
  Gateway --> Store["PostgreSQL database"]
  Gateway --> Deployments["Deployment webhooks"]
  Gateway --> Health["Project URL health checks"]
  Gateway --> Incidents["Incident automation"]
  Gateway --> Metrics["prom-client registry"]
  Metrics --> Prometheus["Prometheus scrape"]
  Metrics --> Grafana["Grafana dashboards"]
  Metrics --> Cloud["Grafana Cloud remote write"]
```

DevPilot remains a monorepo with one frontend app and one API gateway. It does not require Kubernetes or a distributed service rewrite.

## API Gateway Responsibilities

The Express gateway owns:

- JWT authentication for register, login, and current-user lookup
- Project, issue, deployment, incident, and health-check APIs
- RBAC checks for project access and edit permissions
- Deployment webhook normalization for GitHub Actions, GitHub Pages, Vercel, Railway, Render, and generic providers
- Automatic incident creation for failed deployments, rollbacks, and failed health checks
- Prometheus metrics through `prom-client`
- Grafana Cloud remote-write publishing when credentials are configured
- WebSocket notification broadcasts on operational events
- Central activity timeline storage and filters

## Deployment Tracking

Deployments can be created manually or through webhooks.

Webhook shape:

```text
/webhooks/deployments/:platform/:token
/webhooks/deployments/:token
```

Tracked deployment fields:

- Provider
- Deployment URL
- Commit SHA
- Branch
- Triggered by / actor
- Version
- Status
- Environment
- Timestamp

The project Releases tab shows the latest deployment, status badge, deployment details, and chronological deployment history. Webhook-triggered deployments appear in the same history as manual releases.

## JWT Authentication

DevPilot uses API-backed JWT authentication instead of browser-only demo users.

Auth endpoints:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

Registered users are stored in PostgreSQL. Passwords use salted PBKDF2 hashes. Successful login and registration responses return a user object and signed token. Frontend API calls send the token as:

```text
Authorization: Bearer <token>
```

Set `JWT_SECRET` to a long random value before production deployment. `JWT_EXPIRES_IN` defaults to `7d`.

## Workspace and Project Access

DevPilot runs as one shared team workspace by default. Configure the workspace identity with:

```text
DEVPILOT_WORKSPACE_ID=my-software-team
DEVPILOT_WORKSPACE_NAME=DevPilot Team Space
```

Projects are not globally visible to every signed-in user. Owners and admins can manage all projects in the workspace. Members and viewers only see projects where their email is included in that project's access list. This matches the intended DevPilot-native model: one team space, many projects, and project-specific teammate lists.

The database records `workspace_id` on projects and uses `schema_migrations` to track additive production-safe changes. DevPilot requires PostgreSQL for development and production so workspace, auth, project, deployment, incident, and health-check data survives restarts.

Start local PostgreSQL and seed the 100 real public projects:

```bash
npm run postgres:up
npm run postgres:seed
DATABASE_URL=postgres://devpilot:devpilot@localhost:5432/devpilot npm run dev:api
```

For Vercel production, add a hosted PostgreSQL connection string:

```bash
vercel env add DATABASE_URL production
```

Then paste your provider connection string, for example `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require`, redeploy, and run the protected seed endpoint.

## Incident Automation

DevPilot automatically opens incidents when:

- A deployment fails
- A deployment rolls back
- A project health check fails
- A monitored URL becomes unavailable

Incidents are associated with the project and, for deployment incidents, the related deployment ID. Incident records include severity, status, service, timestamp, description, and resolution time.

## Health Monitoring

When a project has an app URL, DevPilot records health-check history with:

- Current status
- HTTP status code
- Response time
- Uptime percentage
- Last successful check
- Last failed check
- Historical health trend

Health checks are stored in PostgreSQL.

## Prometheus Metrics

The API gateway exposes `/metrics` from a dedicated `prom-client` registry.

Runtime metrics include:

- Default Node.js metrics
- Memory usage
- CPU usage
- Event loop lag

Custom metrics include:

- `http_requests_total`
- `http_request_duration_seconds`
- `projects_created_total`
- `tasks_created_total`
- `deployments_created_total`
- `incidents_created_total`
- `project_health_checks_total`
- `active_projects_total`
- `project_health_status`
- `project_response_time_ms`
- `project_http_status_code`
- `project_uptime_percent`
- `deployment_status_total`
- `incident_severity_total`

## Grafana Dashboards

Local Grafana provisioning loads dashboards from:

```text
monitoring/grafana/dashboards
```

Included dashboards:

- System Overview
- Project Observability
- Service Health
- Deployment Analytics
- DevPilot Projects Dashboard

Grafana Cloud can be configured with:

- `GRAFANA_CLOUD_PROM_URL`
- `GRAFANA_CLOUD_PROM_USERNAME`
- `GRAFANA_CLOUD_API_TOKEN`
- `VITE_OPEN_GRAFANA_URL`
- `VITE_OPEN_GRAFANA_DASHBOARD_URL`

## WebSocket Notifications

The frontend connects to:

```text
/realtime
```

Live events are broadcast for:

- `project.created`
- `task.created`
- `task.completed`
- `deployment.created`
- `deployment.failed`
- `incident.created`
- `incident.resolved`
- `project.health.failed`
- `comment.created`
- `sprint.created`
- `code_metrics.synced`
- `alert_integration.created`
- `backup.created`

The notification panel in the app shell shows these updates without page refresh.

## Collaboration, Planning, and Integrations

DevPilot now includes product features that turn the roadmap into working app surfaces:

- Project comments with `@email` mentions and a chronological discussion timeline
- Sprint planning with dates, goals, capacity, status, and velocity cards
- GitHub/GitLab code metric records for commits, pull requests, open issues, coverage, deployment frequency, and lead time
- Multi-tenant workspace profile with plan, domain, region, retention, and SSO metadata
- Slack and Discord alert integration records with real webhook test calls when a webhook URL is provided
- Backup and disaster-recovery exports that write a JSON snapshot of project data and product-feature data
- PWA manifest, icon, and service worker for installable browser/mobile usage

Project feature APIs:

```text
GET  /api/product/features?projectId=...
GET  /api/projects/:projectId/comments
POST /api/projects/:projectId/comments
GET  /api/projects/:projectId/sprints
POST /api/projects/:projectId/sprints
PATCH /api/projects/:projectId/sprints/:sprintId
GET  /api/projects/:projectId/code-metrics
POST /api/projects/:projectId/code-metrics
GET  /api/projects/:projectId/alert-integrations
POST /api/projects/:projectId/alert-integrations
POST /api/projects/:projectId/alert-integrations/:integrationId/test
GET  /api/backups
POST /api/backups
PUT  /api/tenant
```

## Premium Reliability Features

DevPilot now includes the higher-value capabilities expected in a paid DevOps platform:

- AI incident assistant that summarizes incidents, identifies likely root causes, and proposes next actions from deployment and health signals
- Postmortem generator with impact, root cause, timeline, wins, and action items
- SLA/SLO management with targets, current health, error budget, and burn rate
- Client reporting for weekly or monthly delivery and reliability summaries
- Public status page records per project
- Release approval workflow for production gates
- On-call schedule and escalation ownership
- Real alert rules for health failures, response time, and failed deployments
- GitHub/GitLab code metric records
- Project audit log for governance events

Premium feature APIs:

```text
POST  /api/projects/:projectId/assistant/incidents/:incidentId
POST  /api/projects/:projectId/postmortems/:incidentId
POST  /api/projects/:projectId/slos
POST  /api/projects/:projectId/client-reports
POST  /api/projects/:projectId/release-approvals
PATCH /api/projects/:projectId/release-approvals/:approvalId
PUT   /api/projects/:projectId/status-page
PUT   /api/projects/:projectId/on-call
POST  /api/projects/:projectId/alert-rules
```

## Activity Feed

The central activity feed records:

- Project creation and updates
- Task creation, updates, and completion
- Deployments
- Incidents
- Health failures
- Comments, sprints, code metrics, alert setup, tenant updates, and backups

Activity can be filtered by:

- Project
- Event type
- Date range

API:

```text
GET /activity
GET /activity?projectId=...&eventType=...&from=YYYY-MM-DD&to=YYYY-MM-DD
```

## Docker Setup

Run the full local stack:

```bash
docker compose up --build
```

Run only monitoring:

```bash
docker compose -f docker-compose.monitoring.yml up
```

Default local URLs:

- Frontend: `http://localhost:5173`
- API Gateway: `http://localhost:3000`
- Metrics: `http://localhost:3000/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

Grafana local login:

- User: `admin`
- Password: `admin`

## Local Development

Install dependencies:

```bash
npm install
npm --prefix apps/api-gateway install
npm --prefix apps/frontend install
```

Run the API:

```bash
npm run dev:api
```

Run the frontend:

```bash
npm run dev
```

Build everything:

```bash
npm run build
```

## Production Readiness

DevPilot is configured as a single frontend plus API Gateway deployment. Before deploying, copy `.env.example` to your runtime environment and set:

- `NODE_ENV=production`
- `PORT`
- `CORS_ORIGINS` with the deployed frontend origin
- `DATABASE_URL` for PostgreSQL storage
- `CRON_SECRET` for scheduled metrics push jobs
- `JWT_SECRET` and `JWT_EXPIRES_IN` for API-backed login sessions
- `GITHUB_TOKEN` or `GITLAB_TOKEN` if private code metrics are integrated later
- `SLACK_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL` for default alert channel setup
- `DEVPILOT_TENANT_NAME`, `DEVPILOT_TENANT_DOMAIN`, and `DEVPILOT_REGION` for tenant defaults
- Grafana Cloud variables if remote-write metrics are enabled

The API Gateway adds production-safe defaults:

- Request IDs through the `x-request-id` response header
- Security headers for browser-facing responses
- Configurable CORS origins
- Configurable JSON body limit
- Rate limiting through `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`
- Structured JSON 404 and 500 responses
- Health payloads with version, environment, uptime, and database mode

The frontend adds:

- Route-level lazy loading for smaller production bundles
- A runtime error boundary instead of a blank screen
- API request timeouts through `VITE_API_TIMEOUT_MS`
- Structured API error parsing for cleaner user-facing failures

Run the production verification command:

```bash
npm run verify
```

## Data Stores

DevPilot supports:

- PostgreSQL for local development, Docker, and production with `DATABASE_URL`

The API fails fast when `DATABASE_URL` is missing. There is no local database fallback.

Schema upgrades are additive and keep existing data intact.

## Verification

Useful checks:

```bash
npm --prefix apps/api-gateway run build
npm --prefix apps/frontend run build
docker compose config
docker compose -f docker-compose.monitoring.yml config
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```
