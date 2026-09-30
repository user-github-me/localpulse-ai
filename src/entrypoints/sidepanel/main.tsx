import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanel } from '@/app/sidepanel/SidePanel';
import '@/styles/app.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
