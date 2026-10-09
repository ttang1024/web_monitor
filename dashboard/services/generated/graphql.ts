export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  JSON: { input: Record<string, unknown>; output: Record<string, unknown>; }
};

export type AiAnalysis = {
  recommendations: Array<Scalars['String']['output']>;
  severity: Scalars['String']['output'];
  summary: Scalars['String']['output'];
};

/** The window to analyse; the metrics are read server-side from the tenant's own data. */
export type AiAnalysisInput = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  timeRange: Scalars['String']['input'];
};

export type AlertCondition =
  /** Errors as a percentage of all events in the window exceeded the threshold. */
  | 'ErrorRate'
  /** Total error occurrences in the window exceeded the threshold. */
  | 'ErrorSpike'
  /** An error hash reported for the first time inside the window. */
  | 'NewIssue'
  /** Average page load time over the window exceeded the threshold, in ms. */
  | 'SlowPageLoad';

/** One firing of a rule. Recorded even when webhook delivery fails. */
export type AlertNotification = {
  alertRuleId: Scalars['ID']['output'];
  body: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  deliveredAt: Maybe<Scalars['DateTime']['output']>;
  deliveryError: Maybe<Scalars['String']['output']>;
  /** Set for NewIssue alerts, so the dashboard can link to the issue. */
  errorHash: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  isRead: Scalars['Boolean']['output'];
  observedValue: Scalars['Float']['output'];
  ruleName: Scalars['String']['output'];
  severity: AlertSeverity;
  threshold: Scalars['Float']['output'];
  title: Scalars['String']['output'];
};

export type AlertNotificationPage = {
  data: Array<AlertNotification>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
  unread: Scalars['Int']['output'];
};

export type AlertRule = {
  condition: AlertCondition;
  /** Quiet period after the rule fires, so a persistently true condition alerts once. */
  cooldownMinutes: Scalars['Int']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  isEnabled: Scalars['Boolean']['output'];
  lastTriggeredAt: Maybe<Scalars['DateTime']['output']>;
  name: Scalars['String']['output'];
  severity: AlertSeverity;
  /** Occurrences (ErrorSpike), percent (ErrorRate), or milliseconds (SlowPageLoad). Ignored by NewIssue. */
  threshold: Scalars['Float']['output'];
  updatedAt: Maybe<Scalars['DateTime']['output']>;
  webhookUrl: Maybe<Scalars['String']['output']>;
  windowMinutes: Scalars['Int']['output'];
};

export type AlertRuleInput = {
  condition: AlertCondition;
  cooldownMinutes?: InputMaybe<Scalars['Int']['input']>;
  isEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  severity?: InputMaybe<AlertSeverity>;
  threshold?: InputMaybe<Scalars['Float']['input']>;
  webhookUrl?: InputMaybe<Scalars['String']['input']>;
  windowMinutes?: InputMaybe<Scalars['Int']['input']>;
};

export type AlertSeverity =
  | 'Critical'
  | 'Info'
  | 'Warning';

export type ApiErrorLog = {
  createdAt: Scalars['DateTime']['output'];
  errorMessage: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  method: Scalars['String']['output'];
  pageUrl: Scalars['String']['output'];
  requestUrl: Scalars['String']['output'];
  statusCode: Maybe<Scalars['Int']['output']>;
  timestamp: Scalars['Float']['output'];
  type: Scalars['String']['output'];
  userAgent: Scalars['String']['output'];
};

export type ApiErrorPage = {
  data: Array<ApiErrorLog>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

/**
 * The ingestion credential a page's SDK authenticates with. Returned in full to
 * authenticated members of the owning tenant — there is no other way to install
 * the SDK.
 */
export type ApiKey = {
  /** Origins permitted to ingest with this key. Empty means any origin. */
  allowedOrigins: Array<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  environment: Scalars['String']['output'];
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  key: Scalars['String']['output'];
  lastUsedAt: Maybe<Scalars['DateTime']['output']>;
  name: Scalars['String']['output'];
};

/**
 * A short-lived access token. The refresh token is set as an httpOnly cookie and
 * is never exposed to page script.
 */
export type AuthPayload = {
  tenant: Tenant;
  token: Scalars['String']['output'];
  user: User;
};

export type BreakdownSlice = {
  count: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};

export type BusinessFlowStat = {
  abandoned: Scalars['Int']['output'];
  avgDurationMs: Scalars['Float']['output'];
  completed: Scalars['Int']['output'];
  failed: Scalars['Int']['output'];
  flow: Scalars['String']['output'];
  timedOut: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type CreateApiKeyInput = {
  environment?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateUserInput = {
  email: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  /** Handed to the new member out of band; they change it after signing in. */
  initialPassword: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  role?: InputMaybe<UserRole>;
};

export type CustomEventLog = {
  createdAt: Scalars['DateTime']['output'];
  data: Maybe<Scalars['JSON']['output']>;
  eventName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  sessionId: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['Float']['output'];
  url: Scalars['String']['output'];
  userId: Maybe<Scalars['String']['output']>;
};

export type CustomEventPage = {
  data: Array<CustomEventLog>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

/** Totals for one event name sent with captureCustomEvent(). */
export type CustomEventStat = {
  count: Scalars['Int']['output'];
  lastSeen: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  /** Distinct user ids set with setUser(); events without one are not counted. */
  users: Scalars['Int']['output'];
};

export type CustomMetricPoint = {
  avg: Scalars['Float']['output'];
  count: Scalars['Int']['output'];
  timestamp: Scalars['DateTime']['output'];
};

/** Summary of one numeric metric sent with captureMetric(). */
export type CustomMetricStat = {
  avg: Scalars['Float']['output'];
  count: Scalars['Int']['output'];
  max: Scalars['Float']['output'];
  min: Scalars['Float']['output'];
  name: Scalars['String']['output'];
};

export type DashboardLayout = {
  configuration: Maybe<Scalars['JSON']['output']>;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  isDefault: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  updatedAt: Maybe<Scalars['DateTime']['output']>;
  userId: Scalars['ID']['output'];
};

export type DashboardStats = {
  avgLoadTime: Scalars['Float']['output'];
  errorRate: Scalars['Float']['output'];
  errorTrend: TrendData;
  pageViews: Scalars['Int']['output'];
  performanceTrend: TrendData;
  topErrors: Array<TopError>;
  topSlowPages: Array<PagePerformance>;
  /** Error occurrences in the window (hourly granularity). */
  totalErrors: Scalars['Int']['output'];
  /** Errors + page views + API errors + custom events. */
  totalEvents: Scalars['Int']['output'];
};

export type ErrorLog = {
  columnNumber: Maybe<Scalars['Int']['output']>;
  createdAt: Scalars['DateTime']['output'];
  errorHash: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastSeenAt: Scalars['DateTime']['output'];
  lineNumber: Maybe<Scalars['Int']['output']>;
  message: Scalars['String']['output'];
  metadata: Maybe<Scalars['JSON']['output']>;
  occurrenceCount: Scalars['Int']['output'];
  source: Maybe<Scalars['String']['output']>;
  stackTrace: Maybe<Scalars['String']['output']>;
  status: ErrorStatus;
  timestamp: Scalars['Float']['output'];
  type: Scalars['String']['output'];
  updatedAt: Maybe<Scalars['DateTime']['output']>;
  url: Scalars['String']['output'];
  userAgent: Scalars['String']['output'];
};

export type ErrorPage = {
  data: Array<ErrorLog>;
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  total: Scalars['Int']['output'];
};

export type ErrorStatus =
  | 'Ignored'
  | 'Regressed'
  | 'Resolved'
  | 'Unresolved';

export type ErrorStatusCounts = {
  ignored: Scalars['Int']['output'];
  regressed: Scalars['Int']['output'];
  resolved: Scalars['Int']['output'];
  unresolved: Scalars['Int']['output'];
};

export type ErrorTrendPoint = {
  bucketStart: Scalars['DateTime']['output'];
  count: Scalars['Int']['output'];
};

export type LoginInput = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type Mutation = {
  /** Runs an AI analysis of the caller's own metrics for the window. */
  analyzeDashboardMetrics: AiAnalysis;
  createAlertRule: AlertRule;
  /** Admin only, as are the other key and alert-rule mutations. */
  createApiKey: ApiKey;
  /** Admin only. */
  createUser: User;
  deleteAlertRule: Scalars['Boolean']['output'];
  login: AuthPayload;
  /** Ends this session, or every session of the user with everywhere: true. */
  logout: Scalars['Boolean']['output'];
  /** Marks the given notifications read, or every unread one when ids are omitted. */
  markAlertNotificationsRead: Scalars['Int']['output'];
  /** Exchanges the refresh cookie for a new session; the old token is rotated out. */
  refreshSession: AuthPayload;
  register: AuthPayload;
  revokeApiKey: ApiKey;
  saveDashboardLayout: DashboardLayout;
  /** Restricts which origins may ingest with this key. An empty list means any origin. */
  setApiKeyAllowedOrigins: ApiKey;
  updateAlertRule: AlertRule;
  updateErrorStatus: ErrorLog;
  /** Admin only. Deactivating a user ends their sessions. */
  updateUser: User;
};


export type MutationAnalyzeDashboardMetricsArgs = {
  input: AiAnalysisInput;
};


export type MutationCreateAlertRuleArgs = {
  input: AlertRuleInput;
};


export type MutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type MutationCreateUserArgs = {
  input: CreateUserInput;
};


export type MutationDeleteAlertRuleArgs = {
  id: Scalars['ID']['input'];
};


export type MutationLoginArgs = {
  input: LoginInput;
};


export type MutationLogoutArgs = {
  everywhere?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationMarkAlertNotificationsReadArgs = {
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type MutationRegisterArgs = {
  input: RegisterInput;
};


export type MutationRevokeApiKeyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSaveDashboardLayoutArgs = {
  input: SaveLayoutInput;
};


export type MutationSetApiKeyAllowedOriginsArgs = {
  id: Scalars['ID']['input'];
  origins: Array<Scalars['String']['input']>;
};


export type MutationUpdateAlertRuleArgs = {
  id: Scalars['ID']['input'];
  input: UpdateAlertRuleInput;
};


export type MutationUpdateErrorStatusArgs = {
  id: Scalars['ID']['input'];
  status: ErrorStatus;
};


export type MutationUpdateUserArgs = {
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
};

export type PagePerformance = {
  avgLoadTime: Scalars['Float']['output'];
  sampleCount: Scalars['Int']['output'];
  url: Scalars['String']['output'];
};

export type PerformanceTimeSeriesPoint = {
  avgFCP: Scalars['Float']['output'];
  avgLCP: Scalars['Float']['output'];
  avgLoadTime: Scalars['Float']['output'];
  avgTTFB: Scalars['Float']['output'];
  /** Page views in the bucket. */
  count: Scalars['Int']['output'];
  timestamp: Scalars['DateTime']['output'];
};

export type Query = {
  alertNotifications: AlertNotificationPage;
  alertRules: Array<AlertRule>;
  /** Failed requests only; slow successful requests are in slowRequests. */
  apiErrors: ApiErrorPage;
  apiKeys: Array<ApiKey>;
  /** Completion/failure rates per business flow tracked with startFlow(). */
  businessFlows: Array<BusinessFlowStat>;
  /** Custom events per name, excluding the SDK's own metric and business_flow events. */
  customEventStats: Array<CustomEventStat>;
  /** Recent occurrences, newest first. Without a name, excludes metric and business_flow events. */
  customEvents: CustomEventPage;
  customMetricStats: Array<CustomMetricStat>;
  customMetricTimeSeries: Array<CustomMetricPoint>;
  dashboardLayouts: Array<DashboardLayout>;
  dashboardStats: DashboardStats;
  deviceBreakdown: Array<BreakdownSlice>;
  errorStatusCounts: ErrorStatusCounts;
  /** Hourly occurrence counts for one error group, zero-filled. */
  errorTimeSeries: Array<ErrorTrendPoint>;
  errors: ErrorPage;
  performanceTimeSeries: Array<PerformanceTimeSeriesPoint>;
  slowRequests: Array<SlowRequestStat>;
  users: Array<User>;
  /** P75 of each Web Vital over the window. */
  webVitals: WebVitals;
};


export type QueryAlertNotificationsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  unreadOnly?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryApiErrorsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryBusinessFlowsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryCustomEventStatsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryCustomEventsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryCustomMetricStatsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryCustomMetricTimeSeriesArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  interval?: InputMaybe<Scalars['String']['input']>;
  metric: Scalars['String']['input'];
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryDashboardStatsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryDeviceBreakdownArgs = {
  dimension?: InputMaybe<Scalars['String']['input']>;
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryErrorTimeSeriesArgs = {
  errorHash: Scalars['String']['input'];
  hours?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryErrorsArgs = {
  page?: InputMaybe<Scalars['Int']['input']>;
  pageSize?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  status?: InputMaybe<ErrorStatus>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPerformanceTimeSeriesArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  interval?: InputMaybe<Scalars['String']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySlowRequestsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};


export type QueryWebVitalsArgs = {
  endDate?: InputMaybe<Scalars['DateTime']['input']>;
  startDate?: InputMaybe<Scalars['DateTime']['input']>;
};

export type RegisterInput = {
  domain: Scalars['String']['input'];
  email: Scalars['String']['input'];
  firstName: Scalars['String']['input'];
  lastName: Scalars['String']['input'];
  password: Scalars['String']['input'];
  tenantName: Scalars['String']['input'];
};

export type SaveLayoutInput = {
  configuration?: InputMaybe<Scalars['JSON']['input']>;
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
};

/** An endpoint whose successful responses the SDK reported as slow. */
export type SlowRequestStat = {
  avgDurationMs: Scalars['Float']['output'];
  count: Scalars['Int']['output'];
  maxDurationMs: Scalars['Float']['output'];
  method: Scalars['String']['output'];
  /** The request URL without its query string. */
  url: Scalars['String']['output'];
};

export type Tenant = {
  domain: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  maxUsers: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  plan: Scalars['String']['output'];
};

export type TopError = {
  count: Scalars['Int']['output'];
  errorHash: Scalars['String']['output'];
  lastSeen: Scalars['DateTime']['output'];
  message: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type TrendData = {
  labels: Array<Scalars['String']['output']>;
  values: Array<Scalars['Float']['output']>;
};

export type UpdateAlertRuleInput = {
  condition?: InputMaybe<AlertCondition>;
  cooldownMinutes?: InputMaybe<Scalars['Int']['input']>;
  isEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  severity?: InputMaybe<AlertSeverity>;
  threshold?: InputMaybe<Scalars['Float']['input']>;
  webhookUrl?: InputMaybe<Scalars['String']['input']>;
  windowMinutes?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateUserInput = {
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  role?: InputMaybe<UserRole>;
};

export type User = {
  email: Scalars['String']['output'];
  firstName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  lastLoginAt: Maybe<Scalars['DateTime']['output']>;
  lastName: Scalars['String']['output'];
  role: UserRole;
  tenantId: Scalars['ID']['output'];
};

export type UserRole =
  /** Manages API keys, alert rules and team membership. */
  | 'Admin'
  | 'User';

export type WebVitals = {
  cls: Maybe<Scalars['Float']['output']>;
  fcp: Maybe<Scalars['Float']['output']>;
  /** Interaction to Next Paint, in ms. */
  inp: Maybe<Scalars['Float']['output']>;
  lcp: Maybe<Scalars['Float']['output']>;
  sampleCount: Scalars['Int']['output'];
  ttfb: Maybe<Scalars['Float']['output']>;
};
