import { useState } from 'react'
import './SampleDashboard4.css'

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'retention', label: 'Retention' },
  { id: 'analytics', label: 'User Analytics' },
  { id: 'pollData', label: 'User Poll Data' },
  { id: 'topUsers', label: 'Top Users' },
  { id: 'paid', label: 'Paid' },
  { id: 'userQueries', label: 'User Queries' },
  { id: 'utmTracking', label: 'UTM Tracking' },
]

const overviewMetrics = [
  { label: 'Total users', value: '18,420', note: '+12.4% this month' },
  { label: 'Conversations', value: '96,318', note: '+8.1% this month' },
  { label: 'Active users', value: '2,300', note: '+4.9% this week' },
  { label: 'New signups', value: '1,248', note: '+5.7% this month' },
]

const latestUsers = [
  ['sarah@college.edu', 'United States', 'Google Search', 'Activated'],
  ['chenli@example.com', 'Singapore', 'TikTok', 'New'],
  ['maya@student.org', 'Canada', 'Referral', 'Returning'],
  ['alex@design.io', 'United Kingdom', 'Direct', 'Activated'],
]

const tabContent = {
  retention: {
    title: 'Retention',
    description: 'DAU, MAU, DAU/MAU, and cohort retention placeholders.',
    cards: [
      ['DAU', '2,300', 'Selected day active users'],
      ['MAU', '7,420', 'Last 30 days active users'],
      ['DAU / MAU', '31%', 'Product stickiness'],
      ['D7 retention', '24%', 'Returning after first week'],
    ],
  },
  analytics: {
    title: 'User Analytics',
    description: 'Country, nationality, identity, and feature usage breakdowns.',
    cards: [
      ['Top country', 'United States', '28% of known users'],
      ['Student identity', '61%', 'Largest self-reported segment'],
      ['Most used function', 'Writing Assistant', '42% share'],
      ['Overseas Chinese', '34%', 'Detected from nationality/country'],
    ],
  },
  pollData: {
    title: 'User Poll Data',
    description: 'Acquisition source and login country summaries.',
    cards: [
      ['Google Search', '38%', 'Top acquisition source'],
      ['TikTok', '21%', 'Fastest growing source'],
      ['Referral', '17%', 'High intent segment'],
      ['Known login country', '82%', 'Rows with usable country'],
    ],
  },
  topUsers: {
    title: 'Top Users',
    description: 'Most active users by conversation count in the selected range.',
    cards: [
      ['Top user', '438', 'Conversations'],
      ['Active users', '2,300', 'In current range'],
      ['Total conversations', '12,840', 'In current range'],
      ['Top K', '20', 'Displayed users'],
    ],
  },
  paid: {
    title: 'Paid',
    description: 'Paid conversion, renewal, and subscription health placeholders.',
    cards: [
      ['Paid users', '428', '+9.2% this month'],
      ['Paid rate', '6.8%', 'Among activated users'],
      ['Renewal rate', '72%', 'Eligible subscribers'],
      ['Subscription share', '61%', 'Of paid users'],
    ],
  },
  userQueries: {
    title: 'User Queries',
    description: 'Recent user questions and conversation-level exploration.',
    cards: [
      ['Queries', '4,820', 'Selected range'],
      ['Unique users', '1,060', 'Asked at least once'],
      ['Avg per user', '4.5', 'Queries per active user'],
      ['Export ready', 'Yes', 'Placeholder action'],
    ],
  },
  utmTracking: {
    title: 'UTM Tracking',
    description: 'Campaign source, medium, campaign, and conversion placeholders.',
    cards: [
      ['Tracked sessions', '8,420', '+13.1% this month'],
      ['Top source', 'google', '37% share'],
      ['Top medium', 'organic', '44% share'],
      ['Conversion', '9.6%', 'Signup from tracked traffic'],
    ],
  },
}

function LineChart() {
  return (
    <svg className="sample4-line-chart" viewBox="0 0 720 250" preserveAspectRatio="none">
      {[50, 100, 150, 200].map((y) => (
        <line key={y} x1="0" x2="720" y1={y} y2={y} />
      ))}
      <path d="M0 174 C76 132 112 152 170 120 C224 90 276 102 334 82 C412 56 456 112 520 96 C594 78 632 54 720 70" className="sample4-chart-line main" />
      <path d="M0 206 C82 180 132 194 190 170 C244 148 304 174 366 138 C438 96 508 162 572 126 C640 88 678 124 720 112" className="sample4-chart-line muted" />
    </svg>
  )
}

function Bars() {
  return (
    <div className="sample4-bars">
      {[72, 58, 86, 64, 78, 52, 69].map((height, index) => (
        <span key={index} style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

function MetricGrid({ items }) {
  return (
    <section className="sample4-metrics">
      {items.map(([label, value, note]) => (
        <article key={label} className="sample4-metric">
          <span>{label}</span>
          <strong>{value}</strong>
          <p>{note}</p>
        </article>
      ))}
    </section>
  )
}

function GeneralView() {
  return (
    <>
      <section className="sample4-intro">
        <span>General overview</span>
        <h1>A quiet console for growth, activity, and users.</h1>
        <p>Placeholder data mirrors the real dashboard: user growth, active users, conversations, and latest signups.</p>
      </section>

      <section className="sample4-metrics">
        {overviewMetrics.map((metric) => (
          <article key={metric.label} className="sample4-metric">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="sample4-grid">
        <article className="sample4-panel sample4-wide">
          <div className="sample4-panel-heading">
            <div>
              <span>User growth</span>
              <h2>Total users and net new signups</h2>
            </div>
            <p>Last 30 days</p>
          </div>
          <LineChart />
        </article>

        <article className="sample4-panel">
          <div className="sample4-panel-heading">
            <div>
              <span>Activity</span>
              <h2>Daily active users</h2>
            </div>
          </div>
          <Bars />
          <div className="sample4-callout">
            <strong>2,300</strong>
            <span>active users this week</span>
          </div>
        </article>

        <article className="sample4-panel sample4-wide">
          <div className="sample4-panel-heading">
            <div>
              <span>Latest users</span>
              <h2>Recent signups and acquisition source</h2>
            </div>
          </div>
          <SampleTable />
        </article>
      </section>
    </>
  )
}

function SampleTable() {
  return (
    <div className="sample4-table-wrap">
      <table className="sample4-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Country</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {latestUsers.map(([user, country, source, status]) => (
            <tr key={user}>
              <td>{user}</td>
              <td>{country}</td>
              <td>{source}</td>
              <td>{status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlaceholderView({ tabId }) {
  const content = tabContent[tabId]

  return (
    <>
      <section className="sample4-intro compact">
        <span>{content.title}</span>
        <h1>{content.description}</h1>
      </section>
      <MetricGrid items={content.cards} />
      <section className="sample4-grid">
        <article className="sample4-panel sample4-wide">
          <div className="sample4-panel-heading">
            <div>
              <span>{content.title}</span>
              <h2>Primary chart placeholder</h2>
            </div>
            <p>Static sample data</p>
          </div>
          <LineChart />
        </article>
        <article className="sample4-panel">
          <div className="sample4-panel-heading">
            <div>
              <span>Breakdown</span>
              <h2>Distribution</h2>
            </div>
          </div>
          <Bars />
        </article>
      </section>
    </>
  )
}

export default function SampleDashboard4() {
  const [activeTab, setActiveTab] = useState('general')

  return (
    <div className="sample4-page">
      <nav className="sample4-tabs" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="sample4-shell">
        {activeTab === 'general' ? <GeneralView /> : <PlaceholderView tabId={activeTab} />}
      </main>
    </div>
  )
}
