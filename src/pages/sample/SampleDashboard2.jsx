import './SampleDashboard2.css'

const summaryCards = [
  { label: 'Total Users', value: '18,420', helper: '+12.4% this month', tone: 'rose' },
  { label: 'Conversations', value: '96,318', helper: '+8.1% this month', tone: 'amber' },
  { label: 'Active Users', value: '2,300', helper: '+4.9% this week', tone: 'green' },
  { label: 'New Signups', value: '1,248', helper: '+5.7% this month', tone: 'violet' },
]

const latestUsers = [
  { name: 'sarah@college.edu', source: 'Google Search', country: 'United States', status: 'Activated' },
  { name: 'chenli@example.com', source: 'TikTok', country: 'Singapore', status: 'New' },
  { name: 'maya@student.org', source: 'Referral', country: 'Canada', status: 'Returning' },
  { name: 'alex@design.io', source: 'Direct', country: 'United Kingdom', status: 'Activated' },
]

function MiniIcon() {
  return (
    <span className="sample2-icon">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function LineInsightChart() {
  return (
    <svg className="sample2-line-chart" viewBox="0 0 520 220" preserveAspectRatio="none">
      {[42, 86, 130, 174].map((y) => (
        <line key={y} x1="0" x2="520" y1={y} y2={y} />
      ))}
      <path d="M0 64 C44 24 80 34 118 76 C156 118 194 126 232 86 C276 42 316 42 360 68 C408 96 456 116 520 72" className="sample2-line sample2-line-purple" />
      <path d="M0 94 C48 52 86 68 126 112 C166 158 208 166 250 118 C292 66 328 32 382 42 C430 52 468 88 520 120" className="sample2-line sample2-line-red" />
      <path d="M0 50 C50 18 98 28 150 62 C202 96 248 116 300 90 C356 62 408 42 520 100" className="sample2-line sample2-line-green" />
      <circle cx="382" cy="42" r="5" className="sample2-hot-dot" />
    </svg>
  )
}

function GroupedBars() {
  return (
    <div className="sample2-grouped-bars">
      {[64, 78, 35, 72, 58, 82, 69].map((height, index) => (
        <div key={index}>
          <span className="blue" style={{ height: `${height}%` }} />
          <span className="mint" style={{ height: `${Math.max(28, 100 - height / 2)}%` }} />
        </div>
      ))}
    </div>
  )
}

function AreaChart() {
  return (
    <svg className="sample2-area-chart" viewBox="0 0 440 180" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sample2BlueArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#36a3ff" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#36a3ff" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="sample2GreenArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#37d6a0" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#37d6a0" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d="M0 98 C58 78 84 50 132 88 C176 126 214 112 256 80 C304 42 356 112 440 54 L440 180 L0 180 Z" fill="url(#sample2GreenArea)" />
      <path d="M0 126 C52 110 84 98 128 76 C172 54 198 138 252 126 C306 114 346 130 440 88 L440 180 L0 180 Z" fill="url(#sample2BlueArea)" />
      <path d="M0 98 C58 78 84 50 132 88 C176 126 214 112 256 80 C304 42 356 112 440 54" className="sample2-area-line green" />
      <path d="M0 126 C52 110 84 98 128 76 C172 54 198 138 252 126 C306 114 346 130 440 88" className="sample2-area-line blue" />
    </svg>
  )
}

export default function SampleDashboard2() {
  return (
    <div className="sample2-page">
      <header className="sample2-header">
        <div>
          <p>Hyperknow / General</p>
          <h1>User Dashboard</h1>
          <span>Placeholder view using homepage-style analytics content.</span>
        </div>
        <button>Export snapshot</button>
      </header>

      <main className="sample2-grid">
        <section className="sample2-card sample2-sales-card">
          <div className="sample2-card-heading">
            <div>
              <h2>Today&apos;s User Summary</h2>
              <p>Core metrics from the General page</p>
            </div>
          </div>
          <div className="sample2-summary-grid">
            {summaryCards.map((card) => (
              <div key={card.label} className={`sample2-summary-card ${card.tone}`}>
                <MiniIcon />
                <strong>{card.value}</strong>
                <span>{card.label}</span>
                <small>{card.helper}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="sample2-card">
          <div className="sample2-card-heading">
            <div>
              <h2>User Activity Insights</h2>
              <p>New, returning, and unique active users</p>
            </div>
          </div>
          <LineInsightChart />
          <div className="sample2-legend">
            <span><i className="purple" />Active users</span>
            <span><i className="red" />New users</span>
            <span><i className="green" />Returning users</span>
          </div>
        </section>

        <section className="sample2-card">
          <div className="sample2-card-heading">
            <div>
              <h2>User Growth</h2>
              <p>Total vs net new users</p>
            </div>
          </div>
          <GroupedBars />
          <div className="sample2-legend">
            <span><i className="blue" />Total users</span>
            <span><i className="mint" />New users</span>
          </div>
        </section>

        <section className="sample2-card">
          <div className="sample2-card-heading">
            <div>
              <h2>Conversation Activity</h2>
              <p>New vs returning user conversations</p>
            </div>
          </div>
          <AreaChart />
          <div className="sample2-split-metric">
            <div>
              <span>New user conversations</span>
              <strong>3,004</strong>
            </div>
            <div>
              <span>Returning conversations</span>
              <strong>4,504</strong>
            </div>
          </div>
        </section>

        <section className="sample2-card sample2-target-card">
          <div className="sample2-card-heading">
            <div>
              <h2>Activation vs Retention</h2>
              <p>First conversation and D7 return</p>
            </div>
          </div>
          <div className="sample2-target-bars">
            {[70, 61, 82, 68, 91, 86].map((height, index) => (
              <div key={index}>
                <span className="activation" style={{ height: `${height}%` }} />
                <span className="retention" style={{ height: `${Math.max(35, height - 18)}%` }} />
              </div>
            ))}
          </div>
          <div className="sample2-target-list">
            <div>
              <span>Activation rate</span>
              <strong>68%</strong>
            </div>
            <div>
              <span>D7 retention</span>
              <strong>24%</strong>
            </div>
          </div>
        </section>

        <section className="sample2-card sample2-table-card">
          <div className="sample2-card-heading">
            <div>
              <h2>Latest Users</h2>
              <p>Recent signups with acquisition source</p>
            </div>
          </div>
          <table className="sample2-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Source</th>
                <th>Country</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {latestUsers.map((user, index) => (
                <tr key={user.name}>
                  <td><span>{String(index + 1).padStart(2, '0')}</span>{user.name}</td>
                  <td>{user.source}</td>
                  <td>{user.country}</td>
                  <td><b>{user.status}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}
