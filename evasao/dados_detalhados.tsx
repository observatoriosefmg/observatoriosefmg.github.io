import React from 'react';
import { createRoot } from 'react-dom/client';
import DetailedTableApp from './components/DetailedTableApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<DetailedTableApp />);
}