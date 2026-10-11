import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import App from './App';
import './index.css';

async function prepareApp(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { enableMocking } = await import('./mocks');
    await enableMocking();
  }
}

void prepareApp().then(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
