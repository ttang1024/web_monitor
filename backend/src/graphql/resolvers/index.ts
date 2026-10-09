import { DateTimeResolver, JSONResolver } from 'graphql-scalars'
import { aiAnalysisResolvers } from './aiAnalysis.js'
import { alertResolvers } from './alerts.js'
import { apiKeyResolvers } from './apiKey.js'
import { authResolvers } from './auth.js'
import { dashboardResolvers } from './dashboard.js'

export const resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONResolver,
  ErrorLog: {
    ...dashboardResolvers.ErrorLog,
  },
  ApiErrorLog: {
    ...dashboardResolvers.ApiErrorLog,
  },
  CustomEventLog: {
    ...dashboardResolvers.CustomEventLog,
  },
  AlertNotification: {
    ...alertResolvers.AlertNotification,
  },
  Query: {
    ...authResolvers.Query,
    ...apiKeyResolvers.Query,
    ...dashboardResolvers.Query,
    ...alertResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...apiKeyResolvers.Mutation,
    ...dashboardResolvers.Mutation,
    ...alertResolvers.Mutation,
    ...aiAnalysisResolvers.Mutation,
  },
}
