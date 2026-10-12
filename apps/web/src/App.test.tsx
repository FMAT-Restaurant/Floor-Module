import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { Socket } from 'socket.io-client';
import { App } from './App';
import { SalaSocketProvider } from './context';
import { server } from './mocks/server';
import { mockDb } from './mocks/db';
import { createTestQueryClient } from './test/test-utils';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  mockDb.reset();
});

afterAll(() => {
  server.close();
});

describe('App Component', () => {
  it('renders within QueryClientProvider without errors', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Control de Sala')).toBeInTheDocument();
    expect(
      screen.getByText('Gestión de Sala, Mesas y Reservas en tiempo real'),
    ).toBeInTheDocument();
  });

  it('renders reconnection status badge when websocket is disconnected', () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/reconectando/i)).toBeInTheDocument();
  });

  it('renders live status badge when websocket is connected', () => {
    const mockSocket = {
      connected: true,
      on: () => mockSocket,
      off: () => mockSocket,
      emit: () => mockSocket,
      disconnect: () => {},
    } as unknown as Socket;

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <SalaSocketProvider socket={mockSocket}>
          <App />
        </SalaSocketProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/en vivo/i)).toBeInTheDocument();
  });

  it('integrates and renders PlanoSalaView with live tables and state indicators', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Mesa 1')).toBeInTheDocument();
    expect(screen.getByText('Mesa 2')).toBeInTheDocument();
    expect(screen.getByText(/Disponibles:/i)).toBeInTheDocument();
    expect(screen.getByText(/Ocupadas:/i)).toBeInTheDocument();
    expect(screen.getByText(/Limpieza pendiente:/i)).toBeInTheDocument();
  });
});
