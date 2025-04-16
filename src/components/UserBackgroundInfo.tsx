import React, { useState } from 'react';
import { GraduationCap, BookOpen, Building2 } from 'lucide-react';

interface StatInfo {
  count: number;
  percentage: number;
}

interface EducationStats {
  education_levels: {
    [key: string]: StatInfo;
  };
  study_fields: {
    [key: string]: StatInfo;
  };
  institutions: {
    [key: string]: StatInfo;
  };
  total_users: number;
}

interface UserBackgroundInfoProps {
  stats: EducationStats;
}

type Category = 'education' | 'fields' | 'institutions';

export default function UserBackgroundInfo({ stats }: UserBackgroundInfoProps) {
  const [activeCategory, setActiveCategory] = useState<Category>('education');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const getCategoryData = () => {
    switch (activeCategory) {
      case 'education':
        return {
          title: 'Education Levels',
          icon: <GraduationCap className="h-5 w-5" />,
          data: stats.education_levels,
        };
      case 'fields':
        return {
          title: 'Study Fields',
          icon: <BookOpen className="h-5 w-5" />,
          data: stats.study_fields,
        };
      case 'institutions':
        return {
          title: 'Institutions',
          icon: <Building2 className="h-5 w-5" />,
          data: stats.institutions,
        };
    }
  };

  const categoryData = getCategoryData();
  const sortedItems = Object.entries(categoryData.data)
    .sort(([, a], [, b]) => b.count - a.count);
  
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const currentItems = sortedItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="min-h-screen bg-[#F0F0F0] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">User Background Information</h1>
          <p className="text-gray-600">Total Users: {stats.total_users}</p>
        </div>

        {/* Category Navigation */}
        <div className="bg-white rounded-lg shadow-sm p-2 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveCategory('education');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeCategory === 'education'
                  ? 'bg-black text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <GraduationCap className="h-5 w-5" />
              Education Levels
            </button>
            <button
              onClick={() => {
                setActiveCategory('fields');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeCategory === 'fields'
                  ? 'bg-black text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <BookOpen className="h-5 w-5" />
              Study Fields
            </button>
            <button
              onClick={() => {
                setActiveCategory('institutions');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeCategory === 'institutions'
                  ? 'bg-black text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Building2 className="h-5 w-5" />
              Institutions
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {categoryData.icon}
                <h2 className="text-xl font-semibold text-gray-800">
                  {categoryData.title}
                </h2>
              </div>
              <div className="text-sm text-gray-600">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, sortedItems.length)} - {Math.min(currentPage * itemsPerPage, sortedItems.length)} of {sortedItems.length} items
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {currentItems.map(([name, stats]) => (
              <div key={name} className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-800">{name}</h3>
                  <p className="text-sm text-gray-600">
                    {stats.count} user{stats.count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-8">
                  <div className="w-48 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-black rounded-full h-2"
                      style={{ width: `${stats.percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right">
                    <span className="text-sm font-medium text-gray-800">
                      {stats.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    currentPage === 1
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    currentPage === totalPages
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}