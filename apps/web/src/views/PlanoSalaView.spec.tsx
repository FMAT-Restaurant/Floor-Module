import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { mockDb } from '../mocks/db';
import { createTestQueryClient } from '../test/test-utils';
import { PlanoSalaView } from './PlanoSalaView';
import { FIXTURE_MESERO_IDS } from '@floor/shared';

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

describe('PlanoSalaView Component', () => {
  it('FE-005, RF-007, RF-023: marcar limpia actualiza el estado y los controles de la card', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );
    const card = await screen.findByTestId('mesa-card-4');
    expect(within(card).getByText('Limpieza')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Marcar limpia' }));
    expect(await within(card).findByText('Libre')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Marcar limpia' })).not.toBeInTheDocument();
  });

  it('FE-005, RF-006: confirmar salida actualiza la card a Limpieza y ofrece marcar limpia', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );
    const card = await screen.findByTestId('mesa-card-3');
    fireEvent.click(within(card).getByRole('button', { name: 'Salida de comensales' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }));
    expect(await within(card).findByText('Limpieza')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card).getByRole('button', { name: 'Marcar limpia' })).toBeEnabled();
    expect(within(card).queryByTestId('tiempo-ocupada')).not.toBeInTheDocument();
  });

  it('FE-005, RF-011, RF-023: reasignar actualiza el nombre del mesero sin seleccionar la mesa', async () => {
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView onSelectMesa={onSelect} />
      </QueryClientProvider>,
    );
    const card = await screen.findByTestId('mesa-card-3');
    expect(within(card).getByText('Carlos Gómez')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Reasignar mesero' }));
    fireEvent.change(screen.getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignación' }));
    expect(await within(card).findByText('Ana Martínez')).toBeInTheDocument();
    expect(within(card).queryByText('Carlos Gómez')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders loading skeletons while query is in loading state', () => {
    server.use(
      http.get('*/sala/mesas/estado-en-vivo', async () => {
        await new Promise(() => {}); // never resolves
      }),
    );

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('mesas-loading-skeletons')).toBeInTheDocument();
    const skeletons = screen.getAllByTestId('mesa-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(8);
  });

  it('renders error message and retry button when HTTP query fails, recovering on retry', async () => {
    let callCount = 0;
    server.use(
      http.get('*/sala/mesas/estado-en-vivo', () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Fallo simulado del servidor',
            },
            { status: 500 },
          );
        }
        return HttpResponse.json(mockDb.getMesasEnVivo(), { status: 200 });
      }),
    );

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Error al cargar las mesas del plano')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /reintentar/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);

    expect(await screen.findByText('Mesa 1')).toBeInTheDocument();
  });

  it('renders the reactive list of tables and summary badges upon receiving data from MSW', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Mesa 1')).toBeInTheDocument();
    expect(screen.getByText('Mesa 2')).toBeInTheDocument();
    expect(screen.getByText('Mesa 3')).toBeInTheDocument();
    expect(screen.getByText('Mesa 4')).toBeInTheDocument();

    // Summary badges
    expect(screen.getByText(/Total:/i)).toBeInTheDocument();
    expect(screen.getByText(/Disponibles:/i)).toBeInTheDocument();
    expect(screen.getByText(/Ocupadas:/i)).toBeInTheDocument();
    expect(screen.getByText(/Limpieza pendiente:/i)).toBeInTheDocument();
    expect(screen.getByText(/Reserva próxima:/i)).toBeInTheDocument();

    // Union tables show joined table numbers
    expect(screen.getAllByText('Unidos: 5 y 6')).toHaveLength(2);
  });

  it('filters tables properly when switching zone tabs', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Mesa 1')).toBeInTheDocument(); // Principal
    expect(screen.getByText('Mesa 4')).toBeInTheDocument(); // Terraza
    expect(screen.getByText('Mesa 7')).toBeInTheDocument(); // Bar

    // Click Terraza tab
    const terrazaTab = screen.getByRole('tab', { name: 'Terraza' });
    fireEvent.click(terrazaTab);

    // Only Terraza tables should be visible
    expect(screen.getByText('Mesa 4')).toBeInTheDocument();
    expect(screen.getByText('Mesa 5')).toBeInTheDocument();
    expect(screen.getByText('Mesa 6')).toBeInTheDocument();
    expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Mesa 7')).not.toBeInTheDocument();

    // Click Bar tab
    const barTab = screen.getByRole('tab', { name: 'Bar' });
    fireEvent.click(barTab);
    expect(screen.getByText('Mesa 7')).toBeInTheDocument();
    expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument();

    // Switch back to Todas
    const todasTab = screen.getByRole('tab', { name: 'Todas' });
    fireEvent.click(todasTab);
    expect(screen.getByText('Mesa 1')).toBeInTheDocument();
    expect(screen.getByText('Mesa 4')).toBeInTheDocument();
  });

  it('displays empty state when filtered by a zone without tables or when table list is empty', async () => {
    server.use(
      http.get('*/sala/mesas/estado-en-vivo', () => {
        return HttpResponse.json([], { status: 200 });
      }),
    );

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('No hay mesas registradas en esta zona')).toBeInTheDocument();
    expect(
      screen.getByText('Actualmente no hay ninguna mesa configurada en el sistema.'),
    ).toBeInTheDocument();
  });

  it('handles table selection and invokes onSelectMesa and onAccionMesa callbacks', async () => {
    const handleSelect = vi.fn();
    const handleAccion = vi.fn();

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView onSelectMesa={handleSelect} onAccionMesa={handleAccion} />
      </QueryClientProvider>,
    );

    const mesa1Card = await screen.findByLabelText('Mesa 1');
    fireEvent.click(mesa1Card);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ numeroMesa: 1 }));

    const verMesaButtons = screen.getAllByRole('button', { name: /ver mesa/i });
    fireEvent.click(verMesaButtons[0]);

    expect(handleAccion).toHaveBeenCalledTimes(1);
    expect(handleAccion).toHaveBeenCalledWith(expect.objectContaining({ numeroMesa: 1 }));
  });

  it('opens OcuparMesaModal when clicking on a free table and displays toast upon successful occupancy', async () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <PlanoSalaView />
      </QueryClientProvider>,
    );

    // Click en Mesa 1 (Libre)
    const mesa1Card = await screen.findByLabelText('Mesa 1');
    fireEvent.click(mesa1Card);

    // Modal abierto
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ocupar Mesa 1')).toBeInTheDocument();

    // Seleccionamos mesero
    const selectMesero = screen.getByLabelText(/mesero responsable/i);
    fireEvent.change(selectMesero, {
      target: { value: 'd1000000-0000-4000-8000-000000000001' },
    });

    // Confirmamos ocupación
    const submitBtn = screen.getByRole('button', { name: /confirmar ocupación/i });
    fireEvent.click(submitBtn);

    // Modal se cierra y aparece el toast de éxito
    expect(await screen.findByTestId('toast-ocupacion-exitosa')).toBeInTheDocument();
    expect(screen.getByText('Mesa 1 ocupada exitosamente.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
