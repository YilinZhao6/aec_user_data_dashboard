// Data layer for the /play/sample4 dashboard.
//
// Fetches the same endpoints as the real dashboard and derives the (much
// smaller) set of numbers the sample layout shows. Kept free of JSX so the
// view file stays purely presentational; all shared maths comes from
// `dashboardEntry/dashboardUtils`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getStats,
  StatsResponse,
  UserAnalytics,
  UserPollData,
} from '../../api/getUserInfo/stats';
import {
  getPaidStats,
  PaidStatsResponse,
  bucketOfBillingReason,
} from '../../api/getUserInfo/paid';
import { getUtmStats, UtmStatsResponse, UtmUser } from '../../api/getUserInfo/utm';
import {
  getUserQueries,
  UserQueriesResponse,
} from '../../api/getUserInfo/userQueries';
import {
  BROWSER_OFFSET_MS,
  CountEntry,
  MAX_RETENTION_DAY,
  addDays,
  aggregateCounts,
  aggregateJsonbColumn,
  aggregateMostUsedFunctions,
  collectMeaningfulEvents,
  daysBetweenDateKeys,
  extractLoginIpCountries,
  extractStringLeaves,
  toTzDateKey,
  todayTzKey,
} from '../dashboardEntry/dashboardUtils';

// The sample has no timezone picker by design — everything is rendered in the
// viewer's own timezone.
const TZ = BROWSER_OFFSET_MS;

const GROWTH_DAYS = 30;
const ACTIVITY_DAYS = 7;
const TOP_K = 10;
const RANKING_ROWS = 8;
const TABLE_ROWS = 8;
const KEY_RETENTION_DAYS = [1, 3, 7, 14, 30] as const;
const QUERIES_LOOKBACK_DAYS = 3;

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

export const formatCount = (n: number): string => n.toLocaleString('en-US');

export const formatPct = (ratio: number, digits = 1): string =>
  Number.isFinite(ratio) ? `${(ratio * 100).toFixed(digits)}%` : '—';

export const formatDay = (dateKey: string): string => {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/** "Thu, Jul 9" — the long form used in chart hover readouts. */
export const formatDayLong = (dateKey: string): string =>
  new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

/** Percentage of a total, keeping decimals only when the share is tiny. */
const share = (part: number, total: number): string => {
  if (total <= 0) return '—';
  const ratio = part / total;
  return ratio > 0 && ratio < 0.01 ? formatPct(ratio, 2) : formatPct(ratio, 0);
};

const topEntry = (entries: CountEntry[]): CountEntry | null => entries[0] ?? null;

// --------------------------------------------------------------------------
// Small shared helpers
// --------------------------------------------------------------------------

/** The last `n` date keys, oldest first, ending today. */
function lastNDays(n: number): string[] {
  const end = todayTzKey(TZ);
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

function countByDay<T>(rows: readonly T[], getDate: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = getDate(row);
    if (!raw) continue;
    const key = toTzDateKey(raw, TZ);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function usersByDay<T>(
  rows: readonly T[],
  getUser: (row: T) => string,
  getDate: (row: T) => string,
) {
  const byDay = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = toTzDateKey(getDate(row), TZ);
    let set = byDay.get(key);
    if (!set) { set = new Set(); byDay.set(key, set); }
    set.add(getUser(row));
  }
  return byDay;
}

function unionSize(byDay: Map<string, Set<string>>, days: readonly string[]): number {
  const all = new Set<string>();
  for (const day of days) {
    const set = byDay.get(day);
    if (set) for (const id of set) all.add(id);
  }
  return all.size;
}

const firstLeaf = (value: unknown): string | null => extractStringLeaves(value)[0] ?? null;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type Metric = { label: string; value: string; note: string };
export type Series = { label: string; values: number[] };
/** `value` drives the bar height; `display` is the label drawn above it. */
export type Bar = { label: string; value: number; display: string; caption: string };
export type TableData = { columns: string[]; rows: string[][] };

export type TabView = {
  eyebrow: string;
  headline: string;
  description?: string;
  metrics: Metric[];
  chart?: {
    eyebrow: string;
    title: string;
    note: string;
    /** Short x-axis captions. */
    labels: string[];
    /** Long form shown in the hover readout. */
    tooltips: string[];
    series: Series[];
    format: 'count' | 'percent';
  };
  bars?: { eyebrow: string; title: string; bars: Bar[]; callout?: { value: string; label: string } };
  rankings?: Array<{ eyebrow: string; title: string; entries: CountEntry[]; total: number }>;
  table?: { eyebrow: string; title: string } & TableData;
  empty?: string;
};

// --------------------------------------------------------------------------
// Derivations — one per tab
// --------------------------------------------------------------------------

function deriveGeneral(stats: StatsResponse): TabView {
  const growthDays = lastNDays(GROWTH_DAYS);
  const activityDays = lastNDays(ACTIVITY_DAYS);

  const signupsByDay = countByDay(stats.all_users_timeline || [], (u) => u.created_at);
  const activeByDay = usersByDay(
    stats.conversation_history || [],
    (c) => c.user_id,
    (c) => c.created_at,
  );
  const conversationsByDay = countByDay(stats.conversation_history || [], (c) => c.created_at);

  const newSignups30d = growthDays.reduce((sum, d) => sum + (signupsByDay.get(d) ?? 0), 0);
  const activeUsers7d = unionSize(activeByDay, activityDays);
  const conversations = (stats.conversation_history || []).length;

  const countryByUser = new Map<string, string | null>();
  for (const row of stats.user_analytics ?? []) countryByUser.set(row.user_id, row.country);
  const sourceByUser = new Map<string, string | null>();
  for (const row of stats.user_poll_data ?? []) {
    sourceByUser.set(row.user_id, firstLeaf(row.user_acquisition_sources));
  }

  return {
    eyebrow: 'General overview',
    headline: 'A quiet console for growth, activity, and users.',
    description:
      'Live numbers from the Hyperknow dashboard API: total users, conversations, recent activity, and the newest signups.',
    metrics: [
      { label: 'Total users', value: formatCount(stats.total_users), note: `${formatCount(newSignups30d)} new in 30 days` },
      { label: 'Conversations', value: formatCount(conversations), note: 'All time, all users' },
      { label: 'Active users', value: formatCount(activeUsers7d), note: 'Last 7 days' },
      { label: 'New signups', value: formatCount(newSignups30d), note: 'Last 30 days' },
    ],
    chart: {
      eyebrow: 'User growth',
      title: 'Daily signups and active users',
      note: 'Last 30 days',
      labels: growthDays.map(formatDay),
      tooltips: growthDays.map(formatDayLong),
      format: 'count',
      series: [
        { label: 'Active users', values: growthDays.map((d) => activeByDay.get(d)?.size ?? 0) },
        { label: 'New signups', values: growthDays.map((d) => signupsByDay.get(d) ?? 0) },
      ],
    },
    bars: {
      eyebrow: 'Activity',
      title: 'Daily active users',
      bars: activityDays.map((day) => {
        const active = activeByDay.get(day)?.size ?? 0;
        return {
          label: formatDay(day),
          value: active,
          display: formatCount(active),
          caption: `${formatCount(conversationsByDay.get(day) ?? 0)} conversations`,
        };
      }),
      callout: { value: formatCount(activeUsers7d), label: 'active users in the last 7 days' },
    },
    table: {
      eyebrow: 'Latest users',
      title: 'Recent signups and acquisition source',
      columns: ['User', 'Country', 'Source', 'Joined'],
      rows: (stats.latest_users || []).slice(0, TABLE_ROWS).map((u) => [
        u.email || u.username || `${u.user_id.slice(0, 8)}…`,
        countryByUser.get(u.user_id) || '—',
        sourceByUser.get(u.user_id) || '—',
        formatDateTime(u.created_at),
      ]),
    },
  };
}

function deriveRetention(stats: StatsResponse): TabView {
  const today = todayTzKey(TZ);

  const dau = (() => {
    const set = new Set<string>();
    for (const c of stats.conversation_history || []) {
      if (toTzDateKey(c.created_at, TZ) === today) set.add(c.user_id);
    }
    return set.size;
  })();

  const mauStart = addDays(today, -29);
  const mau = (() => {
    const set = new Set<string>();
    for (const c of stats.conversation_history || []) {
      const day = toTzDateKey(c.created_at, TZ);
      if (day >= mauStart && day <= today) set.add(c.user_id);
    }
    return set.size;
  })();

  // Same shape as the real Retention tab in "exact" mode: of the users old
  // enough to have reached day N, how many were active on exactly day N.
  const signupDayByUser = new Map<string, string>();
  for (const u of stats.all_users_timeline || []) {
    const day = toTzDateKey(u.created_at, TZ);
    if (!signupDayByUser.has(u.user_id)) signupDayByUser.set(u.user_id, day);
  }
  const activeDaysByUser = new Map<string, Set<number>>();
  for (const e of collectMeaningfulEvents(stats)) {
    const signupDay = signupDayByUser.get(e.user_id);
    if (!signupDay) continue;
    const diff = daysBetweenDateKeys(signupDay, toTzDateKey(e.created_at, TZ));
    if (diff < 1) continue;
    let set = activeDaysByUser.get(e.user_id);
    if (!set) { set = new Set(); activeDaysByUser.set(e.user_id, set); }
    set.add(diff);
  }
  const ageByUser = Array.from(signupDayByUser.entries()).map(([userId, signupDay]) => ({
    userId,
    age: daysBetweenDateKeys(signupDay, today),
  }));

  const curve = Array.from({ length: MAX_RETENTION_DAY }, (_, i) => {
    const day = i + 1;
    let eligible = 0;
    let returned = 0;
    for (const u of ageByUser) {
      if (u.age < day) continue;
      eligible += 1;
      if (activeDaysByUser.get(u.userId)?.has(day)) returned += 1;
    }
    return { day, ratePct: eligible > 0 ? (returned / eligible) * 100 : 0, eligible, returned };
  });

  const rateOf = (day: number) => curve[day - 1] ?? { ratePct: 0, eligible: 0, returned: 0 };
  const d7 = rateOf(7);

  return {
    eyebrow: 'Retention',
    headline: 'How many people come back after they sign up.',
    description:
      'Day-N retention counts users who were active exactly N days after signing up, among those old enough to have reached day N.',
    metrics: [
      { label: 'DAU', value: formatCount(dau), note: `Active today (${today})` },
      { label: 'MAU', value: formatCount(mau), note: 'Rolling last 30 days' },
      { label: 'DAU / MAU', value: mau > 0 ? formatPct(dau / mau, 1) : '—', note: 'Product stickiness' },
      { label: 'D7 retention', value: d7.eligible > 0 ? `${d7.ratePct.toFixed(1)}%` : '—', note: `${formatCount(d7.returned)} of ${formatCount(d7.eligible)} eligible` },
    ],
    chart: {
      eyebrow: 'Retention curve',
      title: 'Day 1 to day 30 after signup',
      note: 'Exact-day retention',
      labels: curve.map((p) => `D${p.day}`),
      tooltips: curve.map(
        (p) => `Day ${p.day} · ${formatCount(p.returned)} of ${formatCount(p.eligible)} eligible`,
      ),
      format: 'percent',
      series: [{ label: 'Retention', values: curve.map((p) => p.ratePct) }],
    },
    bars: {
      eyebrow: 'Key days',
      title: 'Milestone retention',
      bars: KEY_RETENTION_DAYS.map((day) => {
        const point = rateOf(day);
        return {
          label: `D${day}`,
          value: point.ratePct,
          display: point.eligible > 0 ? `${point.ratePct.toFixed(1)}%` : '—',
          caption: `${formatCount(point.returned)} of ${formatCount(point.eligible)} eligible`,
        };
      }),
      callout: {
        value: rateOf(1).eligible > 0 ? `${rateOf(1).ratePct.toFixed(1)}%` : '—',
        label: 'come back on day 1',
      },
    },
  };
}

function deriveAnalytics(stats: StatsResponse): TabView {
  const rows: UserAnalytics[] = stats.user_analytics ?? [];
  const countries = aggregateCounts(rows, (r) => r.country);
  const identities = aggregateCounts(rows, (r) => r.identity);
  const functions = aggregateMostUsedFunctions(rows);

  // Same nationality/country split the real Analytics tab uses.
  const isChineseNat = (s: string | null) => {
    const lower = s?.toLowerCase().trim();
    return lower === 'china' || lower === 'chinese' || lower === 'cn';
  };
  const CHINA_COUNTRY_KEYS = ['china', 'chinese mainland', 'cn', 'mainland china'];
  const isChineseCountry = (s: string | null) =>
    !!s && CHINA_COUNTRY_KEYS.includes(s.toLowerCase().trim());

  let overseas = 0;
  for (const r of rows) {
    if (isChineseNat(r.nationality) && !isChineseCountry(r.country)) overseas += 1;
  }

  const topCountry = topEntry(countries);
  const topIdentity = topEntry(identities);
  const topFunction = topEntry(functions);

  return {
    eyebrow: 'User Analytics',
    headline: 'Where users come from, who they are, and what they use.',
    description: `Derived from ${formatCount(rows.length)} analyzed user profiles.`,
    metrics: [
      { label: 'Top country', value: topCountry?.name ?? '—', note: topCountry ? `${share(topCountry.value, rows.length)} of analyzed users` : 'No data' },
      { label: 'Top identity', value: topIdentity?.name ?? '—', note: topIdentity ? `${share(topIdentity.value, rows.length)} self-reported` : 'No data' },
      { label: 'Most used function', value: topFunction?.name ?? '—', note: topFunction ? `${formatCount(topFunction.value)} uses` : 'No data' },
      { label: 'Overseas Chinese', value: share(overseas, rows.length), note: 'Chinese nationality, outside mainland' },
    ],
    rankings: [
      { eyebrow: 'Geography', title: 'Users by country', entries: countries.slice(0, RANKING_ROWS), total: rows.length },
      { eyebrow: 'Identity', title: 'Self-reported identity', entries: identities.slice(0, RANKING_ROWS), total: rows.length },
    ],
    empty: rows.length === 0 ? 'No user analytics rows returned by the API.' : undefined,
  };
}

function derivePollData(stats: StatsResponse): TabView {
  const rows: UserPollData[] = stats.user_poll_data ?? [];
  const sources = aggregateJsonbColumn(rows, (r) => r.user_acquisition_sources);

  const countryCounts = new Map<string, number>();
  let withCountry = 0;
  for (const row of rows) {
    const seen = new Set(extractLoginIpCountries(row.login_ip));
    if (seen.size > 0) withCountry += 1;
    for (const c of seen) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  }
  const countries = Array.from(countryCounts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const top = topEntry(sources);
  const second = sources[1] ?? null;

  return {
    eyebrow: 'User Poll Data',
    headline: 'How people found the product, and where they log in from.',
    description: `Based on ${formatCount(rows.length)} poll responses.`,
    metrics: [
      { label: 'Responses', value: formatCount(rows.length), note: 'Users with poll data' },
      { label: 'Top source', value: top?.name ?? '—', note: top ? `${share(top.value, rows.length)} of responses` : 'No data' },
      { label: 'Runner-up', value: second?.name ?? '—', note: second ? `${share(second.value, rows.length)} of responses` : 'No data' },
      { label: 'Known login country', value: share(withCountry, rows.length), note: 'Rows with usable country' },
    ],
    rankings: [
      { eyebrow: 'Acquisition', title: 'How users found us', entries: sources.slice(0, RANKING_ROWS), total: rows.length },
      { eyebrow: 'Geography', title: 'Login country', entries: countries.slice(0, RANKING_ROWS), total: rows.length },
    ],
    empty: rows.length === 0 ? 'No poll data rows returned by the API.' : undefined,
  };
}

function deriveTopUsers(stats: StatsResponse): TabView {
  const end = todayTzKey(TZ);
  const start = addDays(end, -(GROWTH_DAYS - 1));

  const labelByUser = new Map<string, string>();
  const addLabel = (uid: string, label: string | null | undefined) => {
    const trimmed = label?.trim();
    if (uid && trimmed && !labelByUser.has(uid)) labelByUser.set(uid, trimmed);
  };
  for (const u of stats.all_users_basic || []) addLabel(u.user_id, u.email || u.username);
  for (const u of stats.latest_users || []) addLabel(u.user_id, u.email || u.username);
  const friendly = (uid: string) => labelByUser.get(uid) ?? `${uid.slice(0, 8)}…`;

  const analyticsByUser = new Map<string, UserAnalytics>();
  for (const a of stats.user_analytics ?? []) analyticsByUser.set(a.user_id, a);

  const counts = new Map<string, number>();
  let totalConversations = 0;
  for (const c of stats.conversation_history || []) {
    const day = toTzDateKey(c.created_at, TZ);
    if (day < start || day > end) continue;
    counts.set(c.user_id, (counts.get(c.user_id) ?? 0) + 1);
    totalConversations += 1;
  }

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, TOP_K);

  return {
    eyebrow: 'Top Users',
    headline: 'The people driving the most conversations.',
    description: `Ranked by conversation count between ${start} and ${end}.`,
    metrics: [
      { label: 'Top user', value: formatCount(top[0]?.[1] ?? 0), note: top[0] ? `Conversations by ${friendly(top[0][0])}` : 'No data' },
      { label: 'Active users', value: formatCount(counts.size), note: 'In the last 30 days' },
      { label: 'Conversations', value: formatCount(totalConversations), note: 'In the last 30 days' },
      { label: 'Avg per user', value: counts.size > 0 ? (totalConversations / counts.size).toFixed(1) : '—', note: 'Conversations per active user' },
    ],
    rankings: [
      {
        eyebrow: 'Ranking',
        title: `Top ${top.length} by conversations`,
        entries: top.map(([uid, value]) => ({ name: friendly(uid), value })),
        total: totalConversations,
      },
    ],
    table: {
      eyebrow: 'Top users',
      title: 'Conversation leaders and their profile',
      columns: ['User', 'Conversations', 'Country', 'Identity'],
      rows: top.map(([uid, conversations]) => {
        const a = analyticsByUser.get(uid);
        return [friendly(uid), formatCount(conversations), a?.country || '—', a?.identity || '—'];
      }),
    },
    empty: counts.size === 0 ? 'No conversations in the last 30 days.' : undefined,
  };
}

function derivePaid(stats: StatsResponse, paid: PaidStatsResponse | null, error: string | null): TabView {
  const base: TabView = {
    eyebrow: 'Paid',
    headline: 'Subscriptions, billing mix, and paid conversion.',
    metrics: [],
  };

  if (!paid) {
    return { ...base, empty: error ? `Failed to load paid stats — ${error}` : 'Loading paid stats…' };
  }

  const subs = paid.subscriptions || [];
  const activeSubs = subs.filter((s) => s.status === 'active');
  const activeUsers = new Set(activeSubs.map((s) => s.user_id));
  const realPaidUsers = new Set(
    activeSubs.filter((s) => bucketOfBillingReason(s.billing_reason) === 'paid').map((s) => s.user_id),
  );

  const since = addDays(todayTzKey(TZ), -(GROWTH_DAYS - 1));
  const newPaid = subs.filter((s) => {
    if (bucketOfBillingReason(s.billing_reason) !== 'paid') return false;
    const stamp = s.started_at || s.created_at;
    return !!stamp && toTzDateKey(stamp, TZ) >= since;
  }).length;

  const buckets = aggregateCounts(subs, (s) => bucketOfBillingReason(s.billing_reason));
  const tiers = aggregateCounts(activeSubs, (s) => s.tier);

  return {
    ...base,
    description: `${formatCount(subs.length)} subscription rows from \`${paid.table_name}\`.`,
    metrics: [
      { label: 'Active subscribers', value: formatCount(activeUsers.size), note: `${formatCount(activeSubs.length)} active subscriptions` },
      { label: 'Paying users', value: formatCount(realPaidUsers.size), note: 'Excludes invites and manual grants' },
      { label: 'Paid rate', value: share(realPaidUsers.size, stats.total_users), note: 'Of all registered users' },
      { label: 'New paid', value: formatCount(newPaid), note: 'Paid subscriptions, last 30 days' },
    ],
    rankings: [
      { eyebrow: 'Billing', title: 'Subscriptions by billing reason', entries: buckets, total: subs.length },
      { eyebrow: 'Plans', title: 'Active subscriptions by tier', entries: tiers, total: activeSubs.length },
    ],
    empty: subs.length === 0 ? 'No subscription rows returned by the API.' : undefined,
  };
}

function deriveUtm(utm: UtmStatsResponse | null, error: string | null): TabView {
  const base: TabView = {
    eyebrow: 'UTM Tracking',
    headline: 'Which campaigns actually bring people in.',
    metrics: [],
  };

  if (!utm) {
    return { ...base, empty: error ? `Failed to load UTM stats — ${error}` : 'Loading UTM data…' };
  }

  const users: UtmUser[] = utm.users || [];
  const field = (u: UtmUser, key: string) => {
    const v = u.utm_data?.[key];
    return v ? String(v) : null;
  };
  const sources = aggregateCounts(users, (u) => field(u, 'utm_source'));
  const mediums = aggregateCounts(users, (u) => field(u, 'utm_medium'));
  const campaigns = aggregateCounts(users, (u) => field(u, 'utm_campaign'));

  const topSource = topEntry(sources);
  const topMedium = topEntry(mediums);
  const topCampaign = topEntry(campaigns);

  const recent = [...users]
    .sort((a, b) => (b.signup_at ?? '').localeCompare(a.signup_at ?? ''))
    .slice(0, TABLE_ROWS);

  return {
    ...base,
    description: `${formatCount(utm.total)} users arrived with UTM parameters attached.`,
    metrics: [
      { label: 'Tracked users', value: formatCount(users.length), note: 'Signups with UTM data' },
      { label: 'Top source', value: topSource?.name ?? '—', note: topSource ? `${share(topSource.value, users.length)} of tracked` : 'No data' },
      { label: 'Top medium', value: topMedium?.name ?? '—', note: topMedium ? `${share(topMedium.value, users.length)} of tracked` : 'No data' },
      { label: 'Top campaign', value: topCampaign?.name ?? '—', note: topCampaign ? `${share(topCampaign.value, users.length)} of tracked` : 'No data' },
    ],
    rankings: [
      { eyebrow: 'Source', title: 'Users by utm_source', entries: sources.slice(0, RANKING_ROWS), total: users.length },
      { eyebrow: 'Medium', title: 'Users by utm_medium', entries: mediums.slice(0, RANKING_ROWS), total: users.length },
    ],
    table: {
      eyebrow: 'Latest tracked signups',
      title: 'Most recent users with campaign data',
      columns: ['User', 'Source', 'Medium', 'Campaign', 'Signed up'],
      rows: recent.map((u) => [
        u.email || `${u.user_id.slice(0, 8)}…`,
        field(u, 'utm_source') || '—',
        field(u, 'utm_medium') || '—',
        field(u, 'utm_campaign') || '—',
        formatDateTime(u.signup_at),
      ]),
    },
    empty: users.length === 0 ? 'No users with UTM data yet.' : undefined,
  };
}

function deriveUserQueries(
  queries: UserQueriesResponse | null,
  loading: boolean,
  error: string | null,
): TabView {
  const base: TabView = {
    eyebrow: 'User Queries',
    headline: 'What people are actually asking.',
    description: `Conversation-level questions from the last ${QUERIES_LOOKBACK_DAYS} days. Loaded on demand — this query is heavy.`,
    metrics: [],
  };

  if (!queries) {
    return {
      ...base,
      empty: error
        ? `Failed to load user queries — ${error}`
        : loading
          ? 'Loading user queries…'
          : 'Nothing loaded yet.',
    };
  }

  const conversations = queries.conversations || [];
  const uniqueUsers = new Set(conversations.map((c) => c.user_id)).size;
  const totalRounds = conversations.reduce((sum, c) => sum + (c.rounds_of_user_message || 0), 0);

  const recent = [...conversations]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, TABLE_ROWS);

  const preview = (text: string) => (text.length > 90 ? `${text.slice(0, 90)}…` : text);

  return {
    ...base,
    metrics: [
      { label: 'Conversations', value: formatCount(queries.total_conversations), note: `${formatDateTime(queries.start)} → ${formatDateTime(queries.end)}` },
      { label: 'Unique users', value: formatCount(uniqueUsers), note: 'Asked at least once' },
      { label: 'User messages', value: formatCount(totalRounds), note: 'Total rounds in range' },
      { label: 'Avg rounds', value: conversations.length > 0 ? (totalRounds / conversations.length).toFixed(1) : '—', note: 'Per conversation' },
    ],
    table: {
      eyebrow: 'Recent questions',
      title: 'First message of the newest conversations',
      columns: ['Started', 'Rounds', 'First message'],
      rows: recent.map((c) => [
        formatDateTime(c.created_at),
        String(c.rounds_of_user_message ?? 0),
        preview(
          typeof c.user_queries?.[0]?.message === 'string'
            ? c.user_queries[0].message
            : '(no user message)',
        ),
      ]),
    },
    empty: conversations.length === 0 ? 'No conversations in this window.' : undefined,
  };
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export function useSample4Data() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [paid, setPaid] = useState<PaidStatsResponse | null>(null);
  const [utm, setUtm] = useState<UtmStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paidError, setPaidError] = useState<string | null>(null);
  const [utmError, setUtmError] = useState<string | null>(null);

  const [queries, setQueries] = useState<UserQueriesResponse | null>(null);
  const [queriesLoading, setQueriesLoading] = useState(false);
  const [queriesError, setQueriesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const [statsResult, paidResult, utmResult] = await Promise.allSettled([
        getStats(),
        getPaidStats(),
        getUtmStats(),
      ]);
      if (cancelled) return;

      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      else setError(errorMessage(statsResult.reason));

      if (paidResult.status === 'fulfilled') setPaid(paidResult.value);
      else setPaidError(errorMessage(paidResult.reason));

      if (utmResult.status === 'fulfilled') setUtm(utmResult.value);
      else setUtmError(errorMessage(utmResult.reason));

      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const loadQueries = useCallback(async (startOverride?: string, endOverride?: string) => {
    setQueriesLoading(true);
    setQueriesError(null);
    try {
      const start = startOverride ?? addDays(todayTzKey(TZ), -QUERIES_LOOKBACK_DAYS);
      setQueries(await getUserQueries(start, endOverride));
    } catch (err) {
      setQueriesError(errorMessage(err));
    } finally {
      setQueriesLoading(false);
    }
  }, []);

  const views = useMemo<Record<string, TabView> | null>(() => {
    if (!stats) return null;
    return {
      general: deriveGeneral(stats),
      retention: deriveRetention(stats),
      analytics: deriveAnalytics(stats),
      pollData: derivePollData(stats),
      topUsers: deriveTopUsers(stats),
      paid: derivePaid(stats, paid, paidError),
      utmTracking: deriveUtm(utm, utmError),
    };
  }, [stats, paid, paidError, utm, utmError]);

  const userQueriesView = useMemo(
    () => deriveUserQueries(queries, queriesLoading, queriesError),
    [queries, queriesLoading, queriesError],
  );

  return {
    stats,
    paid,
    utm,
    loading,
    error,
    paidError,
    utmError,
    views,
    userQueries: {
      view: userQueriesView,
      data: queries,
      error: queriesError,
      loaded: queries !== null,
      loading: queriesLoading,
      load: loadQueries,
    },
  };
}
