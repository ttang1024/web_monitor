import { DateTimeResolver, JSONResolver } from 'graphql-scalars'
import { authResolvers } from './auth.js'
import { dashboardResolvers } from './dashboard.js'
import { sdkResolvers } from './sdk.js'

export const resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONResolver,
  ErrorLog: {
    ...dashboardResolvers.ErrorLog,
  },
  Query: {
    ...authResolvers.Query,
    ...dashboardResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...dashboardResolvers.Mutation,
    ...sdkResolvers.Mutation,
  },
}
