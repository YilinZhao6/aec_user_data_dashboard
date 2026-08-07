// Minimal history-based routing. No dependency — there are three routes.
//
// Only the two standalone pages navigate client-side. The dashboard is still
// reached with a real page load: its chunk and data are heavy, and a hard
// navigation keeps the "opening /feedback never boots the dashboard" property
// honest in both directions.

import { useEffect, useState } from 'react'

const ROUTE_EVENT = 'app:routechange'

export function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

/** Client-side navigation: updates the URL and re-renders, no page load. */
export function navigate(to) {
  if (to === currentPath()) return
  window.history.pushState({}, '', to)
  window.dispatchEvent(new Event(ROUTE_EVENT))
}

/** Full page load — used for routes we deliberately want to boot fresh. */
export function hardNavigate(to) {
  window.location.href = to
}

export function useRoute() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const sync = () => setPath(currentPath())
    // popstate covers back/forward; the custom event covers navigate().
    window.addEventListener('popstate', sync)
    window.addEventListener(ROUTE_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(ROUTE_EVENT, sync)
    }
  }, [])

  return path
}
