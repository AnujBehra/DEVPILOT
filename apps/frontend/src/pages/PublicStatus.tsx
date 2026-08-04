import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, CheckCircle2, ExternalLink, ShieldAlert } from 'lucide-react';
import { absoluteApiUrl } from '../api/client';
import type { Incident, ProjectHealthCheck, StatusPage } from '../api/workspace';

type PublicStatusPayload = {
  statusPage: StatusPage;
  project: null | {
    id: string;
    name: string;
    serviceName: string;
    appUrl: string;
  };
  uptime: number | null;
  currentHealth: ProjectHealthCheck | null;
  incidents: Incident[];
  updatedAt: string;
};

const statusClass = (status: StatusPage['status']) => {
  if (status === 'Operational') return 'priority-low';
  if (status === 'Maintenance') return 'priority-medium';
  if (status === 'Degraded') return 'priority-high';
  return 'priority-critical';
};

export const PublicStatus = () => {
  const { slug = '' } = useParams();
  const [payload, setPayload] = useState<PublicStatusPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(absoluteApiUrl(`/api/status/${slug}`))
      .then(async (response) => {
        if (!response.ok) throw new Error('Status page not found.');
        return response.json() as Promise<PublicStatusPayload>;
      })
      .then((data) => {
        setPayload(data);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load status page.'));
  }, [slug]);

  if (error) {
    return (
      <main className="public-shell">
        <section className="public-hero">
          <h1>Status page unavailable</h1>
          <p>{error}</p>
          <Link className="button-secondary" to="/">Back to DevPilot</Link>
        </section>
      </main>
    );
  }

  if (!payload) {
    return <div className="route-fallback"><div className="loader-dot" /><span>Loading status...</span></div>;
  }

  const page = payload.statusPage;
  const openIncidents = payload.incidents.filter((incident) => incident.status !== 'Resolved');

  return (
    <main className="public-shell">
      <section className="public-hero">
        <span className={`priority-pill ${statusClass(page.status)}`}>{page.status}</span>
        <h1>{page.headline}</h1>
        <p>{page.message}</p>
        <div className="hero-actions">
          {payload.project?.appUrl ? <a className="button-secondary" href={payload.project.appUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open service</a> : null}
          <Link className="button-secondary" to="/">DevPilot</Link>
        </div>
      </section>

      <section className="public-section public-grid">
        <div className="card surface-card">
          <span className="metric-icon"><CheckCircle2 size={17} /></span>
          <h3>Uptime</h3>
          <strong className="metric-value">{payload.uptime === null ? 'No checks' : `${payload.uptime}%`}</strong>
          <p className="subtle">Recent health probes</p>
        </div>
        <div className="card surface-card">
          <span className="metric-icon"><Activity size={17} /></span>
          <h3>Current health</h3>
          <strong className="metric-value">{payload.currentHealth?.status || 'unknown'}</strong>
          <p className="subtle">{payload.currentHealth ? `HTTP ${payload.currentHealth.statusCode || 'n/a'} · ${payload.currentHealth.responseTimeMs}ms` : 'No recent check'}</p>
        </div>
        <div className="card surface-card">
          <span className="metric-icon"><ShieldAlert size={17} /></span>
          <h3>Open incidents</h3>
          <strong className="metric-value">{openIncidents.length}</strong>
          <p className="subtle">Customer-visible reliability events</p>
        </div>
      </section>

      <section className="public-section card surface-card">
        <div className="topbar">
          <div>
            <h2>Incident history</h2>
            <p className="subtle">Latest events for {payload.project?.name || 'this service'}.</p>
          </div>
        </div>
        <div className="timeline">
          {payload.incidents.map((incident) => (
            <div className="timeline-item" key={incident.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{incident.title}</strong>
                <p className="subtle">{incident.severity} · {incident.status} · {new Date(incident.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
          {!payload.incidents.length ? <p className="subtle">No incidents reported.</p> : null}
        </div>
      </section>
    </main>
  );
};
