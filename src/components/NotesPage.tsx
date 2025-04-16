import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';

interface NoteInfo {
  file_name: string;
  created_at: string;
  last_modified?: string;
  user_id: string;
}

interface NotesPageProps {
  notes: NoteInfo[];
}

export default function NotesPage({ notes }: NotesPageProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const notesPerPage = 25;
  const totalPages = Math.ceil(notes.length / notesPerPage);

  // Sort notes by created_at in descending order
  const sortedNotes = [...notes].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Get current page notes
  const indexOfLastNote = currentPage * notesPerPage;
  const indexOfFirstNote = indexOfLastNote - notesPerPage;
  const currentNotes = sortedNotes.slice(indexOfFirstNote, indexOfLastNote);

  const formatDateTime = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, 'MMM d, yyyy HH:mm:ss');
  };

  return (
    <div className="min-h-screen bg-[#F0F0F0] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">User Notes</h1>
          <div className="text-gray-600">
            Total Notes: <span className="font-semibold">{notes.length}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {indexOfFirstNote + 1} - {Math.min(indexOfLastNote, notes.length)} of {notes.length} notes
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

        <div className="grid gap-4">
          {currentNotes.map((note) => (
            <div 
              key={`${note.user_id}-${note.file_name}-${note.created_at}`}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-600" />
                  <h2 className="text-lg font-semibold text-gray-800">
                    {note.file_name}
                  </h2>
                </div>
                <span className="text-sm font-medium text-gray-500">
                  User ID: {note.user_id}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-gray-600">Created:</span>
                  <span className="text-sm text-gray-800 ml-2">
                    {formatDateTime(note.created_at)}
                  </span>
                </div>
                {note.last_modified && (
                  <div>
                    <span className="text-sm font-medium text-gray-600">Last Modified:</span>
                    <span className="text-sm text-gray-800 ml-2">
                      {formatDateTime(note.last_modified)}
                    </span>
                  </div>
                )}
              </div>
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