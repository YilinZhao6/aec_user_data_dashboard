// Cross-page navigation, shared by the dashboard and the standalone pages.
//
// Two deliberate asymmetries:
//
//  1. Feedback <-> Queries swap client-side. Both chunks are prefetched and
//     the swap runs inside startTransition, so React keeps the current page
//     on screen instead of showing the app loading screen. Each page still
//     calls only its own endpoint — nothing about the data boundary changes.
//
//  2. Going *to* the dashboard asks first, then does a real page load. Its
//     payload (stats + paid + UTM) is slow enough that an accidental click is
//     expensive, and a fresh boot keeps the two worlds cleanly separated.

import { startTransition, useState } from 'react'
import { hardNavigate, navigate } from '../router'
import { isClientRoute, prefetchRoute } from '../routes'
import { Modal } from './ui'

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/queries', label: 'Queries' },
]

const DASHBOARD_HREF = '/'

export function SiteNav({ active }) {
  const [confirming, setConfirming] = useState(false)

  const handleClick = (event, href) => {
    if (href === active) {
      event.preventDefault()
      return
    }

    // Heading to the dashboard from elsewhere — confirm, then hard-load.
    if (href === DASHBOARD_HREF) {
      event.preventDefault()
      setConfirming(true)
      return
    }

    if (isClientRoute(href)) {
      event.preventDefault()
      // A transition lets React hold the old screen while the next one gets
      // ready, rather than unmounting to the Suspense fallback.
      startTransition(() => navigate(href))
    }
    // Anything else: let the anchor do a normal navigation.
  }

  return (
    <>
      <nav className="sample4-nav" aria-label="Pages">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={item.href === active ? 'active' : ''}
            aria-current={item.href === active ? 'page' : undefined}
            onMouseEnter={() => prefetchRoute(item.href)}
            onFocus={() => prefetchRoute(item.href)}
            onClick={(event) => handleClick(event, item.href)}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {confirming && (
        <Modal
          eyebrow="Confirm"
          title="Open the main dashboard?"
          onClose={() => setConfirming(false)}
        >
          <p className="sample4-comment">
            The dashboard loads the full stats, paid and UTM payload in one go.
            That can take a while — this page and the other standalone pages
            stay fast because they skip it.
          </p>
          <div className="sample4-modal-actions">
            <button type="button" className="sample4-mini-btn" onClick={() => setConfirming(false)}>
              Stay here
            </button>
            <button
              type="button"
              className="sample4-action"
              onClick={() => hardNavigate(DASHBOARD_HREF)}
            >
              Load dashboard
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
