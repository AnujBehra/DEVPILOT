import { Link, Navigate, useParams } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, BellRing, Bot, ChartNoAxesCombined, CheckCircle2, Database, GitBranch, Gauge, Globe2, KanbanSquare, Layers3, LockKeyhole, RadioTower, Rocket, ShieldCheck, Sparkles, UsersRound, Webhook, Workflow, Zap, type LucideIcon } from 'lucide-react';
import { Marketing3DScene } from '../components/Marketing3DScene';

type Feature = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  icon: LucideIcon;
  bullets: string[];
  proof: string[];
};

const features: Feature[] = [
  {
    id: 'workspace',
    title: 'Team Workspace',
    eyebrow: 'Collaborate',
    summary: 'One shared space for projects, teams, access, and delivery updates.',
    icon: UsersRound,
    bullets: ['Team hub', 'Project access', 'Owners and members', 'Invites'],
    proof: ['Secure account sessions', 'Project permission checks', 'Per-project member lists'],
  },
  {
    id: 'project-management',
    title: 'Projects',
    eyebrow: 'Plan',
    summary: 'Manage projects, issues, boards, sprints, comments, and delivery status.',
    icon: KanbanSquare,
    bullets: ['Project list and details', 'Issue and task board', 'Sprint planning', 'Comments and mentions'],
    proof: ['React project pages', 'Express project/task APIs', 'PostgreSQL-backed durable project data'],
  },
  {
    id: 'deployment-tracking',
    title: 'Deployments',
    eyebrow: 'Release',
    summary: 'Track releases from manual updates and deployment webhooks.',
    icon: Rocket,
    bullets: ['Webhook support', 'Release timeline', 'Latest deployment', 'Failure detection'],
    proof: ['Webhook receiver', 'Deployment history', 'Prometheus deployment metrics'],
  },
  {
    id: 'incident-response',
    title: 'Incidents',
    eyebrow: 'Respond',
    summary: 'Track incidents from failed releases, rollbacks, and health check failures.',
    icon: ShieldCheck,
    bullets: ['Automatic incident creation', 'Manual incident tracking', 'Incident resolution workflow', 'Postmortem and assistant insights'],
    proof: ['Incident APIs', 'Deployment failure hooks', 'Health check failure hooks'],
  },
  {
    id: 'monitoring',
    title: 'Monitoring',
    eyebrow: 'Observe',
    summary: 'Monitor app URLs with uptime, latency, status code, and health history.',
    icon: Gauge,
    bullets: ['URL health checks', 'Response-time tracking', 'Uptime percentage', 'Health history per project'],
    proof: ['Project health check storage', 'Monitoring dashboard widgets', 'Prometheus health metrics'],
  },
  {
    id: 'observability',
    title: 'Metrics',
    eyebrow: 'Measure',
    summary: 'Expose Prometheus metrics and visualize request, deployment, incident, and health signals.',
    icon: Activity,
    bullets: ['prom-client registry', 'Default Node.js metrics', 'Custom DevPilot metrics', 'Grafana dashboard JSON files'],
    proof: ['/metrics endpoint', 'Grafana provisioning', 'Grafana Cloud remote write support'],
  },
  {
    id: 'github-integration',
    title: 'GitHub',
    eyebrow: 'Code',
    summary: 'Sync repository activity into each project.',
    icon: GitBranch,
    bullets: ['Repository sync', 'Commit and PR metrics', 'Open issue count', 'Lead-time estimate'],
    proof: ['GitHub API integration', 'Project code metrics', 'Live sync button'],
  },
  {
    id: 'realtime',
    title: 'Notifications',
    eyebrow: 'Live',
    summary: 'Send team updates for project, task, deployment, incident, invite, and health events.',
    icon: BellRing,
    bullets: ['WebSocket updates', 'Notification panel', 'Activity timeline', 'Operational event stream'],
    proof: ['Realtime server', 'Frontend listener', 'Activity feed APIs'],
  },
  {
    id: 'security',
    title: 'Access',
    eyebrow: 'Control',
    summary: 'Keep project visibility clear with accounts, roles, invites, and audit history.',
    icon: LockKeyhole,
    bullets: ['Secure login', 'Password hashing', 'Project-level permissions', 'Team-scoped data model'],
    proof: ['Protected API routes', 'Permission checks', 'Invite acceptance workflow'],
  },
  {
    id: 'production-data',
    title: 'PostgreSQL',
    eyebrow: 'Durable data',
    summary: 'Store production data in PostgreSQL with migrations and environment-driven configuration.',
    icon: Database,
    bullets: ['PostgreSQL-only storage', 'Production connection through DATABASE_URL', 'Schema migration tracking', 'Durable data on Vercel'],
    proof: ['DATABASE_URL support', 'schema_migrations table', 'Database status endpoint'],
  },
];

export const featureList = features;

const heroStats = [
  { value: '99.99%', label: 'Uptime tracked' },
  { value: '847K+', label: 'Deployments monitored' },
  { value: '< 5min', label: 'Mean time to detect' },
  { value: '24/7', label: 'Health monitoring' },
];

const featureCards = [
  {
    icon: UsersRound,
    id: 'workspace',
    title: 'Team Workspace',
    desc: 'Shared workspace with owner, admin, member, and viewer access for project-level collaboration.',
    tone: 'brand',
  },
  {
    icon: Rocket,
    id: 'deployment-tracking',
    title: 'Deployment Tracking',
    desc: 'Track deployments from manual entries and webhooks across Vercel, GitHub Actions, Railway, and Render.',
    tone: 'accent',
  },
  {
    icon: Gauge,
    id: 'monitoring',
    title: 'Health Monitoring',
    desc: 'Monitor URLs with uptime, response time, HTTP status codes, and availability history.',
    tone: 'success',
  },
  {
    icon: ShieldCheck,
    id: 'incident-response',
    title: 'Incident Management',
    desc: 'Create incidents from failed deployments, rollbacks, and failed health checks with full history.',
    tone: 'warning',
  },
  {
    icon: AlertTriangle,
    id: 'monitoring',
    title: 'Alert Rules',
    desc: 'Configure alerts for health failures, response thresholds, failed deployments, and open incidents.',
    tone: 'danger',
  },
  {
    icon: Globe2,
    id: 'monitoring',
    title: 'Public Status Pages',
    desc: 'Publish service status, uptime, active incidents, and maintenance updates for external users.',
    tone: 'brand',
  },
  {
    icon: Activity,
    id: 'observability',
    title: 'Prometheus Metrics',
    desc: 'Production metrics for Node.js, HTTP requests, projects, deployments, incidents, and health checks.',
    tone: 'accent',
  },
  {
    icon: KanbanSquare,
    id: 'project-management',
    title: 'Kanban Boards',
    desc: 'Plan work through To Do, In Progress, In Review, and Done with assignees and priorities.',
    tone: 'brand',
  },
  {
    icon: Workflow,
    id: 'realtime',
    title: 'Audit Logs',
    desc: 'Track project updates, invites, SLO changes, alert rules, releases, and operational events.',
    tone: 'ink',
  },
];

const sidebarItems = ['Dashboard', 'Projects', 'Deployments', 'Incidents', 'Monitoring', 'Activity'];

const deployments = [
  { name: 'api-gateway', status: 'success', time: '2m ago', env: 'production' },
  { name: 'web-frontend', status: 'success', time: '8m ago', env: 'production' },
  { name: 'auth-service', status: 'failed', time: '15m ago', env: 'staging' },
  { name: 'payment-svc', status: 'building', time: '22m ago', env: 'production' },
];

const services = [
  { name: 'api-gateway', uptime: '99.98%', response: '142ms', status: 'healthy' },
  { name: 'web-frontend', uptime: '99.95%', response: '89ms', status: 'healthy' },
  { name: 'auth-service', uptime: '99.91%', response: '203ms', status: 'degraded' },
  { name: 'payment-svc', uptime: '100%', response: '67ms', status: 'healthy' },
];

const integrations = [
  { icon: Webhook, title: 'Deployment webhooks', text: 'Receive release events from Vercel, GitHub Actions, Railway, Render, and custom platforms.' },
  { icon: GitBranch, title: 'GitHub signals', text: 'Connect repositories, commits, pull requests, and delivery activity with each project.' },
  { icon: Activity, title: 'Grafana-ready metrics', text: 'Expose Prometheus metrics for external dashboards and in-app observability views.' },
];

const PublicNav = () => (
  <header className="marketing-nav">
    <Link to="/" className="marketing-brand">
      <span><RadioTower size={18} /></span>
      <strong>DevPilot</strong>
    </Link>
    <nav>
      <a href="/#features">Features</a>
      <a href="/#monitoring">Monitoring</a>
      <a href="/#incidents">Incidents</a>
      <a href="/#integrations">Integrations</a>
      <Link to="/login" className="marketing-nav-ghost">Sign in</Link>
      <Link to="/login" className="marketing-nav-cta">Get started</Link>
    </nav>
  </header>
);

export const LandingPage = () => (
  <div className="marketing-page">
    <Marketing3DScene />
    <PublicNav />
    <main>
      <section className="marketing-hero">
        <div className="marketing-hero-bg" />
        <div className="marketing-hero-copy reference-centered">
          <span className="marketing-eyebrow"><span className="pulse-dot" /> Production-ready DevOps platform</span>
          <h1>Ship faster. <span>Sleep better.</span></h1>
          <p>DevPilot unifies your deployments, monitoring, incidents, and team collaboration into one workspace. From commit to production, it keeps delivery visible.</p>
          <div className="hero-actions reference-actions">
            <Link className="marketing-button" to="/login">Start free <ArrowRight size={16} /></Link>
            <a className="marketing-button-secondary" href="#features">Explore features</a>
          </div>
          <div className="launch-proof-strip reference-proof">
            <span><CheckCircle2 size={15} /> No credit card</span>
            <span><CheckCircle2 size={15} /> Free forever</span>
            <span><CheckCircle2 size={15} /> Setup in minutes</span>
          </div>
        </div>
        <div className="marketing-product-shot" aria-label="DevPilot product preview">
          <div className="product-shot-glow" />
          <div className="mock-toolbar"><span /> <span /> <span /></div>
          <div className="mock-browser-url">devpilot.app/dashboard</div>
          <div className="mock-app-shell">
            <aside>
              {sidebarItems.map((item, index) => <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>)}
            </aside>
            <section>
              <div className="mock-kpi-grid">
                {[
                  ['Projects', '12'],
                  ['Deployments', '847'],
                  ['Uptime', '99.9%'],
                  ['Incidents', '2'],
                ].map(([label, value]) => (
                  <div key={label} className="mock-kpi">
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <div className="mock-activity-card">
                <strong>Deployment Activity</strong>
                {deployments.map((deployment) => (
                  <div className="mock-deploy-row" key={deployment.name}>
                    <span className={`status-dot ${deployment.status}`} />
                    <code>{deployment.name}</code>
                    <small>→ {deployment.env}</small>
                    <em>{deployment.time}</em>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="marketing-stat-strip">
        {heroStats.map((stat) => (
          <div key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </section>

      <section className="marketing-section" id="features">
        <div className="marketing-section-head">
          <h2>Everything your team needs</h2>
          <p>From project management to incident response, DevPilot covers the DevOps lifecycle without scattering work across tabs.</p>
        </div>
        <div className="marketing-feature-grid">
          {featureCards.map((feature) => (
            <Link to={`/features/${feature.id}`} className="marketing-feature-card" data-tone={feature.tone} key={feature.title}>
              <span className="feature-icon"><feature.icon size={22} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="marketing-dark-section" id="monitoring">
        <div>
          <span className="dark-eyebrow"><Zap size={15} /> Real-time observability</span>
          <h2>See everything. Miss nothing.</h2>
          <p>DevPilot brings monitoring directly into your workspace, so teams can understand service health without leaving their delivery flow.</p>
          <div className="dark-list">
            <p><Gauge size={18} /> Continuous URL checks with response-time tracking</p>
            <p><BellRing size={18} /> Live updates for deployments, incidents, and health events</p>
            <p><Activity size={18} /> In-app metrics for operational review</p>
          </div>
        </div>
        <div className="service-health-card">
          <div className="service-card-head">
            <strong>Service Health</strong>
            <span><span className="status-dot success" /> All systems operational</span>
          </div>
          {services.map((service) => (
            <div className="service-row" key={service.name}>
              <span className={`status-dot ${service.status === 'healthy' ? 'success' : 'building'}`} />
              <code>{service.name}</code>
              <small>{service.response}</small>
              <em>{service.uptime}</em>
            </div>
          ))}
          <div className="response-bars">
            {[40, 55, 48, 68, 52, 74, 44, 63, 58, 72, 49, 60].map((height, index) => <span style={{ height: `${height}%` }} key={index} />)}
          </div>
        </div>
      </section>

      <section className="marketing-section split-section" id="incidents">
        <div className="marketing-section-head align-left">
          <span className="marketing-eyebrow"><AlertTriangle size={14} /> Incident response</span>
          <h2>Incidents created when reliability changes.</h2>
          <p>Failed deployments, rollbacks, and health check failures can open incidents with the related project and release attached.</p>
        </div>
        <div className="incident-timeline">
          {[
            ['14:02', 'Deployment failed', 'auth-service staging release returned a failure event.'],
            ['14:03', 'Incident opened', 'DevPilot associated the incident with the service owner.'],
            ['14:08', 'Health recovered', 'The service returned HTTP 200 and latency normalized.'],
          ].map(([time, title, text]) => (
            <div key={title}>
              <span>{time}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-section" id="integrations">
        <div className="marketing-section-head">
          <h2>Connect the tools you already use</h2>
          <p>Deployment platforms, GitHub activity, Prometheus metrics, and Grafana dashboards all connect back into project context.</p>
        </div>
        <div className="integration-grid">
          {integrations.map((item) => (
            <div className="integration-card" key={item.title}>
              <item.icon size={22} />
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-final-cta">
        <div>
          <span className="marketing-eyebrow"><Bot size={14} /> Ready to launch</span>
          <h2>Start running delivery and observability from one workspace.</h2>
          <p>Create a project, connect a deployment URL, and let DevPilot track release and reliability signals.</p>
        </div>
        <Link className="marketing-button" to="/login">Open DevPilot <ArrowRight size={16} /></Link>
      </section>
    </main>
  </div>
);

export const FeaturePage = () => {
  const { featureId } = useParams();
  const feature = features.find((item) => item.id === featureId);
  if (!feature) return <Navigate to="/" replace />;
  const related = features.filter((item) => item.id !== feature.id).slice(0, 3);

  return (
    <div className="marketing-page">
      <Marketing3DScene />
      <PublicNav />
      <main>
        <section className="feature-detail-hero">
          <div>
            <span className="marketing-eyebrow">{feature.eyebrow}</span>
            <h1>{feature.title}</h1>
            <p>{feature.summary}</p>
          </div>
          <div className="feature-detail-icon">
            <feature.icon size={48} />
          </div>
        </section>

        <section className="feature-detail-grid">
          <div className="marketing-panel">
            <h2>Included</h2>
            <ul>
              {feature.bullets.map((item) => <li key={item}><CheckCircle2 size={16} /> {item}</li>)}
            </ul>
          </div>
          <div className="marketing-panel">
            <h2>Backed by</h2>
            <ul>
              {feature.proof.map((item) => <li key={item}><ChartNoAxesCombined size={16} /> {item}</li>)}
            </ul>
          </div>
          <div className="marketing-panel">
            <h2>Why it matters</h2>
            <p>Teams get fewer blind spots and a cleaner way to show project health, release status, and ownership.</p>
            <Link className="marketing-button" to="/login">Use this in the app</Link>
          </div>
        </section>

        <section className="marketing-section">
          <div className="marketing-section-head">
            <span className="marketing-eyebrow">Related</span>
            <h2>Explore more.</h2>
          </div>
          <div className="marketing-feature-grid compact">
            {related.map((item) => (
              <Link to={`/features/${item.id}`} className="marketing-feature-card" key={item.id}>
                <item.icon size={20} />
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};
