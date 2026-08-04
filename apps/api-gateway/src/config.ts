type CorsOrigin = boolean | string | RegExp | Array<string | RegExp>;

const parseNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseList = (value: string | undefined) =>
    String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const defaultLocalOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
];

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const configuredOrigins = parseList(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN);
const corsOrigin: CorsOrigin = configuredOrigins.length > 0 ? configuredOrigins : (isProduction ? false : defaultLocalOrigins);

export const apiConfig = {
    nodeEnv,
    isProduction,
    port: parseNumber(process.env.PORT, 3010),
    trustProxy: parseNumber(process.env.TRUST_PROXY_HOPS, 1),
    corsOrigin,
    jsonLimit: process.env.JSON_BODY_LIMIT || '1mb',
    rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: parseNumber(process.env.RATE_LIMIT_MAX, isProduction ? 120 : 2000),
    projectHealthCheckIntervalMs: parseNumber(process.env.PROJECT_HEALTH_CHECK_INTERVAL_MS, 30_000),
    checkProjectsOnMetrics: process.env.CHECK_PROJECTS_ON_METRICS !== 'false',
    serviceName: 'devpilot-api-gateway',
    version: process.env.npm_package_version || '1.0.0',
};

export const startupWarnings = () => {
    const warnings: string[] = [];
    if (apiConfig.isProduction && configuredOrigins.length === 0) {
        warnings.push('CORS_ORIGINS is not configured. Browser API calls will be blocked in production until an origin is set.');
    }
    if (apiConfig.isProduction && !process.env.CRON_SECRET) {
        warnings.push('CRON_SECRET is not configured. Scheduled metrics push endpoint will reject requests.');
    }
    if (apiConfig.isProduction && !process.env.JWT_SECRET && !process.env.AUTH_JWT_SECRET) {
        warnings.push('JWT_SECRET is not configured. Set a long random secret before accepting production logins.');
    }
    if (!process.env.DATABASE_URL) {
        warnings.push('DATABASE_URL is not configured. DevPilot requires PostgreSQL and will not start without it.');
    }
    return warnings;
};
