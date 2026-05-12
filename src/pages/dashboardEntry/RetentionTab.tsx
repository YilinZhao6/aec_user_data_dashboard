import { useState } from 'react';
import { RetentionPoint, MauMode, KEY_RETENTION_DAYS, formatRatio } from './dashboardUtils';
import { CumulativeRetentionChart, SignupRangeFilter } from './dashboardCharts';

export default function RetentionTab({
  dauStats,
  dauDate,
  setDauDate,
  mauStats,
  mauWindow,
  mauMode,
  setMauMode,
  mauMonth,
  setMauMonth,
  mauEndDate,
  setMauEndDate,
  dauMauRatio,
  cumulativeRetention,
  signupRange,
  setSignupRange,
  signupBounds,
  retentionMode,
  setRetentionMode,
}: {
  dauStats: { activeUsers: number; newSignups: number };
  dauDate: string;
  setDauDate: (d: string) => void;
  mauStats: { activeUsers: number; newSignups: number };
  mauWindow: { start: string; end: string; label: string };
  mauMode: MauMode;
  setMauMode: (m: MauMode) => void;
  mauMonth: string;
  setMauMonth: (m: string) => void;
  mauEndDate: string;
  setMauEndDate: (d: string) => void;
  dauMauRatio: number;
  cumulativeRetention: RetentionPoint[];
  signupRange: { start: string; end: string };
  setSignupRange: (r: { start: string; end: string }) => void;
  signupBounds: { min: string; max: string } | null;
  retentionMode: 'exact' | 'rolling';
  setRetentionMode: (m: 'exact' | 'rolling') => void;
}) {
  const retentionAt = (n: number): RetentionPoint =>
    cumulativeRetention[n - 1] ?? { day: n, ratePct: 0, returned: 0, eligible: 0, hasData: false, mature: false };

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">DAU</div>
          <div className="stat-card-control">
            <input type="date" value={dauDate} onChange={(e) => setDauDate(e.target.value)} />
          </div>
          <div className="stat-value">{dauStats.activeUsers}</div>
          <div className="stat-sub">
            Unique users with conversations on {dauDate}
            <br />
            {dauStats.newSignups} new signup{dauStats.newSignups === 1 ? '' : 's'} on this day
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">MAU</div>
          <div className="stat-card-control">
            <div className="stat-segmented">
              <button type="button" className={`stat-segmented-btn ${mauMode === 'rolling' ? 'active' : ''}`} onClick={() => setMauMode('rolling')}>Last 30d</button>
              <button type="button" className={`stat-segmented-btn ${mauMode === 'month' ? 'active' : ''}`} onClick={() => setMauMode('month')}>Month</button>
              <button type="button" className={`stat-segmented-btn ${mauMode === 'endDate' ? 'active' : ''}`} onClick={() => setMauMode('endDate')}>End date</button>
            </div>
            {mauMode === 'month' && <input type="month" value={mauMonth} onChange={(e) => setMauMonth(e.target.value)} />}
            {mauMode === 'endDate' && <input type="date" value={mauEndDate} onChange={(e) => setMauEndDate(e.target.value)} />}
          </div>
          <div className="stat-value">{mauStats.activeUsers}</div>
          <div className="stat-sub">
            {mauWindow.label} · {mauWindow.start} → {mauWindow.end}
            <br />
            {mauStats.newSignups} new signup{mauStats.newSignups === 1 ? '' : 's'} in this period
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">DAU : MAU</div>
          <div className="stat-value">{formatRatio(dauMauRatio, mauStats.activeUsers)}</div>
          <div className="stat-sub">Stickiness · 1.0 means used every day</div>
        </div>
      </div>

      <div className="stats-grid">
        {KEY_RETENTION_DAYS.map((day) => {
          const p = retentionAt(day);
          const showValue = p.hasData && p.mature;
          const modeLabel = retentionMode === 'exact' ? 'Exact' : 'Rolling';
          return (
            <div className="stat-card" key={`retention-${day}`}>
              <div className="stat-label">D{day} {modeLabel}</div>
              <div className="stat-value">{showValue ? `${p.ratePct.toFixed(1)}%` : '—'}</div>
              <div className="stat-sub">
                {p.mature
                  ? `${p.returned} / ${p.eligible} eligible users`
                  : 'No cohort user has reached this day yet'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title-group">
            <h2>Day-N Return Retention</h2>
            <p className="section-subtitle">
              {retentionMode === 'exact'
                ? '精确日留存（Exact-day）：第 N 天当天是否有活动。'
                : '滚动留存（Rolling）：第 N 天及之后是否有过任意活动。'}
              {' '}Eligible = signed up at least N full days ago.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="stat-segmented">
              <button type="button" className={`stat-segmented-btn${retentionMode === 'exact' ? ' active' : ''}`} onClick={() => setRetentionMode('exact')}>Exact-day</button>
              <button type="button" className={`stat-segmented-btn${retentionMode === 'rolling' ? ' active' : ''}`} onClick={() => setRetentionMode('rolling')}>Rolling</button>
            </div>
            <SignupRangeFilter
              start={signupRange.start}
              end={signupRange.end}
              minDate={signupBounds?.min}
              maxDate={signupBounds?.max}
              onChange={setSignupRange}
              onReset={() => setSignupRange({ start: '', end: '' })}
            />
          </div>
        </div>
        <div className="chart-container">
          <CumulativeRetentionChart data={cumulativeRetention} />
        </div>
      </div>
    </>
  );
}
