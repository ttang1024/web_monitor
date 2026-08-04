import type { AlertNotification } from '@prisma/client'
import * as alertService from '../../services/alertService.js'
import { createAlertRuleSchema, updateAlertRuleSchema, validate } from '../../lib/validation.js'
import { requireAuth } from '../guards.js'
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
      const auth = requireAuth(ctx)
      const validated = validate(createAlertRuleSchema, input)
      alertService.assertUsableRule(validated)
      return alertService.createAlertRule(auth.tenantId, validated)
    },

    updateAlertRule: async (_: unknown, { id, input }: { id: string; input: unknown }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      const validated = validate(updateAlertRuleSchema, input)

      // Only checkable when both halves are present: a patch that changes just
      // the threshold has to be judged against the rule's existing condition.
      if (validated.condition !== undefined && validated.threshold !== undefined) {
        alertService.assertUsableRule({ condition: validated.condition, threshold: validated.threshold })
      }

      return alertService.updateAlertRule(auth.tenantId, id, validated)
    },

    deleteAlertRule: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return alertService.deleteAlertRule(auth.tenantId, id)
    },

    markAlertNotificationsRead: async (_: unknown, { ids }: { ids?: string[] | null }, ctx: GraphQLContext) => {
      const auth = requireAuth(ctx)
      return alertService.markNotificationsRead(auth.tenantId, ids)
    },
  },
}
