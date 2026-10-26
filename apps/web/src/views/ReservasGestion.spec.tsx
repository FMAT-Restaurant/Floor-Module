import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { EstadoReserva, FIXTURE_RESERVA_IDS } from '@floor/shared';
import { SalaSocketProvider } from '../context';
import { mockDb } from '../mocks/db';
import { server } from '../mocks/server';
import { createTestQueryClient } from '../test/test-utils';
import { ReservasView } from './ReservasView';

const clients: QueryClient[] = [];
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T10:00:00-06:00'));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  mockDb.reset();
  vi.useRealTimers();
});
afterAll(() => server.close());
async function abrirAgenda() {
  const client = createTestQueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <SalaSocketProvider queryClient={client} autoConnect={false}>
        <ReservasView initialFecha="2026-10-11" />
      </SalaSocketProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('table', { name: 'Agenda de reservas' });
  return client;
}
function fila() {
  return within(screen.getByTestId(`reserva-row-${FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA}`));
}
function campo(label: string, value: string) {
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(label, { exact: false }), {
    target: { value },
  });
}
async function abrirAlta() {
  await abrirAgenda();
  fireEvent.click(screen.getByRole('button', { name: 'Buscar disponibilidad' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar Mesa 7' }));
  campo('Nombre del contacto', 'Ana García');
  campo('Teléfono del contacto', '+52 999 123 4567');
}
function guardarAlta() {
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear reserva' }),
  );
}

describe('FE-008 · Gestión de reservas (RF-012–014, RF-017b, RF-024)', () => {
  it('crea una reserva y actualiza agenda y contadores (RF-012)', async () => {
    await abrirAlta();
    guardarAlta();
    await screen.findByText('Reserva creada correctamente.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByTestId('contador-reserva-total')).toHaveTextContent('Total:6');
  });

  it('abre el alta con mesa y criterios del buscador precargados', async () => {
    await abrirAgenda();
    expect(screen.queryByRole('button', { name: 'Crear reserva' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar disponibilidad' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar Mesa 7' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Hora de inicio', { exact: false })).toHaveValue('19:00');
    expect(dialog.getByLabelText('Duración', { exact: false })).toHaveValue(90);
    expect(dialog.getByLabelText('Cantidad de personas', { exact: false })).toHaveValue(2);
    expect(
      (dialog.getByLabelText('Mesa', { exact: false }) as HTMLSelectElement).selectedOptions[0],
    ).toHaveTextContent('Mesa 7');
  });

  it('valida contacto, capacidad, duración e inicio futuro sin enviar (RN-10)', async () => {
    const request = vi.fn();
    server.use(
      http.post('*/sala/reservas', () => {
        request();
        return HttpResponse.json({});
      }),
    );
    await abrirAlta();
    campo('Nombre del contacto', '');
    campo('Teléfono', 'abc');
    campo('Cantidad de personas', '99');
    campo('Duración', '10');
    campo('Fecha', '2026-10-10');
    guardarAlta();
    expect(screen.getByText(/Esta mesa admite hasta/)).toBeInTheDocument();
    expect(screen.getByText(/La duración mínima/)).toBeInTheDocument();
    expect(screen.getByText(/La reserva debe iniciar/)).toBeInTheDocument();
    expect(screen.getByText(/El nombre no puede/)).toBeInTheDocument();
    expect(screen.getByText(/El teléfono debe/)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([409, 500])('conserva los datos y permite reintentar tras error %s', async (status) => {
    server.use(
      http.post('*/sala/reservas', () =>
        status === 409
          ? HttpResponse.json(
              { statusCode: 409, code: 'RESERVA_SOLAPADA', message: 'Conflicto' },
              { status },
            )
          : HttpResponse.error(),
      ),
    );
    await abrirAlta();
    guardarAlta();
    await screen.findByRole('alert');
    expect(
      within(screen.getByRole('dialog')).getByLabelText('Nombre del contacto', { exact: false }),
    ).toHaveValue('Ana García');
    if (status === 409)
      expect(screen.getByText(/La mesa ya tiene una reserva/)).toBeInTheDocument();
    server.resetHandlers();
    guardarAlta();
    await screen.findByText('Reserva creada correctamente.');
  });

  it('reprograma enviando sólo cambios y lleva la agenda a la nueva fecha (RF-013)', async () => {
    let body: unknown;
    server.use(
      http.patch('*/sala/reservas/:id', async ({ request }) => {
        body = await request.clone().json();
        return undefined;
      }),
    );
    await abrirAgenda();
    fireEvent.click(fila().getByRole('button', { name: 'Reprogramar reserva' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
    campo('Fecha', '2026-10-12');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }),
    );
    await screen.findByText('Reserva reprogramada correctamente.');
    expect(body).toEqual({ fecha: '2026-10-12' });
    expect(screen.getByLabelText('Fecha de agenda')).toHaveValue('2026-10-12');
    expect(screen.getByText('Laura Pérez')).toBeInTheDocument();
  });

  it('conserva la reserva original y el formulario cuando la reprogramación se solapa (RN-09)', async () => {
    await abrirAgenda();
    fireEvent.click(fila().getByRole('button', { name: 'Reprogramar reserva' }));
    const select = within(screen.getByRole('dialog')).getByLabelText('Mesa', { exact: false });
    const option = within(select).getByRole('option', { name: /Mesa 1 ·/ }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value: option.value } });
    campo('Hora de inicio', '20:00');
    campo('Cantidad de personas', '2');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }),
    );
    await screen.findByText(/La mesa ya tiene una reserva/);
    expect(
      within(screen.getByRole('dialog')).getByLabelText('Hora de inicio', { exact: false }),
    ).toHaveValue('20:00');
    expect(fila().getByText('14:00 – 15:30')).toBeInTheDocument();
    expect(fila().getByText('Mesa 2 · Principal')).toBeInTheDocument();
  });

  it('requiere confirmación para cancelar y refresca estado y contadores (RF-014)', async () => {
    await abrirAgenda();
    fireEvent.click(fila().getByRole('button', { name: 'Cancelar reserva' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la agenda' }));
    expect(fila().getByTestId('badge-estado-Confirmada')).toBeInTheDocument();
    fireEvent.click(fila().getByRole('button', { name: 'Cancelar reserva' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar reserva' }),
    );
    await screen.findByText('Reserva cancelada correctamente.');
    expect(fila().getByTestId('badge-estado-Cancelada')).toBeInTheDocument();
    expect(fila().queryByRole('button')).not.toBeInTheDocument();
  });

  it('refresca la agenda ante TRANSICION_INVALIDA y no informa éxito', async () => {
    await abrirAgenda();
    fireEvent.click(fila().getByRole('button', { name: 'Cancelar reserva' }));
    mockDb.cancelarReserva(FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar reserva' }),
    );
    await screen.findByText(/La reserva o la mesa cambió/);
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar reserva' }),
      ).toBeDisabled(),
    );
    expect(fila().getByTestId('badge-estado-Cancelada')).toBeInTheDocument();
  });

  it('No-show sólo se habilita después de la tolerancia y exige confirmación (RN-11)', async () => {
    await abrirAgenda();
    const boton = fila().getByRole('button', { name: 'Registrar No-show' });
    expect(boton).toBeDisabled();
    act(() => vi.setSystemTime(new Date('2026-10-11T14:15:00-06:00')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(boton).toBeDisabled();
    act(() => vi.setSystemTime(new Date('2026-10-11T14:15:01-06:00')));
    await waitFor(() => expect(boton).toBeEnabled(), { timeout: 2000 });
    fireEvent.click(boton);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Registrar No-show' }),
    );
    await screen.findByText('No-show registrado correctamente.');
    expect(fila().getByTestId(`badge-estado-${EstadoReserva.NO_SHOW}`)).toBeInTheDocument();
  });

  it.each([
    ['Abrir calendario', 'componente-calendario', 'Fecha'],
    ['Abrir selector de hora', null, 'Hora de inicio'],
  ])(
    'Escape descarta %s sin perder el formulario ni sus datos',
    async (boton, calendario, label) => {
      await abrirAlta();
      const dialog = screen.getByRole('dialog');
      const nombre = within(dialog).getByLabelText('Nombre del contacto', { exact: false });
      fireEvent.change(nombre, { target: { value: 'Contacto conservado' } });
      fireEvent.click(within(dialog).getByRole('button', { name: boton }));
      if (calendario) expect(screen.getByTestId(calendario)).toBeInTheDocument();
      else expect(within(dialog).getByRole('button', { name: 'Listo' })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBe(dialog);
      expect(nombre).toHaveValue('Contacto conservado');
      if (calendario) expect(screen.queryByTestId(calendario)).not.toBeInTheDocument();
      else expect(within(dialog).queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText(new RegExp(`^${label}`))).toHaveFocus();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('bloquea doble envío y cierre durante la petición', async () => {
    let peticiones = 0;
    server.use(
      http.post('*/sala/reservas', async () => {
        peticiones += 1;
        await delay(150);
        return HttpResponse.json(
          { statusCode: 409, code: 'RESERVA_SOLAPADA', message: 'Conflicto' },
          { status: 409 },
        );
      }),
    );
    await abrirAlta();
    guardarAlta();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Guardando…' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar modal' })).toBeDisabled();
    await screen.findByText(/La mesa ya tiene una reserva/);
    expect(peticiones).toBe(1);
  });
});
