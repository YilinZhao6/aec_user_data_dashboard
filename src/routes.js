// The route table, in its own module so both App (to render) and SiteNav (to
// prefetch) can use it without importing each other.

import { lazy } from 'react'

// Kept as plain functions so the same import can be reused to prefetch.
const importFeedback = () => import('./pages/feedback/FeedbackPage')
const importQueries = () => import('./pages/queries/QueriesPage')

// Every page is its own lazy chunk, so opening /feedback never loads the
// dashboard's code — or fires its requests.
export const ROUTES = {
  '/feedback': lazy(importFeedback),
  '/queries': lazy(importQueries),
}

const PREFETCH = {
  '/feedback': importFeedback,
  '/queries': importQueries,
}

/** True for routes that can be swapped in without a page load. */
export const isClientRoute = (path) => path in ROUTES

/**
 * Warm a route's chunk ahead of time. Switching between the two standalone
 * pages then has nothing left to download, so React can swap them without
 * ever suspending — which is what keeps the loading screen away.
 */
export function prefetchRoute(path) {
  PREFETCH[path]?.()
}

/**
 * The two page chunks are 5 kB and 12 kB. Both also pull the shared ~22 kB
 * UserDetail chunk (the click-through user profile), which the dashboard
 * loads anyway — so prefetching still costs one small download, not a
 * duplicate of it.
 */
export function prefetchAllRoutes() {
  Object.values(PREFETCH).forEach((load) => load())
}
