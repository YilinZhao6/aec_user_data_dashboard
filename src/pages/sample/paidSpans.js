// Subscription span maths, shared by the Paid tab and the user detail modal.
//
// Lived in SampleDashboard4 until the modal needed the same "how long has this
// person actually been paying" answer. One copy, so the two never drift.

export const DAY_MS = 24 * 60 * 60 * 1000

// Two paid periods less than this far apart read as one continuous
// subscription rather than a churn-and-return. Ten days covers a card retry
// or a manual re-purchase without swallowing a real gap.
const CONTINUITY_GAP_DAYS = 10

/** Milliseconds for an ISO stamp, or null when it is missing / unparseable. */
export const parseTs = (s) => {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * Collapse subscription rows into continuous paid periods.
 *
 * Returns `[{ start, end, subs }]` sorted oldest first. Rows without a
 * `started_at` are dropped — there is nowhere to put them on a timeline.
 */
export function buildPaidSpans(subs) {
  const gapMs = CONTINUITY_GAP_DAYS * DAY_MS
  const items = subs
    .map((sub) => {
      const start = parseTs(sub.started_at)
      if (start == null) return null
      const end = parseTs(sub.expires_at) ?? start
      return { start, end: Math.max(start, end), sub }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  const spans = []
  for (const item of items) {
    const current = spans[spans.length - 1]
    if (current && item.start - current.end <= gapMs) {
      current.end = Math.max(current.end, item.end)
      current.subs.push(item.sub)
    } else {
      spans.push({ start: item.start, end: item.end, subs: [item.sub] })
    }
  }
  return spans
}

/**
 * How a subscription row was actually paid for.
 *
 * The subscription table stores no payment-method column; what it does store
 * is which Stripe object created the row, and that is the distinction that
 * matters here — a recurring card charge, a single card charge, or a grant
 * that never went through Stripe at all.
 */
export function paymentMethodLabel(sub) {
  if (sub.stripe_subscription_id) return 'Stripe subscription (card)'
  if (sub.payment_intent_id) return 'Stripe one-off (card)'
  if (sub.billing_reason === 'invite_code_grant' || sub.billing_reason === 'invitation_credit_grant') {
    return 'Invite grant (no payment)'
  }
  if (sub.billing_reason === 'manual_addition') return 'Manual grant (no payment)'
  // Older paid rows predate the Stripe id columns. The money was real, we
  // just can't say which object it came from — say that rather than "unknown".
  if (sub.billing_reason === 'one-off-payment') return 'One-off (no Stripe reference)'
  if (sub.billing_reason === 'initial_subscription' || sub.billing_reason === 'renewal') {
    return 'Subscription (no Stripe reference)'
  }
  return 'Unknown'
}
