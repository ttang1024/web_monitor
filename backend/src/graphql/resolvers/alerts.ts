import type { AlertNotification } from '@prisma/client'
import * as alertService from '../../services/alertService.js'
import { createAlertRuleSchema, updateAlertRuleSchema, validate } from '../../lib/validation.js'
import { requireAdmin, requireAuth } from '../guards.js'
import type { GraphQLContext } from '../../types.js'

interface NotificationParent extends AlertNotification {
  rule?: { name: string }
}

export const alertResolvers = {
  AlertNotification: {
    // The rule can be deleted while its notifications are still on screen —
    // cascade removes them, but a sweep in flight can still hand one over.
    ruleName: (parent: NotificationParent) => parent.rule?.name ?? 'Deleted rule',
  },

  Query: {
    alertRules: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return alertService.listAlertRules(auth.tenantId)
    },

    alertNotifications: async (
      _: unknown,
      args: { page?: number; pageSize?: number; unreadOnly?: boolean },
      ctx: GraphQLContext
    ) => {
      const auth = requireAuth(ctx)
      return alertService.listNotifications(auth.tenantId, args)
    },
  },

  Mutation: {
    createAlertRule: async (_: unknown, { input }: { input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      const validated = validate(createAlertRuleSchema, input)
      alertService.assertUsableRule(validated)
      return alertService.createAlertRule(auth.tenantId, validated)
    },

    updateAlertRule: async (_: unknown, { id, input }: { id: string; input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      // The service checks the rule as it will be after the patch.
      return alertService.updateAlertRule(auth.tenantId, id, validate(updateAlertRuleSchema, input))
    },

    deleteAlertRule: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAdmin(ctx)
      return alertService.deleteAlertRule(auth.tenantId, id)
    },

    markAlertNotificationsRead: async (_: unknown, { ids }: { ids?: string[] | null }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return alertService.markNotificationsRead(auth.tenantId, ids)
    },
  },
}
