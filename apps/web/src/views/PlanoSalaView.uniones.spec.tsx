import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { FIXTURE_MESERO_IDS } from '@floor/shared';
import { server } from '../mocks/server';
import { mockDb } from '../mocks/db';
import { createTestQueryClient } from '../test/test-utils';
import { PlanoSalaView } from './PlanoSalaView';

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

function renderPlano() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <PlanoSalaView />
    </QueryClientProvider>,
  );
}

function cardButton(numero: number) {
  return within(screen.getByTestId(`mesa-card-${numero}`)).getByRole('button', {
    name: `Mesa ${numero}`,
  });
}

async function entrarModoUnion() {
  await screen.findByTestId('mesa-card-1');
  fireEvent.click(screen.getByRole('button', { name: 'Unir mesas' }));
}

describe('PlanoSalaView · FE-009 uniones de mesas', () => {
  it('RN-12, RF-018: al elegir la primera mesa se deshabilitan las de otra zona y las no libres', async () => {
    renderPlano();
    await entrarModoUnion();

    fireEvent.click(cardButton(1)); // Principal · Libre

    expect(cardButton(1)).toHaveAttribute('aria-pressed', 'true');
    expect(cardButton(2)).toBeEnabled(); // Principal · Libre
    expect(cardButton(3)).toBeDisabled(); // Principal · Ocupada
    expect(cardButton(4)).toBeDisabled(); // Terraza · Limpieza pendiente
    expect(cardButton(5)).toBeDisabled(); // Terraza · en unión
    expect(cardButton(7)).toBeDisabled(); // Bar · otra zona
  });

  it('RF-018: el panel inferior muestra el aforo total consolidado y exige mínimo 2 mesas y mesero', async () => {
    renderPlano();
    await entrarModoUnion();

    const panel = screen.getByRole('region', { name: 'Unión de mesas' });
    const unir = within(panel).getByRole('button', { name: 'Unir mesas' });
    expect(unir).toBeDisabled();

    fireEvent.click(cardButton(1));
    expect(within(panel).getByTestId('aforo-total')).toHaveTextContent('2 personas');
    expect(unir).toBeDisabled();

    fireEvent.click(cardButton(2));
    expect(within(panel).getByTestId('aforo-total')).toHaveTextContent('6 personas');
    expect(unir).toBeDisabled(); // aún falta el mesero

    fireEvent.change(within(panel).getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    expect(unir).toBeEnabled();
  });

  it('RF-018, RNF-004: crea la unión (forzando la reserva próxima de la mesa 2), actualiza el plano y sale del modo unión', async () => {
    renderPlano();
    await entrarModoUnion();

    fireEvent.click(cardButton(1));
    fireEvent.click(cardButton(2));
    const panel = screen.getByRole('region', { name: 'Unión de mesas' });
    fireEvent.change(within(panel).getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir mesas' }));

    // RN-02: la mesa 2 tiene reserva próxima → advertencia y confirmación explícita
    expect(await within(panel).findByRole('alert')).toHaveTextContent(/reserva próxima/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir de todos modos' }));

    const card1 = screen.getByTestId('mesa-card-1');
    expect(await within(card1).findByText('Unidos: 1 y 2')).toBeInTheDocument();
    expect(within(card1).getByText('Ocupada')).toBeInTheDocument();
    expect(within(screen.getByTestId('mesa-card-2')).getByText('Ocupada')).toBeInTheDocument();
    expect(await screen.findByText(/Mesas 1 y 2 unidas exitosamente/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Unión de mesas' })).not.toBeInTheDocument();
  });

  it('RN-12: muestra un mensaje claro cuando el backend responde 409 ZONA_INCOMPATIBLE', async () => {
    server.use(
      http.post('*/sala/mesas/uniones', () =>
        HttpResponse.json(
          { statusCode: 409, code: 'ZONA_INCOMPATIBLE', message: 'Zonas distintas' },
          { status: 409 },
        ),
      ),
    );
    renderPlano();
    await entrarModoUnion();

    fireEvent.click(cardButton(1));
    fireEvent.click(cardButton(2));
    const panel = screen.getByRole('region', { name: 'Unión de mesas' });
    fireEvent.change(within(panel).getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir mesas' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(/misma zona/);
    // La selección y el panel se conservan para reintentar
    expect(cardButton(1)).toHaveAttribute('aria-pressed', 'true');
    expect(cardButton(2)).toHaveAttribute('aria-pressed', 'true');
  });

  it('RN-03: ante SOBRECUPO_DETECTADO ofrece "Unir de todos modos" y reenvía con forzarSobrecupo', async () => {
    const peticiones: Array<Record<string, unknown>> = [];
    server.use(
      http.post('*/sala/mesas/uniones', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        peticiones.push(body);
        if (!body.forzarSobrecupo) {
          return HttpResponse.json(
            { statusCode: 409, code: 'SOBRECUPO_DETECTADO', message: 'Sobrecupo' },
            { status: 409 },
          );
        }
        return HttpResponse.json(
          {
            unionId: crypto.randomUUID(),
            mesasIds: body.mesasIds,
            estado: 'Ocupada',
            sessionId: crypto.randomUUID(),
          },
          { status: 201 },
        );
      }),
    );
    renderPlano();
    await entrarModoUnion();

    fireEvent.click(cardButton(1));
    fireEvent.click(cardButton(2));
    const panel = screen.getByRole('region', { name: 'Unión de mesas' });
    fireEvent.change(within(panel).getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.change(within(panel).getByLabelText('Comensales'), { target: { value: '9' } });
    // Validación previa del aforo conjunto: aviso inmediato, antes de enviar
    expect(within(panel).getByRole('status')).toHaveTextContent(/Supera el aforo total \(6\)/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir mesas' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(/supera el aforo/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Unir de todos modos' }));

    expect(await screen.findByText(/Mesas 1 y 2 unidas exitosamente/)).toBeInTheDocument();
    expect(peticiones).toHaveLength(2);
    expect(peticiones[0].forzarSobrecupo).toBeUndefined();
    expect(peticiones[1].forzarSobrecupo).toBe(true);
    expect(peticiones[1].totalPersonas).toBe(9);
  });

  it('RF-019, RN-14: liberar unión pide confirmación y deja las mesas en Limpieza pendiente', async () => {
    renderPlano();
    const card5 = await screen.findByTestId('mesa-card-5');
    expect(within(card5).getByText(/Unidos: 5 y 6/)).toBeInTheDocument();

    fireEvent.click(within(card5).getByRole('button', { name: 'Liberar unión' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Limpieza pendiente/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar liberación' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await within(card5).findByText('Limpieza')).toBeInTheDocument();
    expect(within(screen.getByTestId('mesa-card-6')).getByText('Limpieza')).toBeInTheDocument();
    expect(within(card5).queryByText(/Unidos/)).not.toBeInTheDocument();
  });

  it('RF-019: cancelar la confirmación no modifica la unión', async () => {
    renderPlano();
    const card5 = await screen.findByTestId('mesa-card-5');

    fireEvent.click(within(card5).getByRole('button', { name: 'Liberar unión' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card5).getByText(/Unidos: 5 y 6/)).toBeInTheDocument();
  });

  it('cancelar el modo unión limpia la selección y restaura las acciones de las cards', async () => {
    renderPlano();
    await entrarModoUnion();
    fireEvent.click(cardButton(1));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar unión' }));

    expect(screen.queryByRole('region', { name: 'Unión de mesas' })).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('mesa-card-1')).getByRole('button', { name: 'Ver mesa' }),
    ).toBeInTheDocument();
  });
});
