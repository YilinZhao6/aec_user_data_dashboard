import { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getStats, StatsResponse } from '../../api/getUserInfo/stats';
import './DashboardEntry.css';

type TimeRange = '12h' | '1d' | '7d' | '30d';

export default function DashboardEntry() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await getStats();
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper function to process timeline data for charts
  const processTimelineData = useMemo(() => {
    if (!stats) return { userChartData: [], conversationChartData: [] };

    const now = new Date();
    let startTime: Date;
    let intervalMs: number;
    let formatLabel: (date: Date) => string;

    switch (timeRange) {
      case '12h':
        startTime = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        intervalMs = 60 * 60 * 1000; // 1 hour intervals
        formatLabel = (date: Date) => {
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        };
        break;
      case '1d':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        intervalMs = 2 * 60 * 60 * 1000; // 2 hour intervals
        formatLabel = (date: Date) => {
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        };
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        intervalMs = 24 * 60 * 60 * 1000; // 1 day intervals
        formatLabel = (date: Date) => {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        intervalMs = 24 * 60 * 60 * 1000; // 1 day intervals
        formatLabel = (date: Date) => {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };
        break;
    }

    // Process user timeline data
    const filteredUsers = (stats.all_users_timeline || []).filter((user) => {
      const userDate = new Date(user.created_at);
      return userDate >= startTime && userDate <= now;
    });

    // Process conversation data
    const filteredConversations = stats.conversation_history.filter((conv) => {
      const convDate = new Date(conv.created_at);
      return convDate >= startTime && convDate <= now;
    });

    // Create buckets for time intervals with timestamp for sorting
    const userBuckets: Map<number, { label: string; count: number }> = new Map();
    const conversationBuckets: Map<number, { label: string; count: number }> = new Map();
    let currentTime = new Date(startTime);

    // Initialize all buckets
    while (currentTime <= now) {
      const bucketTimestamp = Math.floor(currentTime.getTime() / intervalMs) * intervalMs;
      const label = formatLabel(currentTime);
      userBuckets.set(bucketTimestamp, { label, count: 0 });
      conversationBuckets.set(bucketTimestamp, { label, count: 0 });
      currentTime = new Date(currentTime.getTime() + intervalMs);
    }

    // Count users in each bucket
    filteredUsers.forEach((user) => {
      const userDate = new Date(user.created_at);
      const bucketTimestamp = Math.floor(userDate.getTime() / intervalMs) * intervalMs;
      const bucket = userBuckets.get(bucketTimestamp);
      if (bucket) {
        bucket.count += 1;
      }
    });

    // Count conversations in each bucket
    filteredConversations.forEach((conv) => {
      const convDate = new Date(conv.created_at);
      const bucketTimestamp = Math.floor(convDate.getTime() / intervalMs) * intervalMs;
      const bucket = conversationBuckets.get(bucketTimestamp);
      if (bucket) {
        bucket.count += 1;
      }
    });

    // Convert to array format for charts and sort by timestamp
    const userChartData = Array.from(userBuckets.entries())
      .map(([timestamp, { label, count }]) => ({
        time: label,
        users: count,
        timestamp,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ time, users }) => ({ time, users }));

    const conversationChartData = Array.from(conversationBuckets.entries())
      .map(([timestamp, { label, count }]) => ({
        time: label,
        conversations: count,
        timestamp,
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ time, conversations }) => ({ time, conversations }));

    return { userChartData, conversationChartData };
  }, [stats, timeRange]);

  const userChartData = processTimelineData.userChartData;
  const chartData = processTimelineData.conversationChartData;

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error">
          <h3>Error Loading Dashboard</h3>
          <p>{error}</p>
          <div className="error-tips">
            <p><strong>Please check:</strong></p>
            <ul>
              <li>Your backend server is running on <code>http://localhost:8000</code></li>
              <li>The API endpoint path is correct (check browser console for the full URL)</li>
              <li>You have restarted the Vite dev server after creating/updating <code>.env</code></li>
              <li>CORS is enabled on your backend if needed</li>
            </ul>
            <p>Check the browser console (F12) for more details.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Hyperknow User Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{stats.total_users}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Paid Subscriptions</div>
          <div className="stat-value">{stats.paid_subscription_count}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Conversations</div>
          <div className="stat-value">{stats.conversation_history.length}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>User Growth</h2>
          <div className="time-range-selector">
            {(['12h', '1d', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={userChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="time"
                stroke="#666666"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#666666' }}
              />
              <YAxis
                stroke="#666666"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#666666' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#333333', marginBottom: '4px' }}
              />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#333333"
                strokeWidth={2}
                dot={{ fill: '#333333', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Conversation Activity</h2>
          <div className="time-range-selector">
            {(['12h', '1d', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                className={`time-range-btn ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="time"
                stroke="#666666"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#666666' }}
              />
              <YAxis
                stroke="#666666"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#666666' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#333333', marginBottom: '4px' }}
              />
              <Line
                type="monotone"
                dataKey="conversations"
                stroke="#333333"
                strokeWidth={2}
                dot={{ fill: '#333333', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="section">
        <h2>Latest Users</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {stats.latest_users.slice(0, 10).map((user) => (
                <tr key={user.user_id}>
                  <td>{user.email}</td>
                  <td>{user.username || '-'}</td>
                  <td>{formatDate(user.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <h2>Paid Subscription Users</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Tier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.paid_subscription_users.map((user) => (
                <tr key={user.user_id}>
                  <td>{user.email}</td>
                  <td>{user.username || '-'}</td>
                  <td>
                    <span className="badge badge-pro">{user.tier}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${user.status}`}>
                      {user.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

