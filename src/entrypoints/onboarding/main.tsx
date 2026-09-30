import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Onboarding } from '@/app/onboarding/Onboarding';
import '@/styles/app.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Onboarding />
  </StrictMode>,
);
