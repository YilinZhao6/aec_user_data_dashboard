import React, { useState } from 'react';
import { CountEntry, RankingMode, todayTzKey, addDays } from './dashboardUtils';
import { RankingBarChart, SignupRangeFilter } from './dashboardCharts';

export type TopUserRow = {
  user_id: string;
  label: string;
  conversations: number;
  identity: string | null;
  country: string | null;
  nationality: string | null;
  initialUsedFunction: string | null;
  mostUsedFunctions: Array<{ count: number; function: string }> | null;
  loginIp: unknown;
  acquisitionSources: unknown;
};

export type TopUsersData = {
  data: CountEntry[];
  rows: TopUserRow[];
  totalConversations: number;
  activeUsers: number;
};

export default function TopUsersTab({
  topUsers,
  topK,
  setTopK,
  topUsersRange,
  setTopUsersRange,
  conversationBounds,
  tzOffsetMs,
  role = 'admin',
}: {
  topUsers: TopUsersData;
  topK: number;
  setTopK: (k: number) => void;
  topUsersRange: { start: string; end: string };
  setTopUsersRange: (r: { start: string; end: string }) => void;
  conversationBounds: { min: string; max: string } | null;
  tzOffsetMs: number;
  role?: string;
}) {
  const [topUsersMode, setTopUsersMode] = useState<RankingMode>('count');
  const [topUserExpanded, setTopUserExpanded] = useState<string | null>(null);

  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>Top K:</span>
        <input
          type="number"
          min={1}
          max={500}
          value={topK}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v) && v >= 1) setTopK(v);
          }}
          style={{ width: 70, padding: '4px 8px', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
        />
        <span style={{ fontSize: 12, color: '#aaa' }}>users shown in bar chart and detail table</span>
      </div>

      <div className="section-header">
        <div className="section-title-group">
          <h2>Top Users by Conversations 用户对话数排名</h2>
          <p className="section-subtitle">
            Most active users (by conversation count) inside the selected window.
            Email shown when known, otherwise a truncated user_id.
          </p>
          {role === 'admin' && (
            <p className="section-meta">
              <strong>{topUsers.totalConversations.toLocaleString()}</strong>{' '}
              conversations · <strong>{topUsers.activeUsers}</strong> active
              user{topUsers.activeUsers === 1 ? '' : 's'} ·{' '}
              <strong>{topUsersRange.start}</strong> → <strong>{topUsersRange.end}</strong>
            </p>
          )}
        </div>
        <div className="top-users-controls">
          <SignupRangeFilter
            start={topUsersRange.start}
            end={topUsersRange.end}
            minDate={conversationBounds?.min}
            maxDate={conversationBounds?.max}
            onChange={setTopUsersRange}
            onReset={() => {
              const end = conversationBounds?.max ?? todayTzKey(tzOffsetMs);
              setTopUsersRange({ start: addDays(end, -29), end });
            }}
          />
          {role === 'admin' && (
            <div className="stat-segmented">
              <button type="button" className={`stat-segmented-btn ${topUsersMode === 'count' ? 'active' : ''}`} onClick={() => setTopUsersMode('count')}>Count</button>
              <button type="button" className={`stat-segmented-btn ${topUsersMode === 'percent' ? 'active' : ''}`} onClick={() => setTopUsersMode('percent')}>Percentage</button>
            </div>
          )}
        </div>
      </div>

      {role === 'admin' && (
        <div className="chart-container">
          <RankingBarChart data={topUsers.data} mode={topUsersMode} valueLabel="Conversations" />
        </div>
      )}

      {topUsers.rows.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#555' }}>
              Top {topUsers.rows.length} Users Details
            </h3>
          </div>
          <div className="table-container">
            <table className="paid-users-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>User</th>
                  <th>Identity</th>
                  <th>Country</th>
                  {role === 'admin' && <th>Convs</th>}
                  <th title="Initial used function">Init Fn</th>
                  <th title="Top used functions (top 3)">Top Fns</th>
                  <th title="Acquisition source">Source</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.rows.map((row) => {
                  const isExpanded = topUserExpanded === row.user_id;
                  const top3 = Array.isArray(row.mostUsedFunctions)
                    ? [...row.mostUsedFunctions].sort((a, b) => b.count - a.count).slice(0, 3)
                    : [];
                  const sourceStr =
                    row.acquisitionSources == null
                      ? '—'
                      : Array.isArray(row.acquisitionSources)
                        ? (row.acquisitionSources as string[]).join(', ')
                        : typeof row.acquisitionSources === 'string'
                          ? row.acquisitionSources
                          : JSON.stringify(row.acquisitionSources);
                  return (
                    <React.Fragment key={row.user_id}>
                      <tr
                        onClick={() => setTopUserExpanded(isExpanded ? null : row.user_id)}
                        style={{ cursor: row.loginIp != null ? 'pointer' : 'default' }}
                      >
                        <td style={{ textAlign: 'center', color: '#999' }}>
                          {row.loginIp != null ? (isExpanded ? '▾' : '▸') : ''}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.label}>
                          {row.label}
                        </td>
                        <td>{row.identity ?? '—'}</td>
                        <td>
                          {row.country ?? '—'}
                          {row.nationality && row.nationality !== row.country && (
                            <span style={{ color: '#999', fontSize: 11, marginLeft: 4 }}>{row.nationality}</span>
                          )}
                        </td>
                        {role === 'admin' && <td>{row.conversations.toLocaleString()}</td>}
                        <td style={{ fontSize: 11, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.initialUsedFunction ?? undefined}>
                          {row.initialUsedFunction ?? '—'}
                        </td>
                        <td style={{ fontSize: 11, color: '#555', maxWidth: 180 }}>
                          {top3.length > 0 ? top3.map((f) => f.function).join(' · ') : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: '#555', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sourceStr !== '—' ? sourceStr : undefined}>
                          {sourceStr}
                        </td>
                      </tr>
                      {isExpanded && row.loginIp != null && (
                        <tr>
                          <td />
                          <td colSpan={7}>
                            <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 6, fontSize: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                                <span style={{ color: '#888', whiteSpace: 'nowrap' }}>Login IP:</span>
                                <span style={{
                                  display: 'inline-block', maxWidth: 420, maxHeight: 80,
                                  overflowY: 'auto', overflowX: 'auto', verticalAlign: 'top',
                                  background: '#f5f5f5', padding: '2px 6px', borderRadius: 3,
                                  fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                }}>
                                  {typeof row.loginIp === 'string' ? row.loginIp : JSON.stringify(row.loginIp, null, 2)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
