import { useEffect, useState, useMemo } from 'react';
import {
  getStats,
  StatsResponse,
  UserAnalytics,
  UserPollData,
} from '../../api/getUserInfo/stats';
import { getPaidStats, PaidStatsResponse } from '../../api/getUserInfo/paid';
import { useAuth } from '../../auth/AuthContext';
import PaidTab from './PaidTab';
import GeneralTab from './GeneralTab';
import RetentionTab from './RetentionTab';
import AnalyticsTab from './AnalyticsTab';
import PollDataTab from './PollDataTab';
import TopUsersTab from './TopUsersTab';
import {
  TimeRange,
  MauMode,
  CountEntry,
  RetentionPoint,
  TIMEZONE_OPTIONS,
  BROWSER_OFFSET_MS,
  todayTzKey,
  addDays,
  toTzDateKey,
  parseInTz,
  getTzNow,
  daysBetweenDateKeys,
  aggregateCounts,
  aggregateMostUsedFunctions,
  aggregateJsonbColumn,
  topBreakdownByCategory,
  withOtherBucket,
  extractLoginIpCountries,
  collectMeaningfulEvents,
  MAX_RETENTION_DAY,
} from './dashboardUtils';
import './DashboardEntry.css';

type DashboardTab = 'general' | 'retention' | 'analytics' | 'pollData' | 'topUsers' | 'paid';

export default function DashboardEntry() {
  const { auth, logout } = useAuth();
  const role = auth?.role ?? 'general';
  const apiKey = auth?.apiKey;

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [paidStats, setPaidStats] = useState<PaidStatsResponse | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('general');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [signupRange, setSignupRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [retentionMode, setRetentionMode] = useState<'exact' | 'rolling'>('exact');

  const [tzKey, setTzKey] = useState<string>('auto');
  const tzOffsetMs = useMemo<number>(
    () => TIMEZONE_OPTIONS.find((o) => o.key === tzKey)?.offsetMs ?? BROWSER_OFFSET_MS,
    [tzKey],
  );

  const [dauDate, setDauDate] = useState<string>(() => todayTzKey(BROWSER_OFFSET_MS));
  const [mauMode, setMauMode] = useState<MauMode>('rolling');
  const [mauMonth, setMauMonth] = useState<string>(() => todayTzKey(BROWSER_OFFSET_MS).slice(0, 7));
  const [mauEndDate, setMauEndDate] = useState<string>(() => todayTzKey(BROWSER_OFFSET_MS));

  const [topUsersRange, setTopUsersRange] = useState<{ start: string; end: string }>(() => {
    const end = todayTzKey(BROWSER_OFFSET_MS);
    return { start: addDays(end, -29), end };
  });
  const [topK, setTopK] = useState(20);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [statsResult, paidResult] = await Promise.allSettled([getStats(apiKey), getPaidStats(apiKey)]);
        if (cancelled) return;
        if (statsResult.status === 'fulfilled') {
          setStats(statsResult.value);
          setError(null);
        } else {
          setError(statsResult.reason instanceof Error ? statsResult.reason.message : 'Failed to fetch stats');
        }
        if (paidResult.status === 'fulfilled') {
          setPaidStats(paidResult.value);
          setPaidError(null);
        } else {
          setPaidError(paidResult.reason instanceof Error ? paidResult.reason.message : 'Failed to fetch paid stats');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  const mauWindow = useMemo<{ start: string; end: string; label: string }>(() => {
    if (mauMode === 'rolling') {
      const today = todayTzKey(tzOffsetMs);
      return { start: addDays(today, -29), end: today, label: 'Last 30 days' };
    }
    if (mauMode === 'month') {
      const [y, m] = mauMonth.split('-').map(Number);
      if (!y || !m) {
        const today = todayTzKey(tzOffsetMs);
        return { start: today, end: today, label: 'Invalid month' };
      }
      const start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return { start, end, label: `${y}-${String(m).padStart(2, '0')}` };
    }
    const end = mauEndDate || todayTzKey(tzOffsetMs);
    return { start: addDays(end, -29), end, label: `30 days ending ${end}` };
  }, [mauMode, mauMonth, mauEndDate, tzOffsetMs]);

  const dauStats = useMemo(() => {
    if (!stats) return { activeUsers: 0, newSignups: 0 };
    const day = dauDate;
    const activeSet = new Set<string>();
    for (const c of stats.conversation_history || []) {
      if (toTzDateKey(c.created_at, tzOffsetMs) === day) activeSet.add(c.user_id);
    }
    let newSignups = 0;
    for (const u of stats.all_users_timeline || []) {
      if (toTzDateKey(u.created_at, tzOffsetMs) === day) newSignups += 1;
    }
    return { activeUsers: activeSet.size, newSignups };
  }, [stats, dauDate, tzOffsetMs]);

  const mauStats = useMemo(() => {
    if (!stats) return { activeUsers: 0, newSignups: 0 };
    const { start, end } = mauWindow;
    const activeSet = new Set<string>();
    for (const c of stats.conversation_history || []) {
      const day = toTzDateKey(c.created_at, tzOffsetMs);
      if (day >= start && day <= end) activeSet.add(c.user_id);
    }
    let newSignups = 0;
    for (const u of stats.all_users_timeline || []) {
      const day = toTzDateKey(u.created_at, tzOffsetMs);
      if (day >= start && day <= end) newSignups += 1;
    }
    return { activeUsers: activeSet.size, newSignups };
  }, [stats, mauWindow, tzOffsetMs]);

  const dauMauRatio = mauStats.activeUsers > 0 ? dauStats.activeUsers / mauStats.activeUsers : 0;

  const signupBounds = useMemo<{ min: string; max: string } | null>(() => {
    if (!stats?.all_users_timeline?.length) return null;
    let min: string | null = null;
    let max: string | null = null;
    for (const u of stats.all_users_timeline) {
      const d = toTzDateKey(u.created_at, tzOffsetMs);
      if (min === null || d < min) min = d;
      if (max === null || d > max) max = d;
    }
    return min && max ? { min, max } : null;
  }, [stats, tzOffsetMs]);

  const cumulativeRetention = useMemo<RetentionPoint[]>(() => {
    if (!stats) return [];
    const today = todayTzKey(tzOffsetMs);
    const start = signupRange.start || null;
    const end = signupRange.end || null;

    const signupDayByUser = new Map<string, string>();
    for (const u of stats.all_users_timeline || []) {
      const day = toTzDateKey(u.created_at, tzOffsetMs);
      if (start && day < start) continue;
      if (end && day > end) continue;
      if (!signupDayByUser.has(u.user_id)) signupDayByUser.set(u.user_id, day);
    }

    const activeOnDayByUser = new Map<string, Set<number>>();
    for (const e of collectMeaningfulEvents(stats)) {
      const signupDay = signupDayByUser.get(e.user_id);
      if (!signupDay) continue;
      const diff = daysBetweenDateKeys(signupDay, toTzDateKey(e.created_at, tzOffsetMs));
      if (diff < 1) continue;
      let set = activeOnDayByUser.get(e.user_id);
      if (!set) { set = new Set(); activeOnDayByUser.set(e.user_id, set); }
      set.add(diff);
    }

    const users: Array<{ userId: string; daysSinceSignup: number }> = [];
    let maxDaysSinceSignup = -1;
    for (const [userId, signupDay] of signupDayByUser) {
      const daysSinceSignup = daysBetweenDateKeys(signupDay, today);
      users.push({ userId, daysSinceSignup });
      if (daysSinceSignup > maxDaysSinceSignup) maxDaysSinceSignup = daysSinceSignup;
    }

    const points: RetentionPoint[] = [];
    for (let n = 1; n <= MAX_RETENTION_DAY; n++) {
      let eligible = 0;
      let returned = 0;
      for (const u of users) {
        if (u.daysSinceSignup < n) continue;
        eligible += 1;
        const days = activeOnDayByUser.get(u.userId);
        if (!days) continue;
        if (retentionMode === 'exact') {
          if (days.has(n)) returned += 1;
        } else {
          let hit = false;
          for (const d of days) { if (d >= n) { hit = true; break; } }
          if (hit) returned += 1;
        }
      }
      points.push({ day: n, ratePct: eligible > 0 ? (returned / eligible) * 100 : 0, returned, eligible, hasData: eligible > 0, mature: maxDaysSinceSignup >= n });
    }
    return points;
  }, [stats, signupRange, retentionMode, tzOffsetMs]);

  const chartData = useMemo(() => {
    type ActiveUserPoint = { time: string; activeUsers: number; newUsers: number; returningUsers: number };
    type ConversationPoint = { time: string; conversations: number; newUserConversations: number; returningUserConversations: number };
    const empty = {
      userChart: [] as Array<{ time: string; users: number }>,
      userTotalChart: [] as Array<{ time: string; users: number }>,
      conversationChart: [] as ConversationPoint[],
      activeUserChart: [] as ActiveUserPoint[],
    };
    if (!stats) return empty;

    const now = getTzNow(tzOffsetMs);
    let startTime: Date;
    let intervalMs: number;
    const formatHourLabel = (date: Date) => `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
    const formatDayLabel = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    let formatLabel: (date: Date) => string;

    switch (timeRange) {
      case '12h': startTime = new Date(now.getTime() - 12 * 3600000); intervalMs = 3600000; formatLabel = formatHourLabel; break;
      case '1d':  startTime = new Date(now.getTime() - 24 * 3600000); intervalMs = 2 * 3600000; formatLabel = formatHourLabel; break;
      case '7d':  startTime = new Date(now.getTime() - 7 * 86400000); intervalMs = 86400000; formatLabel = formatDayLabel; break;
      case '30d': startTime = new Date(now.getTime() - 30 * 86400000); intervalMs = 86400000; formatLabel = formatDayLabel; break;
    }

    const bucketKey = (t: number) => Math.floor(t / intervalMs) * intervalMs;
    type Bucket = { label: string; users: number; conversations: number; newUserConversations: number; returningUserConversations: number; newActiveUsers: Set<string>; returningActiveUsers: Set<string> };
    const buckets = new Map<number, Bucket>();

    let cursor = new Date(startTime);
    while (cursor <= now) {
      const key = bucketKey(cursor.getTime());
      if (!buckets.has(key)) buckets.set(key, { label: formatLabel(cursor), users: 0, conversations: 0, newUserConversations: 0, returningUserConversations: 0, newActiveUsers: new Set(), returningActiveUsers: new Set() });
      cursor = new Date(cursor.getTime() + intervalMs);
    }

    const userSignupTime = new Map<string, number>();
    let baseTotal = 0;
    for (const user of stats.all_users_timeline || []) {
      const d = parseInTz(user.created_at, tzOffsetMs);
      if (!userSignupTime.has(user.user_id)) userSignupTime.set(user.user_id, d.getTime());
      if (d < startTime) { baseTotal += 1; continue; }
      if (d > now) continue;
      const b = buckets.get(bucketKey(d.getTime()));
      if (b) b.users += 1;
    }

    for (const conv of stats.conversation_history || []) {
      const d = parseInTz(conv.created_at, tzOffsetMs);
      if (d < startTime || d > now) continue;
      const bKey = bucketKey(d.getTime());
      const b = buckets.get(bKey);
      if (!b) continue;
      b.conversations += 1;
      const signupTs = userSignupTime.get(conv.user_id);
      const isNewInBucket = signupTs != null && signupTs >= bKey && signupTs < bKey + intervalMs;
      if (isNewInBucket) { b.newUserConversations += 1; b.newActiveUsers.add(conv.user_id); }
      else { b.returningUserConversations += 1; b.returningActiveUsers.add(conv.user_id); }
    }

    const sorted = Array.from(buckets.entries()).sort(([a], [b]) => a - b);
    let runningTotal = baseTotal;
    const userTotalChart: Array<{ time: string; users: number }> = [];
    for (const [, b] of sorted) { runningTotal += b.users; userTotalChart.push({ time: b.label, users: runningTotal }); }
    return {
      userChart: sorted.map(([, b]) => ({ time: b.label, users: b.users })),
      userTotalChart,
      conversationChart: sorted.map(([, b]) => ({ time: b.label, conversations: b.conversations, newUserConversations: b.newUserConversations, returningUserConversations: b.returningUserConversations })),
      activeUserChart: sorted.map(([, b]) => ({ time: b.label, activeUsers: b.newActiveUsers.size + b.returningActiveUsers.size, newUsers: b.newActiveUsers.size, returningUsers: b.returningActiveUsers.size })),
    };
  }, [stats, timeRange, tzOffsetMs]);

  const analyticsData = useMemo(() => {
    const rows: UserAnalytics[] = stats?.user_analytics ?? [];

    // 留学生分类：中国国籍 + 非中国地区
    const CHINA_COUNTRY_KEYS = ['china', 'chinese mainland', 'cn', 'mainland china'];
    // Use exact match to avoid "non-China" being mistakenly matched by includes("china")
    const isChineseNat = (s: string | null) => {
      if (!s) return false;
      const lower = s.toLowerCase().trim();
      return lower === 'china' || lower === 'chinese' || lower === 'cn';
    };
    const isChineseCountry = (s: string | null) =>
      !!s && CHINA_COUNTRY_KEYS.some((k) => s.toLowerCase().trim() === k);

    let overseas = 0;
    let domestic = 0;
    let nonChinese = 0;
    let unknownNat = 0;
    for (const r of rows) {
      if (!r.nationality || r.nationality.trim() === '') {
        unknownNat += 1;
      } else if (isChineseNat(r.nationality)) {
        if (isChineseCountry(r.country)) { domestic += 1; } else { overseas += 1; }
      } else {
        nonChinese += 1;
      }
    }
    const studentBreakdown: [string, number][] = ([
      ['🇨🇳 中国大陆用户', domestic],
      ['🌏 海外华人 / 留学生', overseas],
      ['🌍 纯外国人', nonChinese],
      ['❓ 未知国籍', unknownNat],
    ] as [string, number][]).filter(([, c]) => c > 0);

    return {
      rows,
      country: aggregateCounts(rows, (r) => r.country),
      nationality: aggregateCounts(rows, (r) => r.nationality),
      identity: withOtherBucket(aggregateCounts(rows, (r) => r.identity)),
      initialUsedFunction: withOtherBucket(aggregateCounts(rows, (r) => r.initial_used_function)),
      mostUsedFunction: withOtherBucket(aggregateMostUsedFunctions(rows)),
      identityCountries: topBreakdownByCategory(rows, (r) => r.identity, (r) => r.country),
      identityNationalities: topBreakdownByCategory(rows, (r) => r.identity, (r) => r.nationality),
      initialUsedFunctionCountries: topBreakdownByCategory(rows, (r) => r.initial_used_function, (r) => r.country),
      initialUsedFunctionNationalities: topBreakdownByCategory(rows, (r) => r.initial_used_function, (r) => r.nationality),
      studentBreakdown,
    };
  }, [stats]);

  const pollData = useMemo(() => {
    const rows: UserPollData[] = stats?.user_poll_data ?? [];
    const loginCountries = (() => {
      const counts = new Map<string, number>();
      for (const row of rows) {
        const seen = new Set(extractLoginIpCountries(row.login_ip));
        for (const c of seen) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    })();
    return {
      acquisitionSources: withOtherBucket(aggregateJsonbColumn(rows, (r) => r.user_acquisition_sources)),
      loginCountries: withOtherBucket(loginCountries),
    };
  }, [stats]);

  const conversationBounds = useMemo<{ min: string; max: string } | null>(() => {
    if (!stats?.conversation_history?.length) return null;
    let min: string | null = null;
    let max: string | null = null;
    for (const c of stats.conversation_history) {
      const d = toTzDateKey(c.created_at, tzOffsetMs);
      if (min === null || d < min) min = d;
      if (max === null || d > max) max = d;
    }
    return min && max ? { min, max } : null;
  }, [stats, tzOffsetMs]);

  const topUsers = useMemo(() => {
    const empty = { data: [] as CountEntry[], rows: [] as ReturnType<typeof buildTopUserRows>, totalConversations: 0, activeUsers: 0 };
    if (!stats) return empty;
    const { start, end } = topUsersRange;

    const labelByUser = new Map<string, string>();
    const addLabel = (uid: string, label: string | null | undefined) => {
      if (!uid) return;
      const trimmed = label?.trim();
      if (!trimmed) return;
      if (!labelByUser.has(uid)) labelByUser.set(uid, trimmed);
    };
    for (const u of stats.all_users_basic || []) addLabel(u.user_id, u.email || u.username);
    for (const u of stats.latest_users || []) addLabel(u.user_id, u.email || u.username);
    const friendly = (uid: string): string => labelByUser.get(uid) ?? `${uid.slice(0, 8)}…`;

    const analyticsByUid = new Map<string, UserAnalytics>();
    for (const a of stats.user_analytics ?? []) analyticsByUid.set(a.user_id, a);
    const pollByUid = new Map<string, UserPollData>();
    for (const p of stats.user_poll_data ?? []) pollByUid.set(p.user_id, p);

    const counts = new Map<string, number>();
    let totalConversations = 0;
    for (const c of stats.conversation_history || []) {
      const day = toTzDateKey(c.created_at, tzOffsetMs);
      if (start && day < start) continue;
      if (end && day > end) continue;
      counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
      totalConversations += 1;
    }

    const sortedEntries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const ranked: CountEntry[] = sortedEntries.map(([uid, value]) => ({ name: friendly(uid), value }));
    const rows = sortedEntries.slice(0, topK).map(([uid, conversations]) => {
      const a = analyticsByUid.get(uid);
      const p = pollByUid.get(uid);
      return { user_id: uid, label: friendly(uid), conversations, identity: a?.identity ?? null, country: a?.country ?? null, nationality: a?.nationality ?? null, initialUsedFunction: a?.initial_used_function ?? null, mostUsedFunctions: a?.most_used_function ?? null, loginIp: p?.login_ip ?? null, acquisitionSources: p?.user_acquisition_sources ?? null };
    });

    return { data: withOtherBucket(ranked, topK), rows, totalConversations, activeUsers: counts.size };
  }, [stats, topUsersRange, tzOffsetMs, topK]);

  if (loading) return <div className="dashboard-container"><div className="loading">Loading...</div></div>;

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

  if (!stats) return null;

  const conversationCount = (stats.conversation_history || []).length;

  // Tabs available per role
  const visibleTabs: [DashboardTab, string][] = [
    ['general', 'General'],
    ...(role === 'admin' ? [['retention', 'Retention']] as [DashboardTab, string][] : []),
    ['analytics', 'User Analytics'],
    ['pollData', 'User Poll Data'],
    ['topUsers', 'Top Users'],
    ...(role === 'admin' ? [['paid', 'Paid']] as [DashboardTab, string][] : []),
  ];

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-header-row">
          <h1>Hyperknow User Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="timezone-selector">
              <span>Timezone</span>
              <select value={tzKey} onChange={(e) => setTzKey(e.target.value)}>
                {TIMEZONE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#999', background: '#f5f5f5', padding: '2px 8px', borderRadius: 10 }}>
                {role}
              </span>
              <button
                type="button"
                onClick={logout}
                style={{ fontSize: 12, color: '#888', background: 'none', border: '1px solid #e5e5e5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
        <div className="tab-bar">
          {visibleTabs.map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'general' && (
        <GeneralTab
          stats={stats}
          chartData={chartData}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          tzOffsetMs={tzOffsetMs}
          conversationCount={conversationCount}
          pollRows={stats.user_poll_data ?? []}
          role={role}
        />
      )}

      {activeTab === 'retention' && role === 'admin' && (
        <RetentionTab
          dauStats={dauStats}
          dauDate={dauDate}
          setDauDate={setDauDate}
          mauStats={mauStats}
          mauWindow={mauWindow}
          mauMode={mauMode}
          setMauMode={setMauMode}
          mauMonth={mauMonth}
          setMauMonth={setMauMonth}
          mauEndDate={mauEndDate}
          setMauEndDate={setMauEndDate}
          dauMauRatio={dauMauRatio}
          cumulativeRetention={cumulativeRetention}
          signupRange={signupRange}
          setSignupRange={setSignupRange}
          signupBounds={signupBounds}
          retentionMode={retentionMode}
          setRetentionMode={setRetentionMode}
        />
      )}

      {activeTab === 'analytics' && (
        <AnalyticsTab analyticsData={analyticsData} role={role} />
      )}

      {activeTab === 'pollData' && (
        <PollDataTab pollData={pollData} />
      )}

      {activeTab === 'topUsers' && (
        <TopUsersTab
          topUsers={topUsers}
          topK={topK}
          setTopK={setTopK}
          topUsersRange={topUsersRange}
          setTopUsersRange={setTopUsersRange}
          conversationBounds={conversationBounds}
          tzOffsetMs={tzOffsetMs}
          role={role}
        />
      )}

      {activeTab === 'paid' && (
        paidStats ? (
          <PaidTab stats={stats} paidStats={paidStats} tzOffsetMs={tzOffsetMs} />
        ) : (
          <div className="section">
            <div className="empty-state" style={{ height: 160 }}>
              {paidError ? `Failed to load paid stats: ${paidError}` : 'Loading paid stats…'}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// Helper to infer the row type for topUsers (avoids repetition).
function buildTopUserRows() { return [] as Array<{ user_id: string; label: string; conversations: number; identity: string | null; country: string | null; nationality: string | null; initialUsedFunction: string | null; mostUsedFunctions: Array<{ count: number; function: string }> | null; loginIp: unknown; acquisitionSources: unknown }>; }
