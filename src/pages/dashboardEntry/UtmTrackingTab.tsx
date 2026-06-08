import { useState, useEffect, useMemo } from 'react';
import { getUtmStats, UtmUser, UtmData, LoginIp } from '../../api/getUserInfo/utm';

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
type UtmField = typeof UTM_FIELDS[number];

const FIELD_LABELS: Record<UtmField, string> = {
  utm_source: 'Source',
  utm_medium: 'Medium',
  utm_campaign: 'Campaign',
  utm_content: 'Content',
  utm_term: 'Term',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function formatLoginIp(ip: LoginIp | null | undefined): string {
  if (!ip) return '—';
  const parts = [ip.city, ip.region, ip.country].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function formatAcquisitionSources(sources: string[] | null | undefined): string {
  if (!sources?.length) return '—';
  return sources.join(', ');
}

function utmValue(data: UtmData, field: UtmField): string {
  const v = data[field];
  return v ? String(v) : '';
}

function collectOptions(users: UtmUser[], field: UtmField): string[] {
  const set = new Set<string>();
  for (const u of users) {
    const v = utmValue(u.utm_data, field);
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

type Filters = Partial<Record<UtmField, string>>;

function applyFilters(users: UtmUser[], filters: Filters): UtmUser[] {
  return users.filter((u) =>
    UTM_FIELDS.every((f) => {
      const selected = filters[f];
      if (!selected) return true;
      return utmValue(u.utm_data, f) === selected;
    }),
  );
}

export default function UtmTrackingTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UtmUser[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUtmStats()
      .then((data) => { if (!cancelled) setAllUsers(data.users); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = useMemo(() => applyFilters(allUsers, filters), [allUsers, filters]);

  // Options for each filter field, derived from current filtered set (cascade)
  const optionsFor = useMemo(() => {
    const result = {} as Record<UtmField, string[]>;
    for (const field of UTM_FIELDS) {
      // For a given field, ignore its own filter to show all possible options given other filters
      const otherFilters = Object.fromEntries(
        Object.entries(filters).filter(([k]) => k !== field),
      ) as Filters;
      const base = applyFilters(allUsers, otherFilters);
      result[field] = collectOptions(base, field);
    }
    return result;
  }, [allUsers, filters]);

  const setFilter = (field: UtmField, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value || undefined }));
  };

  const clearFilters = () => setFilters({});
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  if (loading) {
    return (
      <div className="section">
        <div className="loading" style={{ padding: 60, textAlign: 'center', color: '#888' }}>Loading UTM data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section">
        <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 8, padding: '14px 18px', color: '#cf1322', fontSize: 13 }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="section" style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div className="user-queries-hero">
        <div className="user-queries-title-group">
          <div className="user-queries-eyebrow">Marketing Attribution</div>
          <h2>UTM Tracking</h2>
          <p>All users with UTM data on signup. Use the filters below to drill down by source, medium, campaign, etc.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{filteredUsers.length}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {activeFilterCount > 0 ? `filtered from ${allUsers.length} total` : `total users with UTM`}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24,
        background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 10, padding: '14px 18px',
      }}>
        {UTM_FIELDS.map((field) => {
          const options = optionsFor[field];
          const selected = filters[field] ?? '';
          return (
            <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {FIELD_LABELS[field]}
              </span>
              <select
                value={selected}
                onChange={(e) => setFilter(field, e.target.value)}
                style={{
                  fontSize: 13, padding: '5px 10px', border: selected ? '1.5px solid #4f6ef7' : '1px solid #e5e5e5',
                  borderRadius: 6, background: selected ? '#f0f3ff' : '#fff', cursor: 'pointer',
                  outline: 'none', minWidth: 140,
                }}
              >
                <option value="">All {FIELD_LABELS[field]}s</option>
                {options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        })}
        {activeFilterCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <button
              type="button"
              onClick={clearFilters}
              style={{
                fontSize: 12, padding: '5px 12px', border: '1px solid #e5e5e5',
                borderRadius: 6, background: '#fff', color: '#888', cursor: 'pointer',
              }}
            >
              Clear filters ({activeFilterCount})
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {filteredUsers.length === 0 ? (
        <div className="empty-state" style={{ height: 120 }}>No users match the selected filters.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #f0f0f0', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
                <th style={{ padding: '10px 14px', color: '#888', fontWeight: 500, textAlign: 'left' }}>#</th>
                <th style={{ padding: '10px 14px', color: '#888', fontWeight: 500, textAlign: 'left' }}>User</th>
                {UTM_FIELDS.map((f) => (
                  <th key={f} style={{ padding: '10px 14px', color: '#888', fontWeight: 500, textAlign: 'left' }}>
                    {FIELD_LABELS[f]}
                  </th>
                ))}
                <th style={{ padding: '10px 14px', color: '#888', fontWeight: 500, textAlign: 'left' }}>Acquisition</th>
                <th style={{ padding: '10px 14px', color: '#888', fontWeight: 500, textAlign: 'left' }}>Location</th>
                <th style={{ padding: '10px 14px', color: '#888', fontWeight: 500, textAlign: 'left' }}>Signed Up</th>
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, i) => {
                const isExpanded = expandedUser === user.user_id;
                return (
                  <>
                    <tr
                      key={user.user_id}
                      style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}
                    >
                      <td style={{ padding: '10px 14px', color: '#ccc' }}>{i + 1}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {user.email ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 13, color: '#222' }}>{user.email}</span>
                            <span
                              title={user.user_id}
                              style={{ fontFamily: 'monospace', fontSize: 10, color: '#aaa' }}
                            >
                              {user.user_id.slice(0, 8)}…
                            </span>
                          </div>
                        ) : (
                          <span
                            title={user.user_id}
                            style={{ fontFamily: 'monospace', fontSize: 11, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}
                          >
                            {user.user_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      {UTM_FIELDS.map((f) => {
                        const val = utmValue(user.utm_data, f);
                        const isActive = filters[f] === val && val !== '';
                        return (
                          <td key={f} style={{ padding: '10px 14px' }}>
                            {val ? (
                              <span
                                style={{
                                  display: 'inline-block', fontSize: 12, padding: '2px 8px', borderRadius: 12,
                                  background: isActive ? '#e8edff' : '#f0f0f0',
                                  color: isActive ? '#3b5bdb' : '#555',
                                  fontWeight: isActive ? 600 : 400,
                                  cursor: 'pointer',
                                  border: isActive ? '1px solid #bac8ff' : '1px solid transparent',
                                }}
                                title={`Filter by ${FIELD_LABELS[f]}: ${val}`}
                                onClick={() => isActive ? setFilter(f, '') : setFilter(f, val)}
                              >
                                {val}
                              </span>
                            ) : (
                              <span style={{ color: '#ddd' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ padding: '10px 14px', color: '#555', fontSize: 12 }}>
                        {formatAcquisitionSources(user.acquisition_sources)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#555', fontSize: 12, whiteSpace: 'nowrap' }}
                          title={user.login_ip ? JSON.stringify(user.login_ip) : undefined}>
                        {formatLoginIp(user.login_ip)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#888', whiteSpace: 'nowrap' }}>{formatDate(user.signup_at)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          type="button"
                          className="user-queries-detail-btn"
                          onClick={() => setExpandedUser(isExpanded ? null : user.user_id)}
                        >
                          {isExpanded ? 'Hide' : 'Raw'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${user.user_id}-detail`} style={{ background: '#f8f9ff' }}>
                        <td colSpan={UTM_FIELDS.length + 6} style={{ padding: '10px 18px 14px' }}>
                          <pre style={{
                            fontSize: 11, color: '#444', margin: 0,
                            background: '#f0f3ff', padding: '10px 14px', borderRadius: 6,
                            overflowX: 'auto',
                          }}>
                            {JSON.stringify(user.utm_data, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
