import { FormEvent, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';

export type AuthUser = {
  workspaceId?: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
};

type LoginProps = {
  authenticated: boolean;
  onLogin: (user: AuthUser) => void;
};

export const Login = ({ authenticated, onLogin }: LoginProps) => {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || '';
  const invitedEmail = searchParams.get('email') || '';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (authenticated) {
    return <Navigate to="/app" replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const normalizedEmail = email.trim().toLowerCase();

    try {
      if (mode === 'register') {
        if (!name.trim() || !normalizedEmail || !password) {
          setError('Enter a name, email, and password.');
          return;
        }
        const result = await authApi.register({ name: name.trim(), email: normalizedEmail, password });
        localStorage.setItem('devpilot.authenticated', 'true');
        localStorage.setItem('devpilot.user', JSON.stringify(result.user));
        localStorage.setItem('devpilot.token', result.token);
        if (inviteToken) await authApi.acceptInvite(inviteToken).catch(() => undefined);
        onLogin(result.user);
        return;
      }

      const result = await authApi.login({ email: normalizedEmail, password });
      localStorage.setItem('devpilot.authenticated', 'true');
      localStorage.setItem('devpilot.user', JSON.stringify(result.user));
      localStorage.setItem('devpilot.token', result.token);
      if (inviteToken) await authApi.acceptInvite(inviteToken).catch(() => undefined);
      onLogin(result.user);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDemoWorkspace = async () => {
    setSubmitting(true);
    setError('');
    try {
      const result = await authApi.login({ email: 'admin@devpilot.local', password: 'DevPilot@2026' });
      localStorage.setItem('devpilot.authenticated', 'true');
      localStorage.setItem('devpilot.user', JSON.stringify(result.user));
      localStorage.setItem('devpilot.token', result.token);
      onLogin(result.user);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to open demo workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="w-full max-w-5xl">
        <div className="card hero-panel">
          <div className="hero-copy">
            <span className="badge">DevPilot</span>
            <div>
              <h1>Launch a calmer delivery workspace.</h1>
              <p className="subtle">Plan projects, track releases, monitor health, and keep the team aligned.</p>
            </div>
            <div className="hero-meta">
              <span className="status-badge status-healthy"><span className="status-badge-dot" /> Secure access</span>
              <span className="badge">Team collaboration</span>
              <span className="badge">Fast setup</span>
            </div>
            <div className="value-grid">
              <div>
                <strong>Releases</strong>
                <span>Track provider, branch, SHA, actor, version, and status.</span>
              </div>
              <div>
                <strong>Incidents</strong>
                <span>Create incidents for failed deploys, rollbacks, and health failures.</span>
              </div>
              <div>
                <strong>Monitoring</strong>
                <span>Use Prometheus metrics and dashboard visuals.</span>
              </div>
            </div>
          </div>

          <form className="bg-card rounded-lg border border-border shadow-sm p-6 space-y-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-background p-1">
            <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-card shadow-sm' : 'text-muted'}`} type="button" onClick={() => setMode('login')}>Login</button>
            <button className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-card shadow-sm' : 'text-muted'}`} type="button" onClick={() => setMode('register')}>Register</button>
          </div>

          {mode === 'register' ? (
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={submitting}
              />
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
            />
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            className="w-full px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>

          <button
            className="w-full px-4 py-2 border border-border rounded-lg font-medium hover:bg-background transition"
            type="button"
            disabled={submitting}
            onClick={openDemoWorkspace}
          >
            Open sample workspace
          </button>

          <p className="text-xs text-muted text-center">
            Sample login: admin@devpilot.local / DevPilot@2026
          </p>
          </form>
        </div>
      </div>
    </div>
  );
};
