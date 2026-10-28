// The route table, in its own module so both App (to render) and SiteNav (to
// prefetch) can use it without importing each other.

import { lazy } from 'react'

// Kept as plain functions so the same import can be reused to prefetch.
const importFeedback = () => import('./pages/feedback/FeedbackPage')
const importQueries = () => import('./pages/queries/QueriesPage')
const importDemo = () => import('./pages/demo/DemoPage')
const importModels = () => import('./pages/models/ModelHealthPage')

// Every page is its own lazy chunk, so opening /feedback never loads the
// dashboard's code — or fires its requests.
export const ROUTES = {
  '/feedback': lazy(importFeedback),
  '/queries': lazy(importQueries),
  '/demo': lazy(importDemo),
  '/models': lazy(importModels),
}

const PREFETCH = {
  '/feedback': importFeedback,
  '/queries': importQueries,
  '/demo': importDemo,
  '/models': importModels,
}

/**
 * Routes that render without signing in. /demo shows synthetic data only and
 * never calls the API, so a key would protect nothing.
 */
const PUBLIC_ROUTES = new Set(['/demo'])
export const isPublicRoute = (path) => PUBLIC_ROUTES.has(path)

/**
 * Routes only the admin (Founder) role may open — the page-level twin of the
 * dashboard's `adminOnly` tabs (Error Logs, Cost). Same caveat as those: it is
 * a display switch, not a security boundary (see src/auth/roles.ts).
 */
const ADMIN_ROUTES = new Set(['/models'])
export const isAdminRoute = (path) => ADMIN_ROUTES.has(path)

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
export function prefetchAllRoutes({ isAdmin = false } = {}) {
  Object.entries(PREFETCH)
    .filter(([path]) => isAdmin || !isAdminRoute(path))
    .forEach(([, load]) => load())
}
