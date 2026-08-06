import './SampleDashboard3.css'

const metrics = [
  { label: 'Total users', value: '18,420', note: '+12.4% this month' },
  { label: 'Conversations', value: '96,318', note: '+8.1% this month' },
  { label: 'Active users', value: '2,300', note: '+4.9% this week' },
  { label: 'New signups', value: '1,248', note: '+5.7% this month' },
]

const healthRows = [
  { label: 'Signup to first conversation', value: '68%' },
  { label: 'D1 retention', value: '42%' },
  { label: 'D7 retention', value: '24%' },
  { label: 'DAU / MAU', value: '31%' },
]

const latestUsers = [
  { user: 'sarah@college.edu', country: 'United States', source: 'Google Search', status: 'Activated' },
  { user: 'chenli@example.com', country: 'Singapore', source: 'TikTok', status: 'New' },
  { user: 'maya@student.org', country: 'Canada', source: 'Referral', status: 'Returning' },
  { user: 'alex@design.io', country: 'United Kingdom', source: 'Direct', status: 'Activated' },
]

function QuietLineChart() {
  return (
    <svg className="sample3-line-chart" viewBox="0 0 720 260" preserveAspectRatio="none">
      {[52, 104, 156, 208].map((y) => (
        <line key={y} x1="0" x2="720" y1={y} y2={y} />
      ))}
      <path d="M0 172 C78 132 110 154 168 122 C222 92 276 102 334 82 C412 56 456 112 520 96 C594 78 632 54 720 70" className="sample3-line primary" />
      <path d="M0 204 C82 180 132 194 190 170 C244 148 304 174 366 138 C438 96 508 162 572 126 C640 88 678 124 720 112" className="sample3-line secondary" />
    </svg>
  )
}

function QuietBars() {
  return (
    <div className="sample3-bars" aria-label="Activity bars">
      {[72, 58, 86, 64, 78, 52, 69].map((height, index) => (
        <span key={index} style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

export default function SampleDashboard3() {
  return (
    <div className="sample3-page">
      <header className="sample3-header">
        <div>
          <p>Hyperknow Analytics</p>
          <h1>User Dashboard</h1>
        </div>
        <div className="sample3-date">Last 30 days</div>
      </header>

      <main className="sample3-shell">
        <section className="sample3-intro">
          <span>General overview</span>
          <h2>A calm view of growth, activity, and retention.</h2>
          <p>
            A low-noise dashboard layout for checking the core user metrics without heavy visual treatment.
          </p>
        </section>

        <section className="sample3-metrics" aria-label="Key metrics">
          {metrics.map((metric) => (
            <article key={metric.label} className="sample3-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.note}</p>
            </article>
          ))}
        </section>

        <section className="sample3-grid">
          <article className="sample3-panel sample3-wide">
            <div className="sample3-panel-heading">
              <div>
                <span>User growth</span>
                <h3>Total users and net new signups</h3>
              </div>
              <p>Updated hourly</p>
            </div>
            <QuietLineChart />
            <div className="sample3-legend">
              <span><i className="primary" />Total users</span>
              <span><i className="secondary" />New users</span>
            </div>
          </article>

          <article className="sample3-panel">
            <div className="sample3-panel-heading">
              <div>
                <span>Activity</span>
                <h3>Daily active users</h3>
              </div>
            </div>
            <QuietBars />
            <div className="sample3-activity-summary">
              <strong>2,300</strong>
              <span>active users this week</span>
            </div>
          </article>

          <article className="sample3-panel">
            <div className="sample3-panel-heading">
              <div>
                <span>Health</span>
                <h3>Activation and retention</h3>
              </div>
            </div>
            <div className="sample3-health-list">
              {healthRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="sample3-panel sample3-wide">
            <div className="sample3-panel-heading">
              <div>
                <span>Latest users</span>
                <h3>Recent signups and acquisition source</h3>
              </div>
            </div>
            <div className="sample3-table-wrap">
              <table className="sample3-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Country</th>
                    <th>Source</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestUsers.map((user) => (
                    <tr key={user.user}>
                      <td>{user.user}</td>
                      <td>{user.country}</td>
                      <td>{user.source}</td>
                      <td>{user.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
