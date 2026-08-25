// The route table, in its own module so both App (to render) and SiteNav (to
// prefetch) can use it without importing each other.

import { lazy } from 'react'

// Kept as plain functions so the same import can be reused to prefetch.
const importFeedback = () => import('./pages/feedback/FeedbackPage')
const importQueries = () => import('./pages/queries/QueriesPage')
const importCourses = () => import('./pages/courses/CoursesPage')

// Every page is its own lazy chunk, so opening /feedback never loads the
// dashboard's code — or fires its requests.
export const ROUTES = {
  '/feedback': lazy(importFeedback),
  '/queries': lazy(importQueries),
  '/courses': lazy(importCourses),
}

const PREFETCH = {
  '/feedback': importFeedback,
  '/queries': importQueries,
  '/courses': importCourses,
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
 * Chunks big enough that warming them on spec is the wrong trade.
 *
 * /courses draws recharts, which makes its chunk ~100 kB gzipped — two orders
 * of magnitude past the other pages. Downloading that in the background for
 * everyone, including the people who never open it, costs more than the
 * loading screen it would save. Hovering the nav link still prefetches it.
 */
const SKIP_IDLE_PREFETCH = new Set(['/courses'])

/**
 * The lightweight page chunks are a few kB each. They also pull the shared
 * ~22 kB UserDetail chunk (the click-through user profile), which the
 * dashboard loads anyway — so prefetching still costs one small download, not
 * a duplicate of it. Prefetching a chunk downloads its code; it does not fire
 * the page's requests, so this never starts any page's data fetch.
 */
export function prefetchAllRoutes() {
  Object.entries(PREFETCH).forEach(([path, load]) => {
    if (!SKIP_IDLE_PREFETCH.has(path)) load()
  })
}
