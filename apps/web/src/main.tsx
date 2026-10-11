import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
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
      <App />
    </StrictMode>,
  );
});
