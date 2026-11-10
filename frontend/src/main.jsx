import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { initMonitoring } from './utils/monitoring';

initMonitoring();

sessionStorage.removeItem('fjw_chunk_reload');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
