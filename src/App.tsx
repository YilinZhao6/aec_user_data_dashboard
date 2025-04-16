import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, subMonths } from 'date-fns';
import { Users, MessageSquare, FileText, Star, Loader2 } from 'lucide-react';
import RecentConversations from './components/RecentConversations';
import UserBackgroundInfo from './components/UserBackgroundInfo';
import NotesPage from './components/NotesPage';

const API_URL = 'https://backend-ai-cloud-explains.onrender.com/user_stats';

type TimeRange = '2d' | '1w' | '1m' | '3m' | '6m';
type View = 'dashboard' | 'recent' | 'background' | 'notes';

interface DailyStats {
  date: string;
  count: number;
}

interface EducationStats {
  total_users: number;
  education_levels: {
    [key: string]: {
      count: number;
      percentage: number;
    };
  };
  study_fields: {
    [key: string]: {
      count: number;
      percentage: number;
    };
  };
  institutions: {
    [key: string]: {
      count: number;
      percentage: number;
    };
  };
}

interface ConversationInfo {
  article_path: string;
  conversation_id: string;
  topic: string;
  generated_at: string;
  character_count: number;
  word_count: number;
  estimated_reading_time: number;
  quality_rating?: number;
  understandability?: number;
  further_comments?: string;
  user_id: string;
}

interface NoteInfo {
  file_name: string;
  created_at: string;
  last_modified?: string;
  user_id: string;
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalConversations, setTotalConversations] = useState(0);
  const [dailyUsers, setDailyUsers] = useState<DailyStats[]>([]);
  const [dailyConversations, setDailyConversations] = useState<DailyStats[]>([]);
  const [educationStats, setEducationStats] = useState<EducationStats | null>(null);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [userTimeRange, setUserTimeRange] = useState<TimeRange>('1w');
  const [conversationTimeRange, setConversationTimeRange] = useState<TimeRange>('1w');

  const getDateRange = (range: TimeRange) => {
    const endDate = new Date();
    let startDate: Date;

    switch (range) {
      case '2d':
        startDate = subDays(endDate, 1);
        break;
      case '1w':
        startDate = subDays(endDate, 6);
        break;
      case '1m':
        startDate = subMonths(endDate, 1);
        break;
      case '3m':
        startDate = subMonths(endDate, 3);
        break;
      case '6m':
        startDate = subMonths(endDate, 6);
        break;
      default:
        startDate = subDays(endDate, 6);
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
    };
  };

  const fetchTimeRangeData = async (range: TimeRange, type: 'users' | 'conversations') => {
    const { startDate, endDate } = getDateRange(range);
    const endpoint = type === 'users' ? 'get_daily_registered_user_count' : 'get_daily_conversation_count';

    try {
      const response = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      const data = await response.json();

      if (type === 'users') {
        setDailyUsers(data.data);
      } else {
        setDailyConversations(data.data);
      }
    } catch (error) {
      console.error(`Error fetching ${type} data:`, error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Simulate progress updates
        const updateProgress = () => {
          setLoadingProgress(prev => Math.min(prev + 20, 90));
        };

        // Fetch data with progress updates
        setLoadingProgress(10);
        const totalUsersRes = await fetch(`${API_URL}/get_overall_registered_user_count`, { method: 'POST' });
        updateProgress();

        const totalConversationsRes = await fetch(`${API_URL}/get_overall_conversation_count`, { method: 'POST' });
        updateProgress();

        const educationStatsRes = await fetch(`${API_URL}/get_education_stats`, { method: 'POST' });
        updateProgress();

        const conversationsRes = await fetch(`${API_URL}/get_user_conversation_info`, { method: 'POST' });
        updateProgress();

        const notesRes = await fetch(`${API_URL}/get_user_note_info`, { method: 'POST' });
        updateProgress();

        const [totalUsersData, totalConversationsData, educationStatsData, conversationsData, notesData] = await Promise.all([
          totalUsersRes.json(),
          totalConversationsRes.json(),
          educationStatsRes.json(),
          conversationsRes.json(),
          notesRes.json(),
        ]);

        setTotalUsers(totalUsersData.count);
        setTotalConversations(totalConversationsData.count);
        setEducationStats(educationStatsData.data);
        setConversations(conversationsData.conversations || []);
        setNotes(notesData.notes || []);

        await Promise.all([
          fetchTimeRangeData(userTimeRange, 'users'),
          fetchTimeRangeData(conversationTimeRange, 'conversations')
        ]);

        setLoadingProgress(100);
        setTimeout(() => setLoading(false), 500); // Smooth transition
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    fetchTimeRangeData(userTimeRange, 'users');
  }, [userTimeRange]);

  useEffect(() => {
    fetchTimeRangeData(conversationTimeRange, 'conversations');
  }, [conversationTimeRange]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F0F0] flex flex-col items-center justify-center">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="h-8 w-8 text-gray-700 animate-spin" />
          <div className="text-2xl font-semibold text-gray-700">Loading Data</div>
        </div>
        <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-black transition-all duration-500 ease-out"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-gray-600">
          Estimated time: {Math.max(5 - (loadingProgress / 20), 0).toFixed(1)} seconds
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F0]">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <img src="/hyperknow_logo_with_text.svg" alt="HyperKnow" className="h-8" />
              <div className="flex gap-4">
                <button
                  onClick={() => setView('dashboard')}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    view === 'dashboard'
                      ? 'bg-black text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setView('recent')}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    view === 'recent'
                      ? 'bg-black text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Recent Conversations
                </button>
                <button
                  onClick={() => setView('background')}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    view === 'background'
                      ? 'bg-black text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  User Background
                </button>
                <button
                  onClick={() => setView('notes')}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    view === 'notes'
                      ? 'bg-black text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {view === 'dashboard' ? (
        <div className="p-6">
          <div className="max-w-7xl mx-auto">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard title="Total Users" value={totalUsers} icon={<Users className="h-6 w-6" />} />
              <StatCard title="Total Conversations" value={totalConversations} icon={<MessageSquare className="h-6 w-6" />} />
              <StatCard title="Total Notes" value={notes.length} icon={<FileText className="h-6 w-6" />} />
              <StatCard title="Avg Rating" value={calculateAverageRating(conversations)} icon={<Star className="h-6 w-6" />} decimals={1} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#EEEEEE] rounded-lg border border-black/10 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Daily New Users</h3>
                  <TimeRangeSelector value={userTimeRange} onChange={(range) => setUserTimeRange(range)} />
                </div>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyUsers}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.1} />
                      <XAxis dataKey="date" stroke="#000" />
                      <YAxis stroke="#000" />
                      <Tooltip contentStyle={{ backgroundColor: '#F0F0F0', border: '1px solid rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="count" stroke="#000" strokeWidth={2} dot={{ fill: '#000' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#EEEEEE] rounded-lg border border-black/10 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Daily Conversations</h3>
                  <TimeRangeSelector value={conversationTimeRange} onChange={(range) => setConversationTimeRange(range)} />
                </div>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyConversations}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.1} />
                      <XAxis dataKey="date" stroke="#000" />
                      <YAxis stroke="#000" />
                      <Tooltip contentStyle={{ backgroundColor: '#F0F0F0', border: '1px solid rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="count" stroke="#000" strokeWidth={2} dot={{ fill: '#000' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : view === 'recent' ? (
        <RecentConversations conversations={conversations} />
      ) : view === 'background' ? (
        <UserBackgroundInfo stats={educationStats} />
      ) : (
        <NotesPage notes={notes} />
      )}

      {/* Footer */}
      <footer className="mt-12 py-4 border-t border-black/10 text-center text-sm text-gray-600">
        <div className="max-w-7xl mx-auto">© 2025 hyperknow.io • Internal Data • Internal Testing</div>
      </footer>
    </div>
  );
}

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const ranges: { value: TimeRange; label: string }[] = [
    { value: '2d', label: '2 Days' },
    { value: '1w', label: '1 Week' },
    { value: '1m', label: '1 Month' },
    { value: '3m', label: '3 Months' },
    { value: '6m', label: '6 Months' },
  ];

  return (
    <div className="flex gap-2">
      {ranges.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`px-3 py-1 text-sm rounded-md transition-colors border border-black/10 ${
            value === range.value ? 'bg-black text-white' : 'bg-[#F0F0F0] text-gray-600 hover:bg-gray-200'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  decimals?: number;
}

function StatCard({ title, value, icon, decimals = 0 }: StatCardProps) {
  return (
    <div className="bg-[#EEEEEE] rounded-lg border border-black/10 p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className="text-gray-800">{icon}</div>
      </div>
      <div className="text-2xl font-semibold text-gray-800">
        {value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </div>
    </div>
  );
}

function calculateAverageRating(conversations: ConversationInfo[]): number {
  const ratingsCount = conversations.filter((c) => c.quality_rating).length;
  if (ratingsCount === 0) return 0;

  const totalRating = conversations.reduce((sum, conv) => sum + (conv.quality_rating || 0), 0);
  return totalRating / ratingsCount;
}

export default App;