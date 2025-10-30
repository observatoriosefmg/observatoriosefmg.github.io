import React from 'react';

interface CounterCardProps {
  value: number | string | React.ReactNode;
  label: string;
  // FIX: Replaced JSX.Element with React.ReactNode to resolve the "Cannot find namespace 'JSX'" error.
  icon: React.ReactNode;
  // optional footer (small text) displayed below the label
  footer?: React.ReactNode;
}

const CounterCard: React.FC<CounterCardProps> = ({ value, label, icon, footer }) => {
  return (
    <div className="bg-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-lg transform hover:scale-105 transition-transform duration-300">
      <div className="mb-4">
        {icon}
      </div>
      <p className="text-5xl md:text-6xl font-black text-white tracking-tighter">
        {value}
      </p>
      <p className="text-sm md:text-base text-slate-400 mt-2">
        {label}
      </p>
      {footer && (
        <div className="mt-2 text-xs text-slate-400">
          {footer}
        </div>
      )}
    </div>
  );
};

export default CounterCard;