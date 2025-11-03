import React from 'react';

interface NavigationProps {
  currentPage: 'dashboard' | 'table';
  onPageChange: (page: 'dashboard' | 'table') => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onPageChange }) => {
  return (
    <nav className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-700 p-1 flex space-x-1">
        <button
          onClick={() => onPageChange('dashboard')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            currentPage === 'dashboard'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => onPageChange('table')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            currentPage === 'table'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          Tabela Detalhada
        </button>
      </div>
    </nav>
  );
};

export default Navigation;