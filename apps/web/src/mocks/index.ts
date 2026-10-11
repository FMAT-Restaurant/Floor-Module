import { registerWindowMockApi } from './simulation';

export * from './db';
export * from './simulation';
export * from './handlers';
export { worker } from './browser';

export async function enableMocking(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  registerWindowMockApi();

  const { worker } = await import('./browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
