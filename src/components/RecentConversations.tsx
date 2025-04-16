import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ConversationInfo {
  article_path: string;
  character_count: number;
  conversation_id: string;
  estimated_reading_time: number;
  generated_at: string;
  topic: string;
  user_id: string;
  word_count: number;
  quality_rating?: number;
  understandability?: number;
  further_comments?: string;
}

interface RecentConversationsProps {
  conversations: ConversationInfo[];
}

export default function RecentConversations({ conversations }: RecentConversationsProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const conversationsPerPage = 50;
  const totalPages = Math.ceil(conversations.length / conversationsPerPage);

  // Sort conversations by generated_at in descending order
  const sortedConversations = [...conversations].sort((a, b) => 
    new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  );

  // Get current page conversations
  const indexOfLastConversation = currentPage * conversationsPerPage;
  const indexOfFirstConversation = indexOfLastConversation - conversationsPerPage;
  const currentConversations = sortedConversations.slice(
    indexOfFirstConversation,
    indexOfLastConversation
  );

  const formatDateTime = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, 'MMM d, yyyy HH:mm:ss');
  };

  return (
    <div className="min-h-screen bg-[#F0F0F0] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Recent Conversations</h1>
          <div className="text-gray-600">
            Total Conversations: <span className="font-semibold">{conversations.length}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {indexOfFirstConversation + 1} - {Math.min(indexOfLastConversation, conversations.length)} of {conversations.length} conversations
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-2 rounded-md transition-colors ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-md transition-colors ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        
        <div className="grid gap-6">
          {currentConversations.map((conversation) => (
            <div 
              key={`${conversation.conversation_id}-${conversation.generated_at}`}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-800">
                  {conversation.topic}
                </h2>
                <span className="text-sm text-gray-500">
                  {formatDateTime(conversation.generated_at)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">User ID:</span>
                  <span className="text-sm text-gray-800">{conversation.user_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Conversation ID:</span>
                  <span className="text-sm text-gray-800">{conversation.conversation_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Word Count:</span>
                  <span className="text-sm text-gray-800">{conversation.word_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Character Count:</span>
                  <span className="text-sm text-gray-800">{conversation.character_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Reading Time:</span>
                  <span className="text-sm text-gray-800">{conversation.estimated_reading_time} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600">Article Path:</span>
                  <span className="text-sm text-gray-800 truncate">{conversation.article_path}</span>
                </div>
              </div>

              {(conversation.quality_rating || conversation.understandability || conversation.further_comments) && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Additional Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {conversation.quality_rating !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Quality Rating:</span>
                        <span className="text-sm text-gray-800">{conversation.quality_rating}/5</span>
                      </div>
                    )}
                    {conversation.understandability !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600">Understandability:</span>
                        <span className="text-sm text-gray-800">{conversation.understandability}/5</span>
                      </div>
                    )}
                  </div>
                  {conversation.further_comments && (
                    <div className="mt-2">
                      <span className="text-sm font-medium text-gray-600">Comments:</span>
                      <p className="text-sm text-gray-800 mt-1">{conversation.further_comments}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`p-2 rounded-md transition-colors ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-4 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`p-2 rounded-md transition-colors ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}