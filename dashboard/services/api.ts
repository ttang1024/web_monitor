// Thin GraphQL client for the monitoring API. No client library: the dashboard
// issues a couple of dozen operations, all of them plain request/response.

const API_URL = (process.env.API_URL as string | undefined) || 'http://localhost:4000/graphql';

const TOKEN_KEY = 'monitoring.token';
const REFRESH_KEY = 'monitoring.refreshToken';

export class ApiError extends Error {
  code?: string;
  fields?: Record<string, string[]>;

  constructor(message: string, code?: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  },
  save(token: string, refreshToken: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string; errors?: Record<string, string[]> } }[];
}

type Variables = Record<string, unknown> | DateRange | undefined;

async function post<T>(query: string, variables?: Variables, token?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL}. Is the backend running?`, 'NETWORK');
  }

  const body = (await response.json().catch(() => null)) as GraphQLResponse<T> | null;

  if (!body) throw new ApiError(`Unexpected response from the API (HTTP ${response.status})`, 'BAD_RESPONSE');

  if (body.errors?.length) {
    const first = body.errors[0];
    throw new ApiError(first.message, first.extensions?.code, first.extensions?.errors);
  }

  if (!body.data) throw new ApiError('Empty response from the API');
  return body.data;
}

/**
 * Runs an authenticated operation. On an expired access token it rotates the
 * refresh token once and replays the request, so a 24h-old tab keeps working
 * instead of bouncing the user to the login screen.
 */
async function authed<T>(query: string, variables?: Variables): Promise<T> {
  try {
    return await post<T>(query, variables, session.token);
  } catch (error) {
    const refreshToken = session.refreshToken;
    if (!(error instanceof ApiError) || error.code !== 'UNAUTHENTICATED' || !refreshToken) throw error;

    try {
      const refreshed = await post<{ refreshSession: AuthPayload }>(REFRESH_MUTATION, { refreshToken });
      session.save(refreshed.refreshSession.token, refreshed.refreshSession.refreshToken);
    } catch {
      session.clear();
      throw error;
    }

    return post<T>(query, variables, session.token);
  }
}

// --- Types ------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
}

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  plan: string;
  isActive: boolean;
}

export interface AuthPayload {
  token: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  environment: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export type ErrorStatus = 'Unresolved' | 'Resolved' | 'Ignored' | 'Regressed';

export interface ErrorLog {
  id: string;
  type: string;
  message: string;
  stackTrace: string | null;
  source: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  url: string;
  userAgent: string;
  timestamp: number;
  errorHash: string;
  occurrenceCount: number;
  status: ErrorStatus;
  lastSeenAt: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ErrorPage {
  total: number;
  page: number;
  pageSize: number;
  data: ErrorLog[];
}

export interface ErrorStatusCounts {
  unresolved: number;
  resolved: number;
  ignored: number;
  regressed: number;
}

export interface ErrorTrendPoint {
  bucketStart: string;
  count: number;
}

export interface DashboardStats {
  totalErrors: number;
  totalEvents: number;
  avgLoadTime: number;
  errorRate: number;
  errorTrend: { labels: string[]; values: number[] };
  performanceTrend: { labels: string[]; values: number[] };
  topErrors: { errorHash: string; type: string; message: string; count: number; lastSeen: string }[];
  topSlowPages: { url: string; avgLoadTime: number; sampleCount: number }[];
}

export interface PerformancePoint {
  timestamp: string;
  avgLoadTime: number;
  avgTTFB: number;
  avgLCP: number;
  avgFCP: number;
  count: number;
}

export interface WebVitals {
  lcp: number | null;
  fcp: number | null;
  cls: number | null;
  fid: number | null;
  ttfb: number | null;
  sampleCount: number;
}

export interface BreakdownSlice {
  name: string;
  count: number;
}

export interface ApiErrorLog {
  id: string;
  type: string;
  requestUrl: string;
  method: string;
  statusCode: number | null;
  errorMessage: string | null;
  pageUrl: string;
  timestamp: number;
  createdAt: string;
}

export interface BusinessFlowStat {
  flow: string;
  total: number;
  completed: number;
  failed: number;
  timedOut: number;
  abandoned: number;
  avgDurationMs: number;
}

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

// --- Operations -------------------------------------------------------------

const AUTH_FIELDS = `token refreshToken user { id email firstName lastName role tenantId } tenant { id name domain plan isActive }`;

const REFRESH_MUTATION = `mutation Refresh($refreshToken: String!) { refreshSession(refreshToken: $refreshToken) { ${AUTH_FIELDS} } }`;

const ERROR_FIELDS = `id type message stackTrace source lineNumber columnNumber url userAgent timestamp errorHash occurrenceCount status lastSeenAt metadata createdAt`;

export async function login(email: string, password: string): Promise<AuthPayload> {
  const data = await post<{ login: AuthPayload }>(
    `mutation Login($input: LoginInput!) { login(input: $input) { ${AUTH_FIELDS} } }`,
    { input: { email, password } }
  );
  session.save(data.login.token, data.login.refreshToken);
  return data.login;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  domain: string;
}

export async function register(input: RegisterInput): Promise<AuthPayload> {
  const data = await post<{ register: AuthPayload }>(
    `mutation Register($input: RegisterInput!) { register(input: $input) { ${AUTH_FIELDS} } }`,
    { input }
  );
  session.save(data.register.token, data.register.refreshToken);
  return data.register;
}

export async function logout(): Promise<void> {
  const refreshToken = session.refreshToken;
  try {
    await authed(`mutation Logout($refreshToken: String) { logout(refreshToken: $refreshToken) }`, { refreshToken });
  } catch {
    // Logging out locally must succeed even if the API is unreachable.
  }
  session.clear();
}

export async function me(): Promise<{ user: User; tenant: Tenant }> {
  const data = await authed<{ me: User; myTenant: Tenant }>(
    `query Me { me { id email firstName lastName role tenantId } myTenant { id name domain plan isActive } }`
  );
  return { user: data.me, tenant: data.myTenant };
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const data = await authed<{ apiKeys: ApiKey[] }>(
    `query ApiKeys { apiKeys { id name key environment isActive lastUsedAt createdAt } }`
  );
  return data.apiKeys;
}

export async function createApiKey(name: string, environment: string): Promise<ApiKey> {
  const data = await authed<{ createApiKey: ApiKey }>(
    `mutation CreateApiKey($input: CreateApiKeyInput!) { createApiKey(input: $input) { id name key environment isActive lastUsedAt createdAt } }`,
    { input: { name, environment } }
  );
  return data.createApiKey;
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  const data = await authed<{ revokeApiKey: ApiKey }>(
    `mutation RevokeApiKey($id: ID!) { revokeApiKey(id: $id) { id name key environment isActive lastUsedAt createdAt } }`,
    { id }
  );
  return data.revokeApiKey;
}

export async function dashboardStats(range: DateRange = {}): Promise<DashboardStats> {
  const data = await authed<{ dashboardStats: DashboardStats }>(
    `query Stats($startDate: DateTime, $endDate: DateTime) {
      dashboardStats(startDate: $startDate, endDate: $endDate) {
        totalErrors totalEvents avgLoadTime errorRate
        errorTrend { labels values }
        performanceTrend { labels values }
        topErrors { errorHash type message count lastSeen }
        topSlowPages { url avgLoadTime sampleCount }
      }
    }`,
    range
  );
  return data.dashboardStats;
}

export async function listErrors(params: {
  page?: number;
  pageSize?: number;
  status?: ErrorStatus;
  search?: string;
  startDate?: string;
}): Promise<ErrorPage> {
  const data = await authed<{ errors: ErrorPage }>(
    `query Errors($page: Int, $pageSize: Int, $status: ErrorStatus, $search: String, $startDate: DateTime) {
      errors(page: $page, pageSize: $pageSize, status: $status, search: $search, startDate: $startDate) {
        total page pageSize data { ${ERROR_FIELDS} }
      }
    }`,
    params
  );
  return data.errors;
}

export async function errorStatusCounts(): Promise<ErrorStatusCounts> {
  const data = await authed<{ errorStatusCounts: ErrorStatusCounts }>(
    `query Counts { errorStatusCounts { unresolved resolved ignored regressed } }`
  );
  return data.errorStatusCounts;
}

export async function errorTimeSeries(errorHash: string, hours = 24): Promise<ErrorTrendPoint[]> {
  const data = await authed<{ errorTimeSeries: ErrorTrendPoint[] }>(
    `query Trend($errorHash: String!, $hours: Int) { errorTimeSeries(errorHash: $errorHash, hours: $hours) { bucketStart count } }`,
    { errorHash, hours }
  );
  return data.errorTimeSeries;
}

export async function updateErrorStatus(id: string, status: ErrorStatus): Promise<ErrorLog> {
  const data = await authed<{ updateErrorStatus: ErrorLog }>(
    `mutation UpdateStatus($id: ID!, $status: ErrorStatus!) { updateErrorStatus(id: $id, status: $status) { ${ERROR_FIELDS} } }`,
    { id, status }
  );
  return data.updateErrorStatus;
}

export async function performanceTimeSeries(
  range: DateRange = {},
  interval: 'hour' | 'day' = 'hour'
): Promise<PerformancePoint[]> {
  const data = await authed<{ performanceTimeSeries: PerformancePoint[] }>(
    `query Perf($startDate: DateTime, $endDate: DateTime, $interval: String) {
      performanceTimeSeries(startDate: $startDate, endDate: $endDate, interval: $interval) {
        timestamp avgLoadTime avgTTFB avgLCP avgFCP count
      }
    }`,
    { ...range, interval }
  );
  return data.performanceTimeSeries;
}

export async function webVitals(range: DateRange = {}): Promise<WebVitals> {
  const data = await authed<{ webVitals: WebVitals }>(
    `query Vitals($startDate: DateTime, $endDate: DateTime) {
      webVitals(startDate: $startDate, endDate: $endDate) { lcp fcp cls fid ttfb sampleCount }
    }`,
    range
  );
  return data.webVitals;
}

export async function deviceBreakdown(
  dimension: 'browser' | 'os' | 'device',
  range: DateRange = {}
): Promise<BreakdownSlice[]> {
  const data = await authed<{ deviceBreakdown: BreakdownSlice[] }>(
    `query Breakdown($dimension: String, $startDate: DateTime, $endDate: DateTime) {
      deviceBreakdown(dimension: $dimension, startDate: $startDate, endDate: $endDate) { name count }
    }`,
    { dimension, ...range }
  );
  return data.deviceBreakdown;
}

export async function listApiErrors(params: { page?: number; pageSize?: number; startDate?: string } = {}) {
  const data = await authed<{ apiErrors: { total: number; data: ApiErrorLog[] } }>(
    `query ApiErrors($page: Int, $pageSize: Int, $startDate: DateTime) {
      apiErrors(page: $page, pageSize: $pageSize, startDate: $startDate) {
        total data { id type requestUrl method statusCode errorMessage pageUrl timestamp createdAt }
      }
    }`,
    params
  );
  return data.apiErrors;
}

export async function businessFlows(range: DateRange = {}): Promise<BusinessFlowStat[]> {
  const data = await authed<{ businessFlows: BusinessFlowStat[] }>(
    `query Flows($startDate: DateTime, $endDate: DateTime) {
      businessFlows(startDate: $startDate, endDate: $endDate) {
        flow total completed failed timedOut abandoned avgDurationMs
      }
    }`,
    range
  );
  return data.businessFlows;
}
