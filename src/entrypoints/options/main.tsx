import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Options } from '@/app/options/Options';
import '@/styles/app.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
