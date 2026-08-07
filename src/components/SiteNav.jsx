// Cross-page navigation, shared by the dashboard and the standalone pages.
//
// Plain anchors on purpose: each page loads on its own and hits only its own
// endpoints, so a full navigation is the intended behaviour.
//
// One asymmetry, deliberate: leaving *for* the dashboard asks first. The
// dashboard fetches the whole stats/paid/UTM payload and that takes a while,
// so an accidental click is expensive. Every other direction is instant and
// navigates straight away.

import { useState } from 'react'
import { Modal } from './ui'

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/queries', label: 'Queries' },
]

const DASHBOARD_HREF = '/'

export function SiteNav({ active }) {
  const [confirming, setConfirming] = useState(false)

  // Only when heading to the dashboard from somewhere else.
  const needsConfirm = (href) => href === DASHBOARD_HREF && active !== DASHBOARD_HREF

  const handleClick = (event, href) => {
    if (!needsConfirm(href)) return // let the anchor navigate normally
    event.preventDefault()
    setConfirming(true)
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
              onClick={() => { window.location.href = DASHBOARD_HREF }}
            >
              Load dashboard
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
