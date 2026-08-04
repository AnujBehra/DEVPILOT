import type { Request, Response, NextFunction } from 'express';

export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer' | 'system';

export const getRole = (req: Request): Role => {
  if (req.authUser?.role) return req.authUser.role;
  const role = (req.header('x-role') || 'viewer').toLowerCase();
  if (role === 'system') return role;
  return 'viewer';
};

export const requireRole = (allowed: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  const role = getRole(req);
  if (!allowed.includes(role)) {
    return res.status(403).json({ message: 'Insufficient role for this action.' });
  }
  return next();
};
