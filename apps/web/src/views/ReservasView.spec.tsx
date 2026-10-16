import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { Socket } from 'socket.io-client';
import { EstadoReserva, FIXTURE_MESA_IDS, FIXTURE_RESERVA_IDS } from '@floor/shared';
import { App } from '../App';
import { SalaSocketProvider } from '../context';
import { getFechaLocalHoy } from '../lib/reservas';
import { mockDb } from '../mocks/db';
import { server } from '../mocks/server';
import { createTestQueryClient } from '../test/test-utils';
import { ReservasView, type ReservasViewProps } from './ReservasView';

const FECHA_FIXTURE = '2026-10-11';
const clients: QueryClient[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  mockDb.reset();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
});

function renderReservasView(props: ReservasViewProps = {}, customSocket?: Socket) {
  const client = createTestQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <SalaSocketProvider socket={customSocket} queryClient={client} autoConnect={false}>
        <ReservasView {...props} />
      </SalaSocketProvider>
    </QueryClientProvider>,
  );
}

describe('FE-007 · Vista de Agenda y Disponibilidad de Reservas (ReservasView)', () => {
  describe('1. Renderizado de la agenda diaria y bloques horarios', () => {
    it('muestra las reservas del día ordenadas cronológicamente con horarios, cliente, mesa, aforo y badges de estado', async () => {
      renderReservasView({ initialFecha: FECHA_FIXTURE });

      const tabla = await screen.findByRole('table', { name: 'Agenda de reservas' });
      const filas = within(tabla).getAllByTestId(/^reserva-row-/);
      expect(filas).toHaveLength(5);

      // Verifica orden cronológico por horaInicio ASC: 11:00, 12:30, 14:00, 16:00, 20:00
      expect(filas[0]).toHaveTextContent('11:00 – 12:30');
      expect(filas[0]).toHaveTextContent('Elena Castillo');
      expect(filas[0]).toHaveTextContent('Mesa 7 · Bar');
      expect(filas[0]).toHaveTextContent('2 personas');

      expect(filas[1]).toHaveTextContent('12:30 – 14:00');
      expect(filas[1]).toHaveTextContent('Sofía Romero');
      expect(filas[1]).toHaveTextContent('Mesa 3 · Principal');
      expect(filas[1]).toHaveTextContent('4 personas');

      expect(filas[2]).toHaveTextContent('14:00 – 15:30');
      expect(filas[2]).toHaveTextContent('Laura Pérez');
      expect(filas[2]).toHaveTextContent('+52 999 123 4567');
      expect(filas[2]).toHaveTextContent('Mesa 2 · Principal');
      expect(filas[2]).toHaveTextContent('4 personas');

      expect(filas[3]).toHaveTextContent('16:00 – 17:30');
      expect(filas[3]).toHaveTextContent('Jorge Morales');
      expect(filas[3]).toHaveTextContent('Mesa 4 · Terraza');
      expect(filas[3]).toHaveTextContent('6 personas');

      expect(filas[4]).toHaveTextContent('20:00 – 21:30');
      expect(filas[4]).toHaveTextContent('Mauricio Díaz');
      expect(filas[4]).toHaveTextContent('Mesa 1 · Principal');
      expect(filas[4]).toHaveTextContent('2 personas');

      // Verifica badges semánticos de estado (Guía Visual §2.1)
      const badgeConfirmada = within(filas[2]).getByTestId(
        `badge-estado-${EstadoReserva.CONFIRMADA}`,
      );
      expect(badgeConfirmada).toHaveTextContent('Confirmada');
      expect(badgeConfirmada.className).toContain('bg-blue-50');

      const badgeCompletada = within(filas[1]).getByTestId(
        `badge-estado-${EstadoReserva.COMPLETADA}`,
      );
      expect(badgeCompletada).toHaveTextContent('Completada');
      expect(badgeCompletada.className).toContain('bg-emerald-50');

      const badgeCancelada = within(filas[3]).getByTestId(
        `badge-estado-${EstadoReserva.CANCELADA}`,
      );
      expect(badgeCancelada).toHaveTextContent('Cancelada');
      expect(badgeCancelada.className).toContain('bg-gray-100');

      const badgeNoShow = within(filas[0]).getByTestId(`badge-estado-${EstadoReserva.NO_SHOW}`);
      expect(badgeNoShow).toHaveTextContent('No-show');
      expect(badgeNoShow.className).toContain('bg-red-50');

      // Verifica contadores rápidos del resumen diario
      expect(screen.getByTestId('contador-reserva-total')).toHaveTextContent('Total:5');
      expect(screen.getByTestId('contador-reserva-confirmada')).toHaveTextContent('Confirmada:2');
      expect(screen.getByTestId('contador-reserva-completada')).toHaveTextContent('Completada:1');
      expect(screen.getByTestId('contador-reserva-cancelada')).toHaveTextContent('Cancelada:1');
      expect(screen.getByTestId('contador-reserva-no-show')).toHaveTextContent('No-show:1');
    });
  });

  describe('2. Cambio de fecha y filtros de la agenda', () => {
    it('inicializa en la fecha local actual, permite cambiar de fecha y volver a "Hoy"', async () => {
      const hoy = getFechaLocalHoy();
      renderReservasView();

      const inputFecha = screen.getByLabelText('Fecha de agenda') as HTMLInputElement;
      expect(inputFecha.value).toBe(hoy);

      // Cambiar a la fecha del fixture (2026-10-11)
      fireEvent.change(inputFecha, { target: { value: FECHA_FIXTURE } });
      expect(await screen.findByText('Laura Pérez')).toBeInTheDocument();

      // Botón rápido "Hoy" regresa a la fecha actual
      fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
      expect(inputFecha.value).toBe(hoy);
    });

    it('filtra correctamente por pestañas de estado, mesa y franja horaria (incluyendo teclado)', async () => {
      renderReservasView({ initialFecha: FECHA_FIXTURE });
      await screen.findByRole('table', { name: 'Agenda de reservas' });

      const tablist = screen.getByRole('tablist', { name: 'Filtrar reservas por estado' });

      // Filtrar por Confirmada (2 reservas: Laura Pérez y Mauricio Díaz)
      fireEvent.click(within(tablist).getByRole('tab', { name: 'Confirmada' }));
      expect(screen.getByText('Laura Pérez')).toBeInTheDocument();
      expect(screen.getByText('Mauricio Díaz')).toBeInTheDocument();
      expect(screen.queryByText('Sofía Romero')).not.toBeInTheDocument();

      // Navegación por teclado en pestañas de estado: ArrowRight -> Completada
      const tabConfirmada = within(tablist).getByRole('tab', { name: 'Confirmada' });
      fireEvent.keyDown(tabConfirmada, { key: 'ArrowRight' });
      expect(within(tablist).getByRole('tab', { name: 'Completada' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByText('Sofía Romero')).toBeInTheDocument();
      expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();

      // Filtrar por Cancelada
      fireEvent.click(within(tablist).getByRole('tab', { name: 'Cancelada' }));
      expect(screen.getByText('Jorge Morales')).toBeInTheDocument();

      // Filtrar por No-show
      fireEvent.click(within(tablist).getByRole('tab', { name: 'No-show' }));
      expect(screen.getByText('Elena Castillo')).toBeInTheDocument();

      // Volver a Todas y filtrar por mesa y franja horaria
      fireEvent.click(within(tablist).getByRole('tab', { name: 'Todas' }));
      fireEvent.change(screen.getByLabelText('Filtrar por mesa'), {
        target: { value: FIXTURE_MESA_IDS.MESA_2 },
      });
      expect(screen.getByText('Laura Pérez')).toBeInTheDocument();
      expect(screen.queryByText('Mauricio Díaz')).not.toBeInTheDocument();

      // Resetear filtro de mesa y probar franja horaria "Noche (≥ 19:00)"
      fireEvent.change(screen.getByLabelText('Filtrar por mesa'), {
        target: { value: 'Todas' },
      });
      fireEvent.change(screen.getByLabelText('Franja horaria'), {
        target: { value: 'noche' },
      });
      expect(screen.getByText('Mauricio Díaz')).toBeInTheDocument();
      expect(screen.queryByText('Laura Pérez')).not.toBeInTheDocument();
    });
  });

  describe('3. Estados de carga, vacío, error y alertas en tiempo real', () => {
    it('muestra skeletons durante la carga de la agenda', async () => {
      let resolver!: () => void;
      const espera = new Promise<void>((res) => {
        resolver = res;
      });

      server.use(
        http.get('*/sala/reservas', async () => {
          await espera;
          return HttpResponse.json(mockDb.getReservas({ fecha: FECHA_FIXTURE }));
        }),
      );

      renderReservasView({ initialFecha: FECHA_FIXTURE });

      expect(screen.getByTestId('reservas-loading-skeletons')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getAllByTestId('reserva-skeleton')).toHaveLength(4);

      resolver();
      expect(await screen.findByText('Laura Pérez')).toBeInTheDocument();
    });

    it('muestra el estado vacío cuando no hay reservas para la fecha seleccionada', async () => {
      renderReservasView({ initialFecha: '2026-12-25' });

      const empty = await screen.findByTestId('reservas-empty-state');
      expect(empty).toHaveTextContent('No hay reservas para los criterios seleccionados');
      expect(empty).toHaveTextContent('2026-12-25');
    });

    it('muestra el banner de error y permite reintentar cuando falla GET /sala/reservas', async () => {
      server.use(
        http.get('*/sala/reservas', () =>
          HttpResponse.json(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Error interno al consultar la agenda',
            },
            { status: 500 },
          ),
        ),
      );

      renderReservasView({ initialFecha: FECHA_FIXTURE });

      const errorBanner = await screen.findByTestId('reservas-error-banner');
      expect(errorBanner).toHaveTextContent('Error al cargar la agenda de reservas');
      expect(errorBanner).toHaveTextContent('Error interno al consultar la agenda');

      server.resetHandlers();
      fireEvent.click(within(errorBanner).getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('Laura Pérez')).toBeInTheDocument();
    });

    it('RF-016: muestra un banner reactivo al recibir el evento WebSocket reserva.proxima_alerta', async () => {
      const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
      const mockSocket = {
        connected: true,
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(cb);
          return mockSocket;
        }),
        off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          listeners.get(event)?.delete(cb);
          return mockSocket;
        }),
        disconnect: vi.fn(),
      } as unknown as Socket;

      renderReservasView({ initialFecha: FECHA_FIXTURE }, mockSocket);
      await screen.findByText('Laura Pérez');

      act(() => {
        listeners.get('reserva.proxima_alerta')?.forEach((cb) =>
          cb({
            reservaId: FIXTURE_RESERVA_IDS.RESERVA_1_PROXIMA,
            mesaId: FIXTURE_MESA_IDS.MESA_2,
            nombreContacto: 'Laura Pérez',
            horaInicio: '14:00',
            minutosRestantes: 15,
            timestamp: '2026-10-11T13:45:00.000Z',
          }),
        );
      });

      const banner = await screen.findByTestId('alerta-reserva-proxima-ws');
      expect(banner).toHaveTextContent('Alerta de reserva próxima');
      expect(banner).toHaveTextContent('Laura Pérez');
      expect(banner).toHaveTextContent('Mesa 2 (Principal)');
      expect(banner).toHaveTextContent('14:00');
      expect(banner).toHaveTextContent('15 min');

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar alerta de reserva próxima' }));
      expect(screen.queryByTestId('alerta-reserva-proxima-ws')).not.toBeInTheDocument();
    });
  });

  describe('4. Buscador interactivo de disponibilidad (RF-015)', () => {
    it('consulta GET /sala/reservas/disponibilidad y resalta las mesas aptas excluyendo menor capacidad o reservas solapadas', async () => {
      const onSelectMock = vi.fn();
      renderReservasView({
        initialFecha: FECHA_FIXTURE,
        onSeleccionarMesaDisponible: onSelectMock,
      });

      const buscador = screen.getByTestId('buscador-disponibilidad');

      // En 2026-10-11, Laura Pérez tiene reserva Confirmada en Mesa 2 de 14:00 a 15:30.
      // Buscamos para 4 personas a las 14:30 con duración 60 min (14:30 - 15:30):
      // - Mesa 1 y Mesa 7 tienen capacidad 2 (< 4) -> excluidas
      // - Mesa 8 está inactiva -> excluida
      // - Mesa 2 tiene reserva Confirmada solapada (14:00 - 15:30) -> excluida
      // - Mesas aptas: Mesa 3 (4p), Mesa 4 (6p), Mesa 5 (4p), Mesa 6 (4p)
      fireEvent.change(within(buscador).getByLabelText(/Hora de inicio/), {
        target: { value: '14:30' },
      });
      fireEvent.click(within(buscador).getByRole('button', { name: '60m' }));
      fireEvent.change(within(buscador).getByLabelText(/Cantidad de personas/), {
        target: { value: '4' },
      });

      fireEvent.click(within(buscador).getByRole('button', { name: 'Buscar disponibilidad' }));

      const resultados = await screen.findByTestId('disponibilidad-resultados');
      expect(resultados).toHaveTextContent('4 mesas aptas');

      expect(within(resultados).getByTestId('mesa-disponible-card-3')).toHaveTextContent(
        'Disponible para reservar',
      );
      expect(within(resultados).getByTestId('mesa-disponible-card-4')).toHaveTextContent(
        '6 personas · Terraza',
      );
      expect(within(resultados).getByTestId('mesa-disponible-card-5')).toBeInTheDocument();
      expect(within(resultados).getByTestId('mesa-disponible-card-6')).toBeInTheDocument();

      // Excluidas por solapamiento o capacidad
      expect(within(resultados).queryByTestId('mesa-disponible-card-2')).not.toBeInTheDocument();
      expect(within(resultados).queryByTestId('mesa-disponible-card-1')).not.toBeInTheDocument();
      expect(within(resultados).queryByTestId('mesa-disponible-card-7')).not.toBeInTheDocument();

      // Verifica el callback onSeleccionarMesaDisponible (preparado para FE-008)
      fireEvent.click(within(resultados).getByRole('button', { name: 'Seleccionar Mesa 4' }));
      expect(onSelectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          mesaId: FIXTURE_MESA_IDS.MESA_4,
          numeroMesa: 4,
          capacidad: 6,
        }),
        {
          fecha: FECHA_FIXTURE,
          horaInicio: '14:30',
          duracion: 60,
          personas: 4,
        },
      );
    });

    it('muestra estado vacío informativo cuando ninguna mesa cumple con el aforo u horario', async () => {
      renderReservasView({ initialFecha: FECHA_FIXTURE });
      const buscador = screen.getByTestId('buscador-disponibilidad');

      fireEvent.change(within(buscador).getByLabelText(/Cantidad de personas/), {
        target: { value: '12' },
      });
      fireEvent.click(within(buscador).getByRole('button', { name: 'Buscar disponibilidad' }));

      const empty = await screen.findByTestId('disponibilidad-empty-state');
      expect(empty).toHaveTextContent('No hay mesas disponibles en ese horario');
    });

    it('valida los parámetros antes de disparar la consulta al endpoint de disponibilidad', () => {
      const spyDisponibilidad = vi.spyOn(mockDb, 'getDisponibilidad');
      renderReservasView({ initialFecha: FECHA_FIXTURE });
      const buscador = screen.getByTestId('buscador-disponibilidad');

      fireEvent.change(within(buscador).getByLabelText(/Duración/), {
        target: { value: '10' },
      });
      fireEvent.change(within(buscador).getByLabelText(/Cantidad de personas/), {
        target: { value: '0' },
      });

      fireEvent.click(within(buscador).getByRole('button', { name: 'Buscar disponibilidad' }));

      expect(within(buscador).getAllByRole('alert').length).toBeGreaterThanOrEqual(2);
      expect(spyDisponibilidad).not.toHaveBeenCalled();
    });

    it('muestra banner de error y permite reintentar cuando falla GET /sala/reservas/disponibilidad', async () => {
      server.use(
        http.get('*/sala/reservas/disponibilidad', () =>
          HttpResponse.json(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: 'Fallo al consultar disponibilidad',
            },
            { status: 500 },
          ),
        ),
      );

      renderReservasView({ initialFecha: FECHA_FIXTURE });
      const buscador = screen.getByTestId('buscador-disponibilidad');

      fireEvent.click(within(buscador).getByRole('button', { name: 'Buscar disponibilidad' }));

      const errorBanner = await screen.findByTestId('disponibilidad-error-banner');
      expect(errorBanner).toHaveTextContent('Fallo al consultar disponibilidad');

      server.resetHandlers();
      fireEvent.click(
        within(errorBanner).getByRole('button', { name: 'Reintentar disponibilidad' }),
      );

      expect(await screen.findByTestId('disponibilidad-resultados')).toBeInTheDocument();
    });
  });

  describe('5. Navegación en App', () => {
    it('cambia a ReservasView al seleccionar la pestaña "Reservas" en App', async () => {
      const client = createTestQueryClient();
      clients.push(client);
      render(
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>,
      );

      const tabReservas = screen.getByRole('tab', { name: 'Reservas' });
      fireEvent.click(tabReservas);

      expect(tabReservas).toHaveAttribute('aria-selected', 'true');
      expect(
        await screen.findByRole('heading', { name: 'Agenda de reservas' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('buscador-disponibilidad')).toBeInTheDocument();
    });
  });
});
