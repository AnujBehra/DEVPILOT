import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';
import type { Role } from './rbac';

export type AuthUser = {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  role: Exclude<Role, 'system'>;
  createdAt: string;
  updatedAt: string;
};

type StoredUser = AuthUser & {
  passwordHash: string;
  passwordSalt: string;
};

export type JwtPayload = {
  sub: string;
  name: string;
  email: string;
  role: AuthUser['role'];
  workspaceId?: string;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. DevPilot authentication uses PostgreSQL only.');
}

const shouldUseSsl = (connectionString: string) => {
  if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) return true;
  if (/sslmode=disable/i.test(connectionString)) return false;
  return !/localhost|127\.0\.0\.1|postgres:5432/i.test(connectionString);
};

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
});
let authInitialized: Promise<void> | null = null;
const now = () => new Date().toISOString();
const jwtSecret = () => process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET || 'devpilot-local-development-secret-change-me';
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
const defaultWorkspaceId = () => process.env.DEVPILOT_WORKSPACE_ID || 'my-software-team';
const demoAdminEmail = () => process.env.DEVPILOT_DEMO_ADMIN_EMAIL || 'admin@devpilot.local';
const demoAdminPassword = () => process.env.DEVPILOT_DEMO_ADMIN_PASSWORD || 'DevPilot@2026';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const defaultRoleForRegistration = (existingUsers: StoredUser[]): AuthUser['role'] =>
  process.env.DEVPILOT_ALLOW_FIRST_OWNER === 'true' && existingUsers.length === 0 ? 'owner' : 'member';
const publicUser = (user: StoredUser | AuthUser): AuthUser => ({
  id: user.id,
  workspaceId: user.workspaceId || defaultWorkspaceId(),
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const initAuthStore = async () => {
  if (authInitialized) return authInitialized;
  authInitialized = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  })();
  return authInitialized;
};

const storedUserFromRow = (row: any): StoredUser => ({
  id: row.id,
  workspaceId: row.workspace_id || defaultWorkspaceId(),
  name: row.name,
  email: row.email,
  role: row.role,
  passwordHash: row.password_hash,
  passwordSalt: row.password_salt,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const listStoredUsers = async (): Promise<StoredUser[]> => {
  await initAuthStore();
  const result = await pool.query('SELECT * FROM auth_users ORDER BY created_at ASC');
  return result.rows.map(storedUserFromRow);
};

const findStoredUserByEmail = async (email: string): Promise<StoredUser | undefined> => {
  await initAuthStore();
  const result = await pool.query('SELECT * FROM auth_users WHERE email = $1 LIMIT 1', [email]);
  return result.rows[0] ? storedUserFromRow(result.rows[0]) : undefined;
};

const findStoredUserByTokenPayload = async (payload: JwtPayload): Promise<StoredUser | undefined> => {
  await initAuthStore();
  const result = await pool.query('SELECT * FROM auth_users WHERE id = $1 AND email = $2 LIMIT 1', [payload.sub, payload.email]);
  return result.rows[0] ? storedUserFromRow(result.rows[0]) : undefined;
};

const insertStoredUser = async (user: StoredUser) => {
  await initAuthStore();
  await pool.query(
    `INSERT INTO auth_users (id, workspace_id, name, email, role, password_hash, password_salt, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [user.id, user.workspaceId, user.name, user.email, user.role, user.passwordHash, user.passwordSalt, user.createdAt, user.updatedAt],
  );
};

const updateStoredUserRole = async (user: StoredUser, role: StoredUser['role']) => {
  user.role = role;
  user.updatedAt = now();
  await initAuthStore();
  await pool.query('UPDATE auth_users SET role = $1, updated_at = $2 WHERE id = $3', [role, user.updatedAt, user.id]);
  return user;
};

export const listAuthUsers = async () => (await listStoredUsers()).map(publicUser);

const hashPassword = (password: string, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex'),
});

const passwordMatches = (password: string, user: StoredUser) => {
  const { hash } = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
};

const ensureDemoAdminUser = async () => {
  const email = demoAdminEmail();
  const existing = await findStoredUserByEmail(email);
  if (existing) {
    if (existing.role !== 'owner') {
      await updateStoredUserRole(existing, 'owner');
    }
    return existing;
  }

  const { salt, hash } = hashPassword(demoAdminPassword());
  const user: StoredUser = {
    id: 'devpilot-demo-owner',
    workspaceId: defaultWorkspaceId(),
    name: 'DevPilot Admin',
    email,
    role: 'owner',
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now(),
    updatedAt: now(),
  };
  await insertStoredUser(user);
  return user;
};

const signToken = (user: AuthUser) => jwt.sign({
  sub: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  workspaceId: user.workspaceId || defaultWorkspaceId(),
}, jwtSecret(), { expiresIn: jwtExpiresIn });

export const registerUser = async (input: { name: string; email: string; password: string; role?: AuthUser['role'] }) => {
  const name = String(input.name || '').trim();
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  if (!name || !email || password.length < 6) {
    throw new Error('Name, valid email, and password with at least 6 characters are required.');
  }

  const users = await listStoredUsers();
  if (users.some((user) => user.email === email)) {
    throw new Error('An account already exists for this email.');
  }

  const { salt, hash } = hashPassword(password);
  const user: StoredUser = {
    id: uuid(),
    workspaceId: defaultWorkspaceId(),
    name,
    email,
    role: defaultRoleForRegistration(users),
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now(),
    updatedAt: now(),
  };
  await insertStoredUser(user);
  const safeUser = publicUser(user);
  return { user: safeUser, token: signToken(safeUser) };
};

export const loginUser = async (input: { email: string; password: string }) => {
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  if (email === demoAdminEmail()) {
    await ensureDemoAdminUser();
  }
  const user = await findStoredUserByEmail(email);
  if (!user || !passwordMatches(password, user)) {
    throw new Error('Invalid email or password.');
  }
  const safeUser = publicUser(user);
  return { user: safeUser, token: signToken(safeUser) };
};

export const verifyToken = async (token: string) => {
  const payload = jwt.verify(token, jwtSecret()) as JwtPayload;
  const user = await findStoredUserByTokenPayload(payload);
  if (user) return publicUser(user);
  return undefined;
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const header = String(req.header('authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    next();
    return;
  }
  verifyToken(match[1])
    .then((user) => {
      req.authUser = user;
      next();
    })
    .catch(() => {
      req.authUser = undefined;
      next();
    });
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    res.status(401).json({ error: 'Valid JWT login required' });
    return;
  }
  next();
};
