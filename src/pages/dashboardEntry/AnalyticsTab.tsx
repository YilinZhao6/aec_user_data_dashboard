import { CountEntry, BreakdownGroup } from './dashboardUtils';
import { CountPieChart, RankingSection } from './dashboardCharts';
import type { UserRole } from '../../auth/AuthContext';

type AnalyticsData = {
  country: CountEntry[];
  nationality: CountEntry[];
  identity: CountEntry[];
  initialUsedFunction: CountEntry[];
  mostUsedFunction: CountEntry[];
  identityCountries: Record<string, CountEntry[]>;
  identityNationalities: Record<string, CountEntry[]>;
  initialUsedFunctionCountries: Record<string, CountEntry[]>;
  initialUsedFunctionNationalities: Record<string, CountEntry[]>;
  studentBreakdown: [string, number][];
};

export default function AnalyticsTab({ analyticsData, role = 'admin' }: { analyticsData: AnalyticsData; role?: UserRole }) {
  const hideCount = role !== 'admin';

  const identityBreakdowns: BreakdownGroup[] = [
    { label: 'Top 5 countries', data: analyticsData.identityCountries },
    { label: 'Top 5 nationalities', data: analyticsData.identityNationalities },
  ];
  const initialFnBreakdowns: BreakdownGroup[] = [
    { label: 'Top 5 countries', data: analyticsData.initialUsedFunctionCountries },
    { label: 'Top 5 nationalities', data: analyticsData.initialUsedFunctionNationalities },
  ];

  const studentPieData: CountEntry[] = analyticsData.studentBreakdown.map(([name, value]) => ({ name, value }));
  const studentTotal = studentPieData.reduce((s, e) => s + e.value, 0);

  return (
    <>
      <div className="chart-grid-2">
        <div className="section">
          <h2>使用地区 · Country</h2>
          <p className="section-subtitle">
            From <code>user_analytics.country</code> ·{' '}
            {hideCount ? `${analyticsData.country.length} countries` : `${analyticsData.country.reduce((s, e) => s + e.value, 0)} users across ${analyticsData.country.length} countries`}
          </p>
          <div className="chart-container">
            <CountPieChart data={analyticsData.country} hideCount={hideCount} />
          </div>
        </div>
        <div className="section">
          <h2>Nationality 国籍</h2>
          <p className="section-subtitle">
            From <code>user_analytics.nationality</code> ·{' '}
            {hideCount ? `${analyticsData.nationality.length} nationalities` : `${analyticsData.nationality.reduce((s, e) => s + e.value, 0)} users across ${analyticsData.nationality.length} nationalities`}
          </p>
          <div className="chart-container">
            <CountPieChart data={analyticsData.nationality} hideCount={hideCount} />
          </div>
        </div>
      </div>

      <div className="section">
        <h2>用户构成分类 · 中国大陆 / 海外华人 / 纯外国人（好像不是特别准 仅供参考）</h2>
        <p className="section-subtitle">
          按国籍与使用地区综合判断{hideCount ? '' : <>，共 <strong>{studentTotal}</strong> 名用户</>}：
          &nbsp;🇨🇳 中国大陆用户（国籍中国 + 在中国）
          &nbsp;·&nbsp;🌏 海外华人（国籍中国 + 在国外）
          &nbsp;·&nbsp;🌍 纯外国人（国籍非中国）
          &nbsp;·&nbsp;❓ 未知国籍
        </p>
        <div className="chart-container">
          <CountPieChart data={studentPieData} topN={10} height={380} hideCount={hideCount} />
        </div>
      </div>

      <RankingSection
        title="Identity 身份排名"
        subtitle="Number of users per identity, sorted high-to-low. Hover a bar to see the top 5 countries and nationalities for that identity."
        data={analyticsData.identity}
        valueLabel="Users"
        pointLabel="users"
        breakdownGroups={identityBreakdowns}
        hideCount={hideCount}
      />

      <RankingSection
        title="Initial Used Function 初始使用功能排名"
        subtitle="Number of users whose first action used each function. Hover a bar to see the top 5 countries and nationalities for that function."
        data={analyticsData.initialUsedFunction}
        valueLabel="Users"
        pointLabel="users"
        breakdownGroups={initialFnBreakdowns}
        hideCount={hideCount}
      />

      <RankingSection
        title="Most Used Function 最常使用功能排名"
        subtitle="Total invocation count per function, summed across all users."
        data={analyticsData.mostUsedFunction}
        valueLabel="Invocations"
        pointLabel="invocations"
        hideCount={hideCount}
      />
    </>
  );
}
