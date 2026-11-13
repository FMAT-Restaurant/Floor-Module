import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { Socket } from 'socket.io-client';
import { App } from './App';
import { setFederatedToken } from './api/client';
import { queryClient } from './api/queryClient';
import { AUTH_SESSION_STORAGE_KEY, PermisoSala } from './auth/permissions';
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
  window.localStorage.clear();
  setFederatedToken(null);
  queryClient.clear();
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

  it('switches to ReservasView when the "Reservas" navigation tab is selected', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    const reservasTab = screen.getByRole('tab', { name: 'Reservas' });
    fireEvent.click(reservasTab);

    expect(reservasTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Agenda de reservas' })).toBeInTheDocument();
    expect(screen.getByTestId('buscador-disponibilidad')).toBeInTheDocument();
  });

  it('switches to ListaEsperaView when the "Lista de espera" navigation tab is selected', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    const esperaTab = screen.getByRole('tab', { name: 'Lista de espera' });
    fireEvent.click(esperaTab);

    expect(esperaTab).toHaveAttribute('aria-selected', 'true');
    expect(
      await screen.findByRole('heading', { name: 'Lista de espera presencial' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('formulario-registro-espera')).toBeInTheDocument();
  });

  describe('Module Federation & PBAC Gating', () => {
    it('mounts standalone without external providers using federated token and dark theme', async () => {
      let receivedAuth: string | null = null;
      server.use(
        http.get('*/sala/mesas/estado-en-vivo', ({ request }) => {
          receivedAuth = request.headers.get('authorization');
          return HttpResponse.json([]);
        }),
      );

      const { container } = render(
        <App
          token="federated-jwt-xyz"
          theme="dark"
          currentUser={{
            id: 'admin-1',
            roles: ['ADMINISTRADOR'],
            permissions: ['*'],
          }}
        />,
      );

      expect(container.querySelector('.sala-module-root')).toHaveAttribute('data-theme', 'dark');
      await waitFor(() => {
        expect(receivedAuth).toBe('Bearer federated-jwt-xyz');
      });

      expect(screen.getByRole('tab', { name: 'Plano de sala' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Reservas' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Configuración de mesas' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Lista de espera' })).toBeInTheDocument();
    });

    it('applies HOST partial PBAC gating for tabs and view actions', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <SalaSocketProvider autoConnect={false}>
            <App
              currentUser={{
                id: 'host-1',
                roles: ['HOST'],
                permissions: [
                  PermisoSala.TABLES_VIEW,
                  PermisoSala.TABLES_OCCUPY,
                  PermisoSala.RESERVATIONS_VIEW,
                  PermisoSala.WAITLIST_ENTRIES_VIEW,
                ],
              }}
            />
          </SalaSocketProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByText('Mesa 1')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Plano de sala' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Reservas' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Lista de espera' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Configuración de mesas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Unir mesas/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: 'Lista de espera' }));
      expect(
        await screen.findByRole('heading', { name: 'Lista de espera presencial' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('formulario-registro-espera')).not.toBeInTheDocument();
    });

    it('reads localStorage fmat_restaurant_auth_session and opens first permitted tab', async () => {
      window.localStorage.setItem(
        AUTH_SESSION_STORAGE_KEY,
        JSON.stringify({
          accessToken: 'stored-shell-jwt',
          user: {
            id: 'host-reservas',
            roles: ['HOST'],
            permissions: [PermisoSala.RESERVATIONS_VIEW],
          },
        }),
      );

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <SalaSocketProvider autoConnect={false}>
            <App />
          </SalaSocketProvider>
        </QueryClientProvider>,
      );

      const reservasTab = screen.getByRole('tab', { name: 'Reservas' });
      expect(reservasTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByRole('tab', { name: 'Plano de sala' })).not.toBeInTheDocument();
      expect(
        await screen.findByRole('heading', { name: 'Agenda de reservas' }),
      ).toBeInTheDocument();
    });

    it('renders permission-denied empty state for MESERO without sala permissions', () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <SalaSocketProvider autoConnect={false}>
            <App
              currentUser={{
                id: 'mesero-1',
                roles: ['MESERO'],
                permissions: [],
              }}
            />
          </SalaSocketProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('sala-sin-permisos')).toBeInTheDocument();
      expect(screen.getByText('Sin permisos en Control de Sala')).toBeInTheDocument();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });

    it('grants full access via wildcard permission * including Unir mesas and Crear mesa', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <SalaSocketProvider autoConnect={false}>
            <App
              currentUser={{
                id: 'super-1',
                roles: ['HOST'],
                permissions: ['*'],
              }}
            />
          </SalaSocketProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByText('Mesa 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Unir mesas/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: 'Configuración de mesas' }));
      expect(await screen.findByRole('button', { name: /Crear mesa/i })).toBeInTheDocument();
    });
  });
});
