import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

interface CounterCardProps {
  value: number | string | React.ReactNode;
  label: string;
  // FIX: Replaced JSX.Element with React.ReactNode to resolve the "Cannot find namespace 'JSX'" error.
  icon: React.ReactNode;
  // optional footer (small text) displayed below the label
  footer?: React.ReactNode;
  // loading state
  isLoading?: boolean;
}

const CounterCard: React.FC<CounterCardProps> = ({ value, label, icon, footer, isLoading = false }) => {
  return (
    <div className="bg-gray-900 rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-2xl transform hover:scale-105 transition-all duration-300 border-2 border-gray-800 hover:border-red-600/70">
      <div className="mb-4">
        {icon}
      </div>
      <p className="text-5xl md:text-6xl font-black text-amber-400 tracking-tighter drop-shadow-lg">
        {isLoading ? (
          <FontAwesomeIcon icon={faSpinner} className="animate-spin text-gray-500" />
        ) : (
          value
        )}
      </p>
      <p className="text-sm md:text-base text-gray-300 mt-2">
        {label}
      </p>
      {footer && !isLoading && (
        <div className="mt-2 text-xs text-gray-400">
          {footer}
        </div>
      )}
    </div>
  );
};

export default CounterCard;