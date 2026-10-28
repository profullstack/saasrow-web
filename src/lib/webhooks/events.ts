// The events SaaSRow sends to customer webhooks. Plain data, safe for client
// components. Keep in step with the triggers in the 20261028160000_webhooks_hub migration.

export const WEBHOOK_EVENT_TYPES = [
  'product.approved',
  'product.rejected',
  'product.featured',
  'product.upvoted',
  'product.commented',
  'karma.changed',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export const WEBHOOK_EVENT_HELP: Record<WebhookEventType, string> = {
  'product.approved': 'your listing was approved and is live in the directory',
  'product.rejected': 'your listing was rejected in review',
  'product.featured': 'your listing moved to the Featured or Premium tier',
  'product.upvoted': 'someone upvoted your listing',
  'product.commented': 'a comment or review on your listing went public',
  'karma.changed': 'your karma went up or down',
}

