import { DateTimeResolver, JSONResolver } from 'graphql-scalars'
import { apiKeyResolvers } from './apiKey.js'
import { authResolvers } from './auth.js'
import { dashboardResolvers } from './dashboard.js'
import { sdkResolvers } from './sdk.js'

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
  Query: {
    ...authResolvers.Query,
    ...apiKeyResolvers.Query,
    ...dashboardResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...apiKeyResolvers.Mutation,
    ...dashboardResolvers.Mutation,
    ...sdkResolvers.Mutation,
  },
}
