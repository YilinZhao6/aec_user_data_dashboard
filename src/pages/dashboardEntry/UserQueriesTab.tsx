import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getUserQueries, ConversationQueryResult, UserQuery } from '../../api/getUserInfo/userQueries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTO_FETCH_USER_QUERIES_ON_MOUNT = false;
const DEFAULT_LOOKBACK_DAYS = 3;
const FIRST_QUERY_PREVIEW_LENGTH = 320;
const CONVERSATIONS_PER_PAGE = 50;
const AGENT_RESPONSE_BASE_URL = 'https://agent.hyperknow.io/response';

function dateKeyFromOffset(daysOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function queryMessage(query: UserQuery): string {
  return typeof query.message === 'string' ? query.message : JSON.stringify(query.message);
}

function queryMetadata(query: UserQuery) {
  return Object.entries(query).filter(([key]) => key !== 'message' && key !== 'parse_error');
}

function firstQueryMessage(queries: UserQuery[]): string {
  if (!queries.length) return '(no user messages)';
  const msg = queryMessage(queries[0]);
  return msg.length > FIRST_QUERY_PREVIEW_LENGTH ? msg.slice(0, FIRST_QUERY_PREVIEW_LENGTH) + '...' : msg;
}

function conversationUrl(conversationId: string) {
  return `${AGENT_RESPONSE_BASE_URL}/${encodeURIComponent(conversationId)}`;
}

// ---------------------------------------------------------------------------
// Conversation detail modal
// ---------------------------------------------------------------------------

interface ConversationDetailProps {
  conversation: ConversationQueryResult;
  userLabel: string;
  onClose: () => void;
}

function ConversationDetail({ conversation, userLabel, onClose }: ConversationDetailProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, width: 680, maxWidth: '95vw',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Conversation Detail</div>
              <div style={{ fontSize: 12, color: '#888', lineHeight: 1.7 }}>
                <span><b>User:</b> {userLabel}</span>
                <br />
                <span><b>User ID:</b> <code style={{ background: '#f5f5f5', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>{conversation.user_id}</code></span>
                <br />
                <span><b>Conversation ID:</b> <code style={{ background: '#f5f5f5', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>{conversation.conversation_id}</code></span>
                <br />
                <span>
                  <b>Link:</b>{' '}
                  <a
                    href={conversationUrl(conversation.conversation_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="user-queries-conversation-link"
                  >
                    Open conversation
                  </a>
                </span>
                <br />
                <span><b>Started:</b> {formatDateTime(conversation.created_at)}</span>
                <br />
                <span><b>Rounds:</b> {conversation.rounds_of_user_message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#999', padding: '0 4px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ overflowY: 'auto', padding: '16px 24px 20px', flex: 1 }}>
          {conversation.user_queries.length === 0 ? (
            <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>No user messages found.</div>
          ) : (
            conversation.user_queries.map((q, i) => {
              const msg = queryMessage(q);
              const metadata = queryMetadata(q);
              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 14, padding: '12px 14px',
                    background: i % 2 === 0 ? '#f8f9ff' : '#fff',
                    border: '1px solid #eaecf0', borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                    {i === 0 ? 'First user query' : `Follow-up user query ${i + 1}`}
                    {Boolean(q.parse_error) && <span style={{ color: '#f59e0b', marginLeft: 6 }}>parse error</span>}
                  </div>
                  <div style={{ fontSize: 13, color: '#222', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg}</div>
                  {metadata.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 11, color: '#888', cursor: 'pointer' }}>Metadata</summary>
                      <pre style={{ fontSize: 11, color: '#555', marginTop: 4, background: '#f5f5f5', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                        {JSON.stringify(Object.fromEntries(metadata), null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export default function UserQueriesTab() {
  const [startDate, setStartDate] = useState(() => dateKeyFromOffset(-DEFAULT_LOOKBACK_DAYS));
  const [endDate, setEndDate] = useState(() => dateKeyFromOffset(0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationQueryResult[] | null>(null);
  const [meta, setMeta] = useState<{ generated_at: string; start: string; end: string; total: number } | null>(null);
  const [selected, setSelected] = useState<ConversationQueryResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const didAutoFetchRef = useRef(false);

  const handleFetch = useCallback(async () => {
    if (!startDate) return;
    setLoading(true);
    setError(null);
    try {
      // Send ISO datetime: start of the chosen day UTC
      const startIso = `${startDate}T00:00:00`;
      const endIso = endDate ? `${endDate}T23:59:59` : undefined;
      const data = await getUserQueries(startIso, endIso);
      setConversations(data.conversations);
      setCurrentPage(1);
      setMeta({
        generated_at: data.generated_at,
        start: data.start,
        end: data.end,
        total: data.total_conversations,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (AUTO_FETCH_USER_QUERIES_ON_MOUNT && !didAutoFetchRef.current) {
      didAutoFetchRef.current = true;
      void handleFetch();
    }
  }, [handleFetch]);

  const totalPages = conversations ? Math.max(1, Math.ceil(conversations.length / CONVERSATIONS_PER_PAGE)) : 1;
  const pageStartIndex = (currentPage - 1) * CONVERSATIONS_PER_PAGE;
  const pageConversations = useMemo(
    () => conversations?.slice(pageStartIndex, pageStartIndex + CONVERSATIONS_PER_PAGE) ?? [],
    [conversations, pageStartIndex],
  );

  // Build a friendly user label from user_id (first 8 chars)
  const userLabel = (uid: string) => uid.slice(0, 8) + '…';

  return (
    <div className="section user-queries-section">
      <div className="user-queries-hero">
        <div className="user-queries-title-group">
          <div className="user-queries-eyebrow">Conversation Explorer</div>
          <h2>User Queries</h2>
          <p>Pick a time window, then inspect each conversation by first user query, user id, and conversation id.</p>
        </div>
        <button
          type="button"
          className="user-queries-primary-btn"
          onClick={handleFetch}
          disabled={loading || !startDate}
        >
          {loading ? 'Loading...' : 'Load Queries'}
        </button>
      </div>

      <div className="user-queries-control-card">
        <div className="user-queries-controls">
          <label className="user-queries-field">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="user-queries-field">
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        {meta && (
          <div className="user-queries-meta">
            <span>{meta.total} conversations</span>
            <span>{formatDateTime(meta.start)}{' to '}{formatDateTime(meta.end)}</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#cf1322', fontSize: 13 }}>
          {error}
        </div>
      )}

      {conversations === null && !loading && !error && (
        <div className="user-queries-empty-panel">
          <div className="user-queries-empty-title">Ready when you are</div>
          <div className="user-queries-empty-subtitle">
            Auto fetch is currently off for debugging. Click Load Queries to fetch the selected window.
          </div>
        </div>
      )}

      {conversations !== null && (
        conversations.length === 0 ? (
          <div className="empty-state" style={{ height: 120 }}>No conversations found in this time range.</div>
        ) : (
          <div className="user-queries-table-wrap">
            <table className="user-queries-table">
              <thead>
                <tr style={{ borderBottom: '2px solid #f0f0f0', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}>#</th>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}>First Query</th>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}>User</th>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}>Time</th>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}>Rounds</th>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}>Link</th>
                  <th style={{ padding: '8px 12px', color: '#888', fontWeight: 500 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageConversations.map((conv, i) => (
                  <tr
                    key={conv.conversation_id}
                    style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}
                  >
                    <td style={{ padding: '10px 12px', color: '#ccc' }}>{pageStartIndex + i + 1}</td>
                    <td style={{ padding: '10px 12px', color: conv.user_queries.length ? '#222' : '#bbb', maxWidth: 680, whiteSpace: 'normal', lineHeight: 1.55 }}>
                      {firstQueryMessage(conv.user_queries)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        title={conv.user_id}
                        style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}
                      >
                        {userLabel(conv.user_id)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#888', whiteSpace: 'nowrap' }}>{formatDateTime(conv.created_at)}</td>
                    <td style={{ padding: '10px 12px', color: '#555', textAlign: 'center' }}>{conv.rounds_of_user_message}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <a
                        href={conversationUrl(conv.conversation_id)}
                        target="_blank"
                        rel="noreferrer"
                        className="user-queries-conversation-link"
                      >
                        Open
                      </a>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        type="button"
                        className="user-queries-detail-btn"
                        onClick={() => setSelected(conv)}
                      >
                        See details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {conversations.length > CONVERSATIONS_PER_PAGE && (
              <div className="user-queries-pagination">
                <div>
                  Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + CONVERSATIONS_PER_PAGE, conversations.length)} of {conversations.length}
                </div>
                <div className="user-queries-pagination-actions">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span>Page {currentPage} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {selected && (
        <ConversationDetail
          conversation={selected}
          userLabel={userLabel(selected.user_id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
