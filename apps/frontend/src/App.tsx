import { Component, lazy, Suspense, useEffect, useState, type ErrorInfo, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Building2, GitBranch, LogOut, Moon, Plus, Search, SunMedium } from 'lucide-react';
import { AppLayout } from './layout/AppLayout';
import { Button } from './components/ui/button';
import { ToastHost } from './components/ui/toast-context';
import { Login, type AuthUser } from './pages/Login';
import { workspaceApi } from './api/workspace';
import { FeaturePage, LandingPage } from './pages/PublicSite';

const Overview = lazy(() => import('./pages/Overview').then((module) => ({ default: module.Overview })));
const Projects = lazy(() => import('./pages/Projects').then((module) => ({ default: module.Projects })));
const TeamBoard = lazy(() => import('./pages/TeamBoard').then((module) => ({ default: module.TeamBoard })));
const Onboarding = lazy(() => import('./pages/Onboarding').then((module) => ({ default: module.Onboarding })));
const LaunchCenter = lazy(() => import('./pages/LaunchCenter').then((module) => ({ default: module.LaunchCenter })));
const Analytics = lazy(() => import('./pages/Analytics').then((module) => ({ default: module.Analytics })));
const Monitoring = lazy(() => import('./pages/Monitoring').then((module) => ({ default: module.Monitoring })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then((module) => ({ default: module.ProjectDetail })));
const TeamAccess = lazy(() => import('./pages/TeamAccess').then((module) => ({ default: module.TeamAccess })));
const AuditLog = lazy(() => import('./pages/AuditLog').then((module) => ({ default: module.AuditLog })));
const PublicStatus = lazy(() => import('./pages/PublicStatus').then((module) => ({ default: module.PublicStatus })));

class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DevPilot frontend error', { error, errorInfo });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-fallback">
          <h1>DevPilot could not load this view.</h1>
          <p>{this.state.error.message || 'Refresh the page or return to the dashboard.'}</p>
          <Button onClick={() => window.location.assign('/app')}>Return to dashboard</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const RouteFallback = () => (
  <div className="route-fallback">
    <div className="loader-dot" />
    <span>Loading workspace...</span>
  </div>
);

const readStoredUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem('devpilot.user') || 'null') as AuthUser | null;
    return user ? { ...user, role: user.role || 'member' } : null;
  } catch {
    return null;
  }
};

const App = () => {
  const routerBasename = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL;
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem('devpilot.authenticated') === 'true' && Boolean(readStoredUser()) && Boolean(localStorage.getItem('devpilot.token')));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const logout = () => {
    localStorage.removeItem('devpilot.authenticated');
    localStorage.removeItem('devpilot.user');
    localStorage.removeItem('devpilot.token');
    setAuthenticated(false);
    setUser(null);
  };

  const login = (nextUser: AuthUser) => {
    setUser(nextUser);
    setAuthenticated(true);
  };

  const runSearch = async (event?: FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const data = await workspaceApi.search(query);
    setSearchResults(data.results);
    setSearchOpen(true);
  };

  useEffect(() => {
    const expireSession = () => {
      setAuthenticated(false);
      setUser(null);
    };
    window.addEventListener('devpilot:auth-expired', expireSession);
    return () => window.removeEventListener('devpilot:auth-expired', expireSession);
  }, []);

  return (
    <ToastHost>
      <AppErrorBoundary>
        <BrowserRouter basename={routerBasename}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/features/:featureId" element={<FeaturePage />} />
              <Route path="/status/:slug" element={<PublicStatus />} />
              <Route path="/login" element={<Login authenticated={authenticated} onLogin={login} />} />
              <Route
                path="/app"
                element={
                  authenticated ? (
                    <>
                      <div className="shell-header">
                        <div className="shell-header-inner">
                          <div className="enterprise-brand">
                            <span className="brand-mark"><Building2 size={20} /></span>
                            <div>
                              <h1 className="text-lg font-semibold">DevPilot</h1>
                            </div>
                          </div>
                          <form className="global-search" onSubmit={runSearch}>
                            <Search size={16} />
                            <input
                              value={searchQuery}
                              onChange={(event) => setSearchQuery(event.target.value)}
                              onFocus={() => searchResults.length && setSearchOpen(true)}
                              placeholder="Search..."
                              aria-label="Search DevPilot"
                            />
                            {searchOpen ? (
                              <div className="global-search-results">
                                {searchResults.map((result) => <button key={result} type="button" onClick={() => setSearchOpen(false)}>{result}</button>)}
                                {!searchResults.length ? <span>No matching records</span> : null}
                              </div>
                            ) : null}
                          </form>
                          <div className="flex items-center gap-2">
                            <Button onClick={() => window.location.assign('/app/projects#create-project')}>
                              <Plus size={16} />
                              <span className="ml-2">New Project</span>
                            </Button>
                            <Button variant="ghost" onClick={() => window.open('https://github.com', '_blank')}>
                              <GitBranch size={16} />
                              <span className="ml-2">GitHub</span>
                            </Button>
                            <Button variant="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
                              {theme === 'light' ? <Moon size={16} /> : <SunMedium size={16} />}
                              <span className="ml-2">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
                            </Button>
                            <span className="profile-pill">{user?.name?.slice(0, 1).toUpperCase() || 'A'}</span>
                            <Button variant="subtle" onClick={logout}>
                              <LogOut size={16} />
                              <span className="ml-2">Logout</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                      <AppLayout user={user} />
                    </>
                  ) : (
                    <Navigate to="/login" replace />
                  )
                }
              >
                <Route index element={<Overview />} />
                <Route path="launch" element={<LaunchCenter />} />
                <Route path="onboarding" element={<Onboarding />} />
                <Route path="team-board" element={<TeamBoard />} />
                <Route path="projects" element={<Projects />} />
                <Route path="projects/:id" element={<ProjectDetail />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="monitoring" element={<Monitoring />} />
                <Route path="access" element={<TeamAccess />} />
                <Route path="audit" element={<AuditLog />} />
              </Route>
              <Route path="*" element={<Navigate to={authenticated ? '/app' : '/'} replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppErrorBoundary>
    </ToastHost>
  );
};

export default App;
