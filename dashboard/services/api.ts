// Thin GraphQL client for the monitoring API. No client library: the dashboard
// issues a couple of dozen operations, all of them plain request/response.

import type * as Schema from './generated/graphql';

const API_URL = (process.env.API_URL as string | undefined) || 'http://localhost:4000/graphql';

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

/**
 * The access token lives only in memory: page script — and so any injected
 * script — never sees a long-lived credential. The refresh token is an httpOnly
 * cookie the API sets; after a reload the session is restored from it.
 */
let accessToken: string | null = null;
let onExpired: (() => void) | null = null;

export const session = {
  get token() {
    return accessToken;
  },
  set(token: string | null) {
    accessToken = token;
  },
  /** Called when the session is gone for good, so the app can return to the login screen. */
  onExpired(handler: (() => void) | null) {
    onExpired = handler;
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
      // The refresh cookie is scoped to the API's /graphql path.
      credentials: 'include',
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

const AUTH_FIELDS = `token user { id email firstName lastName role tenantId isActive lastLoginAt } tenant { id name domain plan isActive maxUsers }`;
const REFRESH_MUTATION = `mutation Refresh { refreshSession { ${AUTH_FIELDS} } }`;

let refreshInFlight: Promise<AuthPayload> | null = null;

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * Every refresh rotates the cookie, so two refreshes racing with the same
 * cookie would make the server see a reused token. Within a tab, concurrent
 * callers share one request; across tabs, the Web Locks API serialises them so
 * each tab presents the cookie the previous one was given.
 */
function refreshSession(): Promise<AuthPayload> {
  if (!refreshInFlight) {
    const run = async () => {
      const data = await post<{ refreshSession: AuthPayload }>(REFRESH_MUTATION);
      accessToken = data.refreshSession.token;
      return data.refreshSession;
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    refreshInFlight = (locks ? locks.request('monitoring-session-refresh', run) : run()).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Restores the session after a page load. Null when there is none to restore. */
export async function restoreSession(): Promise<AuthPayload | null> {
  try {
    return await refreshSession();
  } catch {
    accessToken = null;
    return null;
  }
}

/**
 * Runs an authenticated operation. Without a token, or on an expired one, it
 * refreshes once and replays; if that fails too, the session is over.
 */
async function authed<T>(query: string, variables?: Variables): Promise<T> {
  const expire = (error: unknown): never => {
    accessToken = null;
    onExpired?.();
    throw error;
  };

  if (!accessToken) await refreshSession().catch(expire);

  try {
    return await post<T>(query, variables, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'UNAUTHENTICATED') throw error;
    await refreshSession().catch(() => expire(error));
    return post<T>(query, variables, accessToken);
  }
}

// --- Types ------------------------------------------------------------------
// Generated from the backend schema (npm run codegen). Where the dashboard
// asks for fewer fields than the type has, the type is narrowed to match.

export type User = Schema.User;
export type UserRole = Schema.UserRole;
export type Tenant = Schema.Tenant;
export type AuthPayload = Schema.AuthPayload;
export type ApiKey = Omit<Schema.ApiKey, 'expiresAt'>;
export type AlertCondition = Schema.AlertCondition;
export type AlertSeverity = Schema.AlertSeverity;
export type AlertRule = Omit<Schema.AlertRule, 'updatedAt'>;
export type AlertNotification = Schema.AlertNotification;
export type AlertNotificationPage = Schema.AlertNotificationPage;
export type AlertRuleInput = Schema.AlertRuleInput;
export type ErrorStatus = Schema.ErrorStatus;
export type ErrorLog = Omit<Schema.ErrorLog, 'updatedAt'>;
export type ErrorPage = Omit<Schema.ErrorPage, 'data'> & { data: ErrorLog[] };
export type ErrorStatusCounts = Schema.ErrorStatusCounts;
export type ErrorTrendPoint = Schema.ErrorTrendPoint;
export type DashboardStats = Schema.DashboardStats;
export type PerformancePoint = Schema.PerformanceTimeSeriesPoint;
export type WebVitals = Schema.WebVitals;
export type BreakdownSlice = Schema.BreakdownSlice;
export type ApiErrorLog = Omit<Schema.ApiErrorLog, 'userAgent'>;
export type AIAnalysisResult = Omit<Schema.AiAnalysis, 'severity'> & {
  severity: 'low' | 'medium' | 'high' | 'critical';
};
export type BusinessFlowStat = Schema.BusinessFlowStat;
export type SlowRequestStat = Schema.SlowRequestStat;
export type CustomEventStat = Schema.CustomEventStat;
export type CustomMetricStat = Schema.CustomMetricStat;
export type CustomMetricPoint = Schema.CustomMetricPoint;
export type CustomEventLog = Omit<Schema.CustomEventLog, 'sessionId'>;
export type DashboardLayout = Schema.DashboardLayout;
export type CreateUserInput = Schema.CreateUserInput;
export type RegisterInput = Schema.RegisterInput;

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

// --- Operations -------------------------------------------------------------

const USER_FIELDS = `id email firstName lastName role tenantId isActive lastLoginAt`;

const ERROR_FIELDS = `id type message stackTrace source lineNumber columnNumber url userAgent timestamp errorHash occurrenceCount status lastSeenAt metadata createdAt`;

const API_KEY_FIELDS = `id name key environment isActive lastUsedAt allowedOrigins createdAt`;

export async function login(email: string, password: string): Promise<AuthPayload> {
  const data = await post<{ login: AuthPayload }>(
    `mutation Login($input: LoginInput!) { login(input: $input) { ${AUTH_FIELDS} } }`,
    { input: { email, password } }
  );
  accessToken = data.login.token;
  return data.login;
}

export async function register(input: RegisterInput): Promise<AuthPayload> {
  const data = await post<{ register: AuthPayload }>(
    `mutation Register($input: RegisterInput!) { register(input: $input) { ${AUTH_FIELDS} } }`,
    { input }
  );
  accessToken = data.register.token;
  return data.register;
}

export async function logout(): Promise<void> {
  try {
    // Sent with whatever token is at hand: the cookie identifies the session.
    await post(`mutation Logout { logout }`, undefined, accessToken);
  } catch {
    // Logging out locally must succeed even if the API is unreachable.
  }
  accessToken = null;
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const data = await authed<{ apiKeys: ApiKey[] }>(
    `query ApiKeys { apiKeys { ${API_KEY_FIELDS} } }`
  );
  return data.apiKeys;
}

export async function createApiKey(name: string, environment: string): Promise<ApiKey> {
  const data = await authed<{ createApiKey: ApiKey }>(
    `mutation CreateApiKey($input: CreateApiKeyInput!) { createApiKey(input: $input) { ${API_KEY_FIELDS} } }`,
    { input: { name, environment } }
  );
  return data.createApiKey;
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  const data = await authed<{ revokeApiKey: ApiKey }>(
    `mutation RevokeApiKey($id: ID!) { revokeApiKey(id: $id) { ${API_KEY_FIELDS} } }`,
    { id }
  );
  return data.revokeApiKey;
}

export async function setApiKeyAllowedOrigins(id: string, origins: string[]): Promise<ApiKey> {
  const data = await authed<{ setApiKeyAllowedOrigins: ApiKey }>(
    `mutation SetOrigins($id: ID!, $origins: [String!]!) {
      setApiKeyAllowedOrigins(id: $id, origins: $origins) { ${API_KEY_FIELDS} }
    }`,
    { id, origins }
  );
  return data.setApiKeyAllowedOrigins;
}

// --- Alerts -----------------------------------------------------------------

const ALERT_RULE_FIELDS = `id name condition threshold windowMinutes severity isEnabled cooldownMinutes lastTriggeredAt webhookUrl createdAt`;

const ALERT_NOTIFICATION_FIELDS = `id alertRuleId ruleName title body severity observedValue threshold errorHash isRead deliveredAt deliveryError createdAt`;

export async function listAlertRules(): Promise<AlertRule[]> {
  const data = await authed<{ alertRules: AlertRule[] }>(
    `query AlertRules { alertRules { ${ALERT_RULE_FIELDS} } }`
  );
  return data.alertRules;
}

export async function createAlertRule(input: AlertRuleInput): Promise<AlertRule> {
  const data = await authed<{ createAlertRule: AlertRule }>(
    `mutation CreateAlertRule($input: AlertRuleInput!) { createAlertRule(input: $input) { ${ALERT_RULE_FIELDS} } }`,
    { input }
  );
  return data.createAlertRule;
}

export async function updateAlertRule(id: string, input: Partial<AlertRuleInput>): Promise<AlertRule> {
  const data = await authed<{ updateAlertRule: AlertRule }>(
    `mutation UpdateAlertRule($id: ID!, $input: UpdateAlertRuleInput!) {
      updateAlertRule(id: $id, input: $input) { ${ALERT_RULE_FIELDS} }
    }`,
    { id, input }
  );
  return data.updateAlertRule;
}

export async function deleteAlertRule(id: string): Promise<boolean> {
  const data = await authed<{ deleteAlertRule: boolean }>(
    `mutation DeleteAlertRule($id: ID!) { deleteAlertRule(id: $id) }`,
    { id }
  );
  return data.deleteAlertRule;
}

export async function listAlertNotifications(
  params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}
): Promise<AlertNotificationPage> {
  const data = await authed<{ alertNotifications: AlertNotificationPage }>(
    `query AlertNotifications($page: Int, $pageSize: Int, $unreadOnly: Boolean) {
      alertNotifications(page: $page, pageSize: $pageSize, unreadOnly: $unreadOnly) {
        total page pageSize unread data { ${ALERT_NOTIFICATION_FIELDS} }
      }
    }`,
    params
  );
  return data.alertNotifications;
}

export async function markAlertNotificationsRead(ids?: string[]): Promise<number> {
  const data = await authed<{ markAlertNotificationsRead: number }>(
    `mutation MarkRead($ids: [ID!]) { markAlertNotificationsRead(ids: $ids) }`,
    { ids }
  );
  return data.markAlertNotificationsRead;
}

export async function dashboardStats(range: DateRange = {}): Promise<DashboardStats> {
  const data = await authed<{ dashboardStats: DashboardStats }>(
    `query Stats($startDate: DateTime, $endDate: DateTime) {
      dashboardStats(startDate: $startDate, endDate: $endDate) {
        totalErrors totalEvents pageViews avgLoadTime errorRate
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
      webVitals(startDate: $startDate, endDate: $endDate) { lcp fcp cls inp ttfb sampleCount }
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

// --- AI analysis --------------------------------------------------------------

/** The server reads the metrics itself; only the window is sent. */
export async function analyzeDashboard(input: {
  timeRange: string;
  startDate?: string;
  endDate?: string;
}): Promise<AIAnalysisResult> {
  const data = await authed<{ analyzeDashboardMetrics: AIAnalysisResult }>(
    `mutation AnalyzeDashboardMetrics($input: AIAnalysisInput!) {
      analyzeDashboardMetrics(input: $input) { summary recommendations severity }
    }`,
    { input }
  );
  return data.analyzeDashboardMetrics;
}

export async function slowRequests(range: DateRange = {}): Promise<SlowRequestStat[]> {
  const data = await authed<{ slowRequests: SlowRequestStat[] }>(
    `query SlowRequests($startDate: DateTime, $endDate: DateTime) {
      slowRequests(startDate: $startDate, endDate: $endDate) { method url count avgDurationMs maxDurationMs }
    }`,
    range
  );
  return data.slowRequests;
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

// --- Custom events and metrics ------------------------------------------------

export async function customEventStats(range: DateRange = {}): Promise<CustomEventStat[]> {
  const data = await authed<{ customEventStats: CustomEventStat[] }>(
    `query EventStats($startDate: DateTime, $endDate: DateTime) {
      customEventStats(startDate: $startDate, endDate: $endDate) { name count users lastSeen }
    }`,
    range
  );
  return data.customEventStats;
}

export async function customMetricStats(range: DateRange = {}): Promise<CustomMetricStat[]> {
  const data = await authed<{ customMetricStats: CustomMetricStat[] }>(
    `query MetricStats($startDate: DateTime, $endDate: DateTime) {
      customMetricStats(startDate: $startDate, endDate: $endDate) { name count avg min max }
    }`,
    range
  );
  return data.customMetricStats;
}

export async function customMetricTimeSeries(
  metric: string,
  range: DateRange = {},
  interval: 'hour' | 'day' = 'hour'
): Promise<CustomMetricPoint[]> {
  const data = await authed<{ customMetricTimeSeries: CustomMetricPoint[] }>(
    `query MetricSeries($metric: String!, $startDate: DateTime, $endDate: DateTime, $interval: String) {
      customMetricTimeSeries(metric: $metric, startDate: $startDate, endDate: $endDate, interval: $interval) {
        timestamp avg count
      }
    }`,
    { metric, ...range, interval }
  );
  return data.customMetricTimeSeries;
}

export async function listCustomEvents(params: { name?: string; page?: number; pageSize?: number } & DateRange = {}) {
  const data = await authed<{ customEvents: { total: number; data: CustomEventLog[] } }>(
    `query CustomEvents($name: String, $page: Int, $pageSize: Int, $startDate: DateTime, $endDate: DateTime) {
      customEvents(name: $name, page: $page, pageSize: $pageSize, startDate: $startDate, endDate: $endDate) {
        total data { id eventName url timestamp data userId createdAt }
      }
    }`,
    params
  );
  return data.customEvents;
}

// --- Layouts ----------------------------------------------------------------

export async function listLayouts(): Promise<DashboardLayout[]> {
  const data = await authed<{ dashboardLayouts: DashboardLayout[] }>(
    `query Layouts { dashboardLayouts { id userId name isDefault configuration createdAt updatedAt } }`
  );
  return data.dashboardLayouts;
}

export async function saveLayout(name: string, configuration: Record<string, unknown>, isDefault = true): Promise<void> {
  await authed(
    `mutation SaveLayout($input: SaveLayoutInput!) { saveDashboardLayout(input: $input) { id } }`,
    { input: { name, configuration, isDefault } }
  );
}

// --- Team -------------------------------------------------------------------

export async function listUsers(): Promise<User[]> {
  const data = await authed<{ users: User[] }>(`query Users { users { ${USER_FIELDS} } }`);
  return data.users;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const data = await authed<{ createUser: User }>(
    `mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { ${USER_FIELDS} } }`,
    { input }
  );
  return data.createUser;
}

export async function updateUser(id: string, input: { role?: UserRole; isActive?: boolean }): Promise<User> {
  const data = await authed<{ updateUser: User }>(
    `mutation UpdateUser($id: ID!, $input: UpdateUserInput!) { updateUser(id: $id, input: $input) { ${USER_FIELDS} } }`,
    { id, input }
  );
  return data.updateUser;
}
