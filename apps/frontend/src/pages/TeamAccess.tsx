import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, FolderKanban, ShieldCheck, UsersRound } from 'lucide-react';
import { workspaceApi, type Project, type ProjectRole, type WorkspaceTeam } from '../api/workspace';

const roleCopy = [
  { role: 'Owner/Admin', text: 'Manage workspace, projects, and teammates.' },
  { role: 'Project Admin', text: 'Manage assigned projects.' },
  { role: 'Member', text: 'Work on assigned projects.' },
  { role: 'Viewer', text: 'Read assigned projects.' },
];

export const TeamAccess = () => {
  const [team, setTeam] = useState<WorkspaceTeam | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<ProjectRole, 'owner'>>('member');
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => {
    Promise.all([workspaceApi.team(), workspaceApi.projects()])
      .then(([teamData, projectData]) => {
        setTeam(teamData);
        setProjects(projectData.projects);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load access data.'));
  }, []);

  const inviteTeammate = async (event: FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    const result = await workspaceApi.createWorkspaceInvite({ email: inviteEmail.trim(), role: inviteRole });
    setInviteLink(new URL(result.inviteUrl, window.location.origin).toString());
    setTeam((current) => current ? { ...current, invites: [result.invite, ...(current.invites || []).filter((invite) => invite.id !== result.invite.id)] } : current);
    setInviteEmail('');
  };

  const memberProjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach((project) => {
      (project.members || []).forEach((member) => counts.set(member.email, (counts.get(member.email) || 0) + 1));
      if (project.ownerEmail) counts.set(project.ownerEmail, (counts.get(project.ownerEmail) || 0) + 1);
    });
    return counts;
  }, [projects]);

  return (
    <div className="space-y-6">
      <div className="card hero-panel hero-panel-compact">
        <div className="hero-copy">
          <span className="metric-kicker"><ShieldCheck size={14} /> Access control</span>
          <h1>Access</h1>
          <p className="subtle">Team members and project visibility.</p>
          <div className="hero-meta">
            <span className="badge">{team?.members.length || 0} teammates</span>
            <span className="badge">{projects.length} visible projects</span>
          </div>
        </div>
        <Link className="button-secondary inline-flex items-center gap-2" to="/app/projects#create-project">
          <FolderKanban size={16} /> Add project
        </Link>
      </div>

      {error ? <div className="read-only-banner"><strong>Access unavailable</strong><span>{error}</span></div> : null}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {roleCopy.map((item) => (
          <div className="card surface-card" key={item.role}>
            <span className="metric-icon"><Crown size={17} /></span>
            <h3>{item.role}</h3>
            <p className="subtle">{item.text}</p>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="card surface-card">
          <div className="section-header-row">
            <div>
              <span className="metric-kicker"><UsersRound size={14} /> People</span>
              <h3>{team?.workspace.name || 'My Software Team'}</h3>
            </div>
          </div>
          <div className="access-list">
            {(team?.members || []).map((member) => (
              <div className="access-row" key={member.email}>
                <div>
                  <strong>{member.name}</strong>
                  <p className="subtle">{member.email}</p>
                </div>
                <span className="badge">{member.role}</span>
                <span className="subtle">{memberProjectCounts.get(member.email) || 0} assigned projects</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card surface-card">
          <div className="section-header-row">
            <div>
              <span className="metric-kicker"><FolderKanban size={14} /> Projects</span>
              <h3>Access map</h3>
            </div>
          </div>
          <div className="access-list">
            {projects.slice(0, 12).map((project) => (
              <Link className="access-row access-row-link" to={`/app/projects/${project.id}`} key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <p className="subtle">{project.projectKey} · {project.serviceName || 'No service mapped'}</p>
                </div>
                <span className="badge">{project.members?.length || 1} members</span>
              </Link>
            ))}
            {!projects.length ? <p className="subtle">No assigned projects yet.</p> : null}
          </div>
        </div>
      </div>

      <div className="card surface-card space-y-4">
        <div className="section-header-row">
          <div>
            <span className="metric-kicker"><UsersRound size={14} /> Invite</span>
            <h3>Add teammate</h3>
          </div>
        </div>
        <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={inviteTeammate}>
          <input className="editor min-h-0" type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
          <select className="editor min-h-0" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<ProjectRole, 'owner'>)}>
            {['admin', 'member', 'viewer'].map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button className="toggle" type="submit">Send invite</button>
        </form>
        {inviteLink ? <div className="read-only-banner"><strong>Invite link</strong><span>{inviteLink}</span></div> : null}
        <div className="access-list">
          {(team?.invites || []).slice(0, 8).map((invite) => (
            <div className="access-row" key={invite.id}>
              <div>
                <strong>{invite.email}</strong>
                <p className="subtle">Invited by {invite.invitedBy}</p>
              </div>
              <span className="badge">{invite.role}</span>
              <span className="subtle">{invite.status}</span>
            </div>
          ))}
          {!team?.invites?.length ? <p className="subtle">No workspace invites yet.</p> : null}
        </div>
      </div>
    </div>
  );
};
