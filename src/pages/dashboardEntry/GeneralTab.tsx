import { useState } from 'react';
import { StatsResponse, UserPollData } from '../../api/getUserInfo/stats';
import { TimeRange, formatDateTime, extractStringLeaves } from './dashboardUtils';
import { StatLineChart, StackedBarChart, TimeRangeSelector } from './dashboardCharts';

type ChartData = {
  userChart: Array<{ time: string; users: number }>;
  userTotalChart: Array<{ time: string; users: number }>;
  conversationChart: Array<{
    time: string;
    conversations: number;
    newUserConversations: number;
    returningUserConversations: number;
  }>;
  activeUserChart: Array<{
    time: string;
    activeUsers: number;
    newUsers: number;
    returningUsers: number;
  }>;
};

export default function GeneralTab({
  stats,
  chartData,
  timeRange,
  setTimeRange,
  tzOffsetMs,
  conversationCount,
  pollRows,
  role = 'admin',
}: {
  stats: StatsResponse;
  chartData: ChartData;
  timeRange: TimeRange;
  setTimeRange: (r: TimeRange) => void;
  tzOffsetMs: number;
  conversationCount: number;
  pollRows: UserPollData[];
  role?: string;
}) {
  const [growthMode, setGrowthMode] = useState<'net' | 'total'>('net');
  const [activeUsersMode, setActiveUsersMode] = useState<'line' | 'bar'>('line');
  const [conversationsMode, setConversationsMode] = useState<'line' | 'bar'>('line');

  const activeUserChartTitle =
    timeRange === '7d' || timeRange === '30d' ? 'Daily Active Users' : 'Active Users';

  return (
    <>
      <div className="stats-grid">
        {role === 'admin' && (
          <div className="stat-card">
            <div className="stat-label">Total Users</div>
            <div className="stat-value">{stats.total_users}</div>
          </div>
        )}
        {role === 'admin' && (
          <div className="stat-card">
            <div className="stat-label">Conversations</div>
            <div className="stat-value">{conversationCount}</div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title-with-toggle">
            <h2>User Growth</h2>
            {role === 'admin' && (
              <div className="stat-segmented">
                <button
                  type="button"
                  className={`stat-segmented-btn ${growthMode === 'net' ? 'active' : ''}`}
                  onClick={() => setGrowthMode('net')}
                >
                  Net growth
                </button>
                <button
                  type="button"
                  className={`stat-segmented-btn ${growthMode === 'total' ? 'active' : ''}`}
                  onClick={() => setGrowthMode('total')}
                >
                  Total
                </button>
              </div>
            )}
          </div>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="chart-container">
          <StatLineChart
            data={role === 'admin' && growthMode === 'total' ? chartData.userTotalChart : chartData.userChart}
            dataKey="users"
          />
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title-with-toggle">
            <h2>{activeUserChartTitle}</h2>
            <div className="stat-segmented">
              <button
                type="button"
                className={`stat-segmented-btn ${activeUsersMode === 'line' ? 'active' : ''}`}
                onClick={() => setActiveUsersMode('line')}
              >
                Line
              </button>
              <button
                type="button"
                className={`stat-segmented-btn ${activeUsersMode === 'bar' ? 'active' : ''}`}
                onClick={() => setActiveUsersMode('bar')}
              >
                Bar · New vs Returning
              </button>
            </div>
          </div>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="chart-container">
          {activeUsersMode === 'bar' ? (
            <StackedBarChart
              data={chartData.activeUserChart}
              newKey="newUsers"
              returningKey="returningUsers"
              totalKey="activeUsers"
              newLabel="New users (signed up this bucket)"
              returningLabel="Returning users"
            />
          ) : (
            <StatLineChart data={chartData.activeUserChart} dataKey="activeUsers" />
          )}
        </div>
      </div>

      {role === 'admin' && (
        <div className="section">
          <div className="section-header">
            <div className="section-title-with-toggle">
              <h2>Conversation Activity</h2>
              <div className="stat-segmented">
                <button
                  type="button"
                  className={`stat-segmented-btn ${conversationsMode === 'line' ? 'active' : ''}`}
                  onClick={() => setConversationsMode('line')}
                >
                  Line
                </button>
                <button
                  type="button"
                  className={`stat-segmented-btn ${conversationsMode === 'bar' ? 'active' : ''}`}
                  onClick={() => setConversationsMode('bar')}
                >
                  Bar · New vs Returning
                </button>
              </div>
            </div>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>
          <div className="chart-container">
            {conversationsMode === 'bar' ? (
              <StackedBarChart
                data={chartData.conversationChart}
                newKey="newUserConversations"
                returningKey="returningUserConversations"
                totalKey="conversations"
                newLabel="Conversations by new users"
                returningLabel="Conversations by returning users"
              />
            ) : (
              <StatLineChart data={chartData.conversationChart} dataKey="conversations" />
            )}
          </div>
        </div>
      )}

      <div className="section">
        <h2>Latest Users</h2>
        <div className="table-container">
          <table className="paid-users-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Email / Username</th>
                <th>Login IP Country</th>
                <th>Acquisition Sources</th>
                <th style={{ whiteSpace: 'nowrap' }}>Created At</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const pollByUid = new Map(pollRows.map((p) => [p.user_id, p]));
                return stats.latest_users.slice(0, 20).map((user) => {
                  const p = pollByUid.get(user.user_id);
                  // Extract country from login_ip object
                  const ipCountry = (() => {
                    const ip = p?.login_ip;
                    if (!ip || typeof ip !== 'object' || Array.isArray(ip)) return null;
                    const c = (ip as Record<string, unknown>).country;
                    return typeof c === 'string' ? c : null;
                  })();
                  const sources = p?.user_acquisition_sources
                    ? extractStringLeaves(p.user_acquisition_sources).join(', ')
                    : null;
                  return (
                    <tr key={user.user_id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {user.email || user.username || user.user_id.slice(0, 8) + '…'}
                      </td>
                      <td>{ipCountry ?? '—'}</td>
                      <td style={{ fontSize: 11, color: '#555', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={sources ?? undefined}>
                        {sources || '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {user.created_at ? formatDateTime(user.created_at, tzOffsetMs) : '—'}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
