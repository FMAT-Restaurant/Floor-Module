import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import type { Socket } from 'socket.io-client';
import { queryClient } from './api/queryClient';
import { App } from './App';
import { SalaSocketProvider } from './context';
import { EstadoMesa } from '@floor/shared';

describe('App Component', () => {
  it('renders within QueryClientProvider without errors', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Floor Module')).toBeInTheDocument();
    expect(
      screen.getByText('Gestión de Sala, Mesas y Reservas en tiempo real'),
    ).toBeInTheDocument();
  });

  it('displays table state badges from shared contracts with canonical visual indicators', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByText(new RegExp(EstadoMesa.LIBRE))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(EstadoMesa.OCUPADA))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(EstadoMesa.LIMPIEZA_PENDIENTE))).toBeInTheDocument();
  });

  it('renders canonical buttons demo with official visual design tokens', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: /acción principal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vista previa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /descartar/i })).toBeInTheDocument();
  });

  it('renders reconnection status badge when websocket is disconnected', () => {
    render(
      <QueryClientProvider client={queryClient}>
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
      <QueryClientProvider client={queryClient}>
        <SalaSocketProvider socket={mockSocket}>
          <App />
        </SalaSocketProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/en vivo/i)).toBeInTheDocument();
  });
});
