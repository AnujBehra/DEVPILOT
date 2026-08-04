const isLocalBrowser =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? (isLocalBrowser ? 'http://localhost:3010' : '');
const requestTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000);

export const absoluteApiUrl = (path: string) => {
  const base = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  return new URL(path, base).toString();
};

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export class ApiAuthError extends Error {
  constructor(message = 'Your session expired. Please login again.') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

const clearStoredSession = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('devpilot.authenticated');
  localStorage.removeItem('devpilot.user');
  localStorage.removeItem('devpilot.token');
  window.dispatchEvent(new CustomEvent('devpilot:auth-expired'));
};

const readStoredUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    const user = JSON.parse(localStorage.getItem('devpilot.user') || 'null');
    return user && typeof user.email === 'string' ? user : null;
  } catch {
    return null;
  }
};

const request = async <T>(path: string, options: RequestOptions = {}) => {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const user = readStoredUser();
  if (user?.name) {
    headers.set('x-user', String(user.name));
  }
  if (user?.email) {
    headers.set('x-user-email', String(user.email).trim().toLowerCase());
  }
  if (user?.email) {
    headers.set('x-role', String(user.role || 'member').trim().toLowerCase());
  }
  const token = typeof window !== 'undefined' ? localStorage.getItem('devpilot.token') : '';
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: options.signal ?? controller.signal,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('DevPilot API request timed out. Check the API gateway connection.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => undefined)
      : undefined;
    const message = payload?.message || payload?.error || await response.text().catch(() => '');
    if (response.status === 401) {
      clearStoredSession();
      throw new ApiAuthError(message || 'Your session expired. Please login again.');
    }
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
