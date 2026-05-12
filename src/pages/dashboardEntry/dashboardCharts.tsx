// Shared chart and UI components used across multiple tab files.
import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  ReferenceArea,
} from 'recharts';
import { ResponsivePie } from '@nivo/pie';
import {
  TimeRange,
  RankingMode,
  RetentionPoint,
  CountEntry,
  BreakdownGroup,
  CATEGORICAL_COLORS,
  MAX_RETENTION_DAY,
  KEY_RETENTION_DAYS,
} from './dashboardUtils';

// ---------------------------------------------------------------------------
// Time range selector
// ---------------------------------------------------------------------------
export function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  return (
    <div className="time-range-selector">
      {(['12h', '1d', '7d', '30d'] as TimeRange[]).map((range) => (
        <button
          key={range}
          className={`time-range-btn ${value === range ? 'active' : ''}`}
          onClick={() => onChange(range)}
        >
          {range}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signup range filter (date pickers)
// ---------------------------------------------------------------------------
export function SignupRangeFilter({
  start,
  end,
  minDate,
  maxDate,
  onChange,
  onReset,
}: {
  start: string;
  end: string;
  minDate?: string;
  maxDate?: string;
  onChange: (next: { start: string; end: string }) => void;
  onReset: () => void;
}) {
  return (
    <div className="signup-range-filter">
      <label className="signup-range-label">
        <span>Signup from</span>
        <input
          type="date"
          value={start}
          min={minDate}
          max={end || maxDate}
          onChange={(e) => onChange({ start: e.target.value, end })}
        />
      </label>
      <label className="signup-range-label">
        <span>to</span>
        <input
          type="date"
          value={end}
          min={start || minDate}
          max={maxDate}
          onChange={(e) => onChange({ start, end: e.target.value })}
        />
      </label>
      <button type="button" className="signup-range-reset" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple line chart
// ---------------------------------------------------------------------------
export function StatLineChart({
  data,
  dataKey,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="time" stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }} />
        <YAxis stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '12px' }}
          labelStyle={{ color: '#333333', marginBottom: '4px' }}
        />
        <Line type="monotone" dataKey={dataKey} stroke="#333333" strokeWidth={2} dot={{ fill: '#333333', r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Stacked bar chart (new vs returning)
// ---------------------------------------------------------------------------
export function StackedBarChart({
  data,
  newKey,
  returningKey,
  totalKey,
  newLabel,
  returningLabel,
}: {
  data: Array<Record<string, string | number>>;
  newKey: string;
  returningKey: string;
  totalKey: string;
  newLabel: string;
  returningLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 24, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="time" stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }} />
        <YAxis stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '12px' }}
          labelStyle={{ color: '#333333', marginBottom: '4px' }}
          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
        />
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} iconType="square" />
        <Bar dataKey={newKey} stackId="a" fill="#4285f4" name={newLabel} isAnimationActive={false} />
        <Bar dataKey={returningKey} stackId="a" fill="#fb8c00" name={returningLabel} isAnimationActive={false}>
          <LabelList dataKey={totalKey} position="top" fill="#333333" fontSize={11} fontWeight={500}
            formatter={(value: number | string) => typeof value === 'number' && value > 0 ? value : ''} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Retention chart
// ---------------------------------------------------------------------------
function RetentionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RetentionPoint }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#333333', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)' }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Day {p.day}</div>
      {!p.mature ? (
        <div style={{ color: '#999999' }}>Data not available · no cohort user has reached this day yet</div>
      ) : p.hasData ? (
        <>
          <div>Return rate: <strong>{p.ratePct.toFixed(1)}%</strong></div>
          <div style={{ color: '#666666', marginTop: 2 }}>{p.returned} / {p.eligible} eligible users active on this day</div>
        </>
      ) : (
        <div style={{ color: '#999999' }}>No eligible users yet</div>
      )}
    </div>
  );
}

export function CumulativeRetentionChart({ data }: { data: RetentionPoint[] }) {
  const keyDaySet = new Set<number>(KEY_RETENTION_DAYS);
  const isKeyIndex = (index: number) =>
    index >= 0 && index < data.length && keyDaySet.has(data[index].day) && data[index].mature;

  let firstImmatureDay: number | null = null;
  for (const p of data) {
    if (!p.mature) { firstImmatureDay = p.day; break; }
  }

  const lineData = data.map((p) => ({ ...p, matureRatePct: p.mature ? p.ratePct : null }));

  const renderDot = (props: { cx?: number; cy?: number; index?: number; payload?: RetentionPoint }) => {
    const { cx, cy, index, payload } = props;
    if (cx == null || cy == null || index == null) return <g />;
    if (!payload || !payload.mature) return <g />;
    if (isKeyIndex(index)) return <circle key={`dot-${index}`} cx={cx} cy={cy} r={5.5} fill="#1a1a1a" stroke="#ffffff" strokeWidth={2} />;
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={2.5} fill="#bbbbbb" />;
  };

  const renderKeyDayLabel = (props: { x?: number; y?: number; value?: number; index?: number }) => {
    const { x, y, value, index } = props;
    if (x == null || y == null || value == null || index == null) return <g />;
    if (!isKeyIndex(index)) return <g />;
    return (
      <text x={x} y={Number(y) - 12} fill="#1a1a1a" fontSize={11} fontWeight={600} textAnchor="middle">
        {Number(value).toFixed(1)}%
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={lineData} margin={{ top: 28, right: 24, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="day" type="number" domain={[1, MAX_RETENTION_DAY]} ticks={[1, 7, 14, 21, 30]}
          tickFormatter={(v: number) => `D${v}`} stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }} />
        <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }} />
        <Tooltip content={<RetentionTooltip />} />
        {firstImmatureDay !== null && (
          <ReferenceArea x1={firstImmatureDay} x2={MAX_RETENTION_DAY} y1={0} y2={100}
            fill="#999999" fillOpacity={0.12} stroke="#cccccc" strokeOpacity={0.5} strokeDasharray="4 4"
            label={{ value: 'Data not available', fill: '#888888', fontSize: 12, position: 'insideTop' }}
            ifOverflow="extendDomain" />
        )}
        <Line type="monotone" dataKey="matureRatePct" stroke="#333333" strokeWidth={2}
          dot={renderDot} activeDot={{ r: 5, fill: '#1a1a1a' }} isAnimationActive={false} connectNulls={false}>
          <LabelList content={renderKeyDayLabel} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Pie chart (nivo)
// ---------------------------------------------------------------------------
const PIE_COLORS = CATEGORICAL_COLORS;

export function CountPieChart({
  data,
  topN = 15,
  height = 460,
  hideCount = false,
}: {
  data: CountEntry[];
  topN?: number;
  height?: number;
  /** When true, only show percentages — no raw counts (for restricted roles) */
  hideCount?: boolean;
}) {
  if (data.length === 0) return <div className="empty-state">No data available</div>;
  const total = data.reduce((sum, e) => sum + e.value, 0);
  const sliced: CountEntry[] = (() => {
    if (data.length <= topN) return data;
    const head = data.slice(0, topN);
    const tail = data.slice(topN);
    const otherTotal = tail.reduce((s, e) => s + e.value, 0);
    if (otherTotal <= 0) return head;
    return [...head, { name: `Other (${tail.length})`, value: otherTotal }];
  })();

  const pieData = sliced.map((e) => ({ id: e.name, label: e.name, value: e.value }));
  const colorFor = (idx: number) => PIE_COLORS[idx % PIE_COLORS.length];
  const formatPct = (value: number) => total > 0 ? `${((value / total) * 100).toFixed(1)}%` : '0%';

  return (
    <div className="pie-chart-block">
      <div className="pie-chart-canvas" style={{ height }}>
        <ResponsivePie
          data={pieData}
          margin={{ top: 24, right: 24, bottom: 24, left: 24 }}
          innerRadius={0.55}
          padAngle={0.6}
          cornerRadius={3}
          activeOuterRadiusOffset={10}
          colors={pieData.map((_, i) => colorFor(i))}
          borderWidth={2}
          borderColor="#ffffff"
          enableArcLinkLabels={true}
          arcLinkLabelsSkipAngle={12}
          arcLinkLabelsTextColor="#333333"
          arcLinkLabelsThickness={1.5}
          arcLinkLabelsColor={{ from: 'color' }}
          arcLinkLabel={(d) => `${d.id}`}
          arcLabelsSkipAngle={14}
          arcLabelsTextColor="#ffffff"
          arcLabel={(d) => formatPct(d.value)}
          valueFormat={(v) => hideCount ? formatPct(v) : `${v} (${formatPct(v)})`}
          theme={{
            tooltip: { container: { background: '#ffffff', color: '#333333', fontSize: 12, border: '1px solid #e5e5e5', borderRadius: 8, boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)' } },
            labels: { text: { fontSize: 12, fontWeight: 600 } },
          }}
          animate={false}
        />
      </div>
      <ul className="pie-legend">
        {sliced.map((entry, idx) => (
          <li key={entry.name} className="pie-legend-item">
            <span className="pie-legend-swatch" style={{ backgroundColor: colorFor(idx) }} />
            <span className="pie-legend-name" title={entry.name}>{entry.name}</span>
            <span className="pie-legend-value">
              {hideCount ? formatPct(entry.value) : `${entry.value} · ${formatPct(entry.value)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranking bar chart + section wrapper
// ---------------------------------------------------------------------------
function RankingTooltipContent({
  active,
  payload,
  total,
  valueLabel,
  breakdownGroups,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CountEntry }>;
  total: number;
  valueLabel: string;
  breakdownGroups?: BreakdownGroup[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  const raw = datum.value;
  const pct = total > 0 ? (raw / total) * 100 : 0;
  const visibleGroups = (breakdownGroups ?? [])
    .map((g) => ({ label: g.label, rows: g.data[datum.name] ?? [] }))
    .filter((g) => g.rows.length > 0);
  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e5e5', borderRadius: 8, fontSize: 12, padding: '8px 10px', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)', minWidth: 200, maxWidth: 320 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#222' }}>{datum.name}</div>
      <div style={{ color: '#333' }}>{valueLabel}: <strong>{raw}</strong> ({pct.toFixed(1)}%)</div>
      {visibleGroups.map((group) => {
        const groupTotal = group.rows.reduce((s, e) => s + e.value, 0);
        return (
          <div key={group.label} style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #eee' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{group.label}</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {group.rows.map((b) => {
                const bPct = groupTotal > 0 ? (b.value / groupTotal) * 100 : 0;
                return (
                  <li key={b.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#333', lineHeight: 1.5 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.name}>{b.name}</span>
                    <span style={{ color: '#666', flexShrink: 0 }}>{b.value} · {bPct.toFixed(0)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function RankingBarChart({ data, mode = 'count', valueLabel = 'Count', breakdownGroups }: {
  data: CountEntry[];
  mode?: RankingMode;
  valueLabel?: string;
  breakdownGroups?: BreakdownGroup[];
}) {
  if (data.length === 0) return <div className="empty-state">No data available</div>;
  const height = Math.max(220, data.length * 36 + 40);
  const total = data.reduce((sum, e) => sum + e.value, 0);
  const isPercent = mode === 'percent' && total > 0;
  const chartData = data.map((e) => ({ ...e, display: isPercent ? (e.value / total) * 100 : e.value }));
  const formatBarValue = (v: number) => isPercent ? `${v.toFixed(1)}%` : String(v);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 64, bottom: 8, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
        <XAxis type="number" stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#666666' }}
          allowDecimals={isPercent} domain={isPercent ? [0, 'auto'] : undefined}
          tickFormatter={(v: number) => isPercent ? `${Number(v).toFixed(0)}%` : String(v)} />
        <YAxis type="category" dataKey="name" stroke="#666666" style={{ fontSize: '12px' }} tick={{ fill: '#333333' }} width={140} interval={0} />
        <Tooltip
          content={<RankingTooltipContent total={total} valueLabel={valueLabel} breakdownGroups={breakdownGroups} />}
          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
        />
        <Bar dataKey="display" fill="#4285f4" isAnimationActive={false}>
          <LabelList dataKey="display" position="right" fill="#333333" fontSize={11} fontWeight={500}
            formatter={(v: number | string) => typeof v === 'number' ? formatBarValue(v) : String(v)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RankingSection({
  title,
  subtitle,
  note,
  data,
  valueLabel = 'Count',
  pointLabel = 'data points',
  breakdownGroups,
  hideCount = false,
}: {
  title: string;
  subtitle?: string;
  /** Small italicised note shown below subtitle */
  note?: string;
  data: CountEntry[];
  valueLabel?: string;
  pointLabel?: string;
  breakdownGroups?: BreakdownGroup[];
  /** When true, force percentage-only display and hide the Count button */
  hideCount?: boolean;
}) {
  const [mode, setMode] = useState<RankingMode>('count');
  const effectiveMode: RankingMode = hideCount ? 'percent' : mode;
  const total = data.reduce((sum, e) => sum + e.value, 0);
  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title-group">
          <h2>{title}</h2>
          {subtitle && <p className="section-subtitle">{subtitle}</p>}
          {note && <p className="section-subtitle" style={{ fontStyle: 'italic', color: '#aaa', marginTop: 2 }}>{note}</p>}
          <p className="section-meta">
            {!hideCount && <><strong>{total.toLocaleString()}</strong> {pointLabel} · </>}
            <strong>{data.length}</strong> categor{data.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        {!hideCount && (
          <div className="stat-segmented">
            <button type="button" className={`stat-segmented-btn ${mode === 'count' ? 'active' : ''}`} onClick={() => setMode('count')}>Count</button>
            <button type="button" className={`stat-segmented-btn ${mode === 'percent' ? 'active' : ''}`} onClick={() => setMode('percent')}>Percentage</button>
          </div>
        )}
      </div>
      <div className="chart-container">
        <RankingBarChart data={data} mode={effectiveMode} valueLabel={valueLabel} breakdownGroups={breakdownGroups} />
      </div>
    </div>
  );
}
