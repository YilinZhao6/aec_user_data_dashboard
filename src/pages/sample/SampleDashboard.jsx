import './SampleDashboard.css'

const metricCards = [
  { label: 'Total Users', value: '18,420', delta: '+12.4%' },
  { label: 'Conversations', value: '96,318', delta: '+8.1%' },
  { label: 'New Signups', value: '1,248', delta: '+5.7%' },
  { label: 'Active Users', value: '2,300', delta: '+4.9%' },
]

const activityStats = [
  { label: 'New Users', value: '842' },
  { label: 'Returning', value: '1,458' },
  { label: 'Messages', value: '12.8k' },
  { label: 'DAU/MAU', value: '31%' },
]

function MetricCard({ label, value, delta }) {
  return (
    <div className="sample-metric-card">
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{delta}</span>
      </div>
      <div className="sample-icon-badge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M5 6.5h14M7 4v5M17 4v5M6 9.5h12v9H6v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

function WaveChart() {
  return (
    <svg className="sample-wave-chart" viewBox="0 0 640 250" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sampleArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c8cff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#1c8cff" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      {[40, 80, 120, 160, 200].map((y) => (
        <line key={y} x1="0" x2="640" y1={y} y2={y} className="sample-grid-line" />
      ))}
      <path
        d="M0 72 C42 92 50 116 66 190 C108 210 128 106 184 128 C226 144 242 92 292 80 C354 64 356 154 420 150 C470 146 474 78 526 118 C574 154 578 66 640 74 L640 250 L0 250 Z"
        fill="url(#sampleArea)"
      />
      <path
        d="M0 128 C62 98 86 198 146 176 C196 158 202 112 258 142 C312 174 336 116 400 124 C468 132 464 208 532 174 C584 148 594 182 640 168"
        className="sample-chart-line"
      />
    </svg>
  )
}

function BarChart() {
  return (
    <div className="sample-bar-chart" aria-label="Active users chart">
      {[64, 46, 26, 56, 100, 78, 92, 56, 30].map((height, index) => (
        <span key={index} style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

export default function SampleDashboard() {
  return (
    <div className="sample-dashboard">
      <div className="sample-glow sample-glow-one" />
      <div className="sample-glow sample-glow-two" />

      <header className="sample-topbar">
        <div>
          <p>Pages / General</p>
          <h1>User Dashboard</h1>
        </div>
        <div className="sample-topbar-actions">
          <label className="sample-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input placeholder="Search users..." />
          </label>
          <button>Export</button>
          <span className="sample-dot" />
        </div>
      </header>

      <main className="sample-content">
        <section className="sample-metrics-grid">
          {metricCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </section>

        <section className="sample-hero-grid">
          <div className="sample-glass-card sample-welcome-card">
            <div>
              <p>Hyperknow Overview</p>
              <h2>User growth is accelerating</h2>
              <span>Track signups, conversations, activation, and returning behavior in one focused workspace.</span>
            </div>
            <button>View latest users {'->'}</button>
            <div className="sample-orb" />
          </div>

          <div className="sample-glass-card sample-satisfaction-card">
            <p>Activation Health</p>
            <span>Signup to first conversation</span>
            <div className="sample-gauge">
              <div className="sample-gauge-arc" />
              <div className="sample-gauge-center">☺</div>
            </div>
            <div className="sample-score-strip">
              <small>0%</small>
              <strong>68%</strong>
              <small>100%</small>
            </div>
          </div>

          <div className="sample-glass-card sample-referral-card">
            <div className="sample-card-heading">
              <div>
                <p>Retention Snapshot</p>
                <span>Early cohort performance</span>
              </div>
              <button>...</button>
            </div>
            <div className="sample-referral-body">
              <div className="sample-mini-stack">
                <div>
                  <span>D1 retained</span>
                  <strong>42%</strong>
                </div>
                <div>
                  <span>D7 retained</span>
                  <strong>24%</strong>
                </div>
              </div>
              <div className="sample-score-ring">
                <div>
                  <span>Stickiness</span>
                  <strong>31%</strong>
                  <small>DAU / MAU</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sample-lower-grid">
          <div className="sample-glass-card sample-sales-card">
            <div className="sample-card-heading">
              <div>
                <p>User Growth</p>
                <span>(+12.4%) total users this month</span>
              </div>
            </div>
            <WaveChart />
          </div>

          <div className="sample-glass-card sample-active-card">
            <BarChart />
            <div className="sample-card-heading">
              <div>
                <p>Active Users</p>
                <span>(+23%) than last week</span>
              </div>
            </div>
            <div className="sample-activity-grid">
              {activityStats.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
