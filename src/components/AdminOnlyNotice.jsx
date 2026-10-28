// Shown instead of an admin-only page (see ADMIN_ROUTES in routes.js) when the
// signed-in key is not the admin one.

import { PageShell } from './PageShell'

export default function AdminOnlyNotice({ path }) {
  return (
    <PageShell active={path}>
      <p className="sample4-state">This page is only available to the Founder role.</p>
    </PageShell>
  )
}
