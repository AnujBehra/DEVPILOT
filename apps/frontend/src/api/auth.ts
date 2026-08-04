import { apiClient } from './client';
import type { AuthUser } from '../pages/Login';

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export const authApi = {
  register: (payload: { name: string; email: string; password: string }) =>
    apiClient.post<AuthResponse>('/api/auth/register', payload),
  login: (payload: { email: string; password: string }) =>
    apiClient.post<AuthResponse>('/api/auth/login', payload),
  me: () => apiClient.get<{ user: AuthUser }>('/api/auth/me'),
  acceptInvite: (token: string) => apiClient.post<{ invite: unknown }>(`/api/invites/${token}/accept`, {}),
};
