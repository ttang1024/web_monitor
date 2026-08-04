export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  tenantName: string
  domain: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface PerformanceMetricsInput {
  lcp?: number | null
  fcp?: number | null
  cls?: number | null
  fid?: number | null
  ttfb?: number | null
  dns?: number | null
  tcp?: number | null
  response?: number | null
  dom?: number | null
  load?: number | null
}

export interface DeviceInfoInput {
  type?: string | null
  browser?: string | null
  os?: string | null
  country?: string | null
}

export interface IngestErrorInput {
  type: string
  message: string
  stack?: string | null
  source?: string | null
  lineNo?: number | null
  colNo?: number | null
  url: string
  userAgent: string
  timestamp: number
  metadata?: Record<string, unknown> | null
}

export interface IngestPerformanceInput {
  url: string
  userAgent: string
  timestamp: number
  metrics: PerformanceMetricsInput
  device?: DeviceInfoInput | null
}

export interface IngestApiErrorInput {
  type: string
  requestUrl: string
  method: string
  status?: number | null
  message?: string | null
  url: string
  userAgent: string
  timestamp: number
  requestHeaders?: Record<string, string> | null
  responseHeaders?: Record<string, string> | null
}

export interface IngestCustomEventInput {
  name: string
  url: string
  userAgent: string
  timestamp: number
  data: Record<string, unknown>
  userId?: string | null
  sessionId?: string | null
}

export interface BatchIngestInput {
  errors?: IngestErrorInput[] | null
  performance?: IngestPerformanceInput[] | null
  apiErrors?: IngestApiErrorInput[] | null
  customEvents?: IngestCustomEventInput[] | null
}

export interface SaveLayoutInput {
  name: string
  isDefault: boolean
  configuration: unknown
}

export interface CreateApiKeyInput {
  name: string
  environment?: string
}

export interface GraphQLContext {
  auth?: {
    userId: string
    tenantId: string
    email: string
    role: string
  }
  apiKeyHeader?: string
  /** Caller address, used to key auth rate limiting. */
  ip?: string
  /** Request Origin header, checked against the API key's allowlist. */
  origin?: string
}
