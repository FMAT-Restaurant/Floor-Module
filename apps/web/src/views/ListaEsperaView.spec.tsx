import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { Socket } from 'socket.io-client';
import { EstadoEspera, EstadoMesa, FIXTURE_ESPERA_IDS, FIXTURE_MESA_IDS } from '@floor/shared';
import { App } from '../App';
import { SalaSocketProvider } from '../context';
import { mockDb } from '../mocks/db';
import { server } from '../mocks/server';
import { mockSalaSimulation } from '../mocks/simulation';
import { createTestQueryClient } from '../test/test-utils';
import { ListaEsperaView, type ListaEsperaViewProps } from './ListaEsperaView';

const FIXED_NOW = new Date('2026-10-11T13:45:00.000Z');
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

function renderListaEsperaView(props: ListaEsperaViewProps = {}, customSocket?: Socket) {
  const client = createTestQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <SalaSocketProvider socket={customSocket} queryClient={client} autoConnect={false}>
        <ListaEsperaView now={FIXED_NOW} {...props} />
      </SalaSocketProvider>
    </QueryClientProvider>,
  );
}

describe('FE-010 · Vista de Lista de Espera Presencial y Alertas de Mesa Compatible (ListaEsperaView)', () => {
  describe('1. Renderizado de la cola en orden FIFO y badges de estado (RF-025, SPEC §5.6, RN-17)', () => {
    it('muestra las entradas activas ordenadas por horaLlegada ASC con tiempo de espera, mesa asignada y badges semánticos', async () => {
      renderListaEsperaView();

      const tabla = await screen.findByRole('table', { name: 'Cola de lista de espera' });
      const filas = within(tabla).getAllByTestId(/^espera-row-/);
      expect(filas).toHaveLength(2);

      // #1: Gabriel Torres (13:15Z -> 30 min de espera en FIXED_NOW 13:45Z), En espera, 2 personas
      expect(filas[0]).toHaveTextContent('#1');
      expect(filas[0]).toHaveTextContent('Gabriel Torres');
      expect(filas[0]).toHaveTextContent('+52 999 111 2233');
      expect(filas[0]).toHaveTextContent('2 personas');
      expect(filas[0]).toHaveTextContent('30 min');
      expect(filas[0]).toHaveTextContent('Sin mesa asignada');

      const badgeEnEspera = within(filas[0]).getByTestId(`badge-estado-${EstadoEspera.EN_ESPERA}`);
      expect(badgeEnEspera).toHaveTextContent('En espera');
      expect(badgeEnEspera.className).toContain('bg-amber-50');

      // #2: Valeria Méndez (13:20Z -> 25 min de espera en FIXED_NOW 13:45Z), Notificado, Mesa 4 · Terraza
      expect(filas[1]).toHaveTextContent('#2');
      expect(filas[1]).toHaveTextContent('Valeria Méndez');
      expect(filas[1]).toHaveTextContent('+52 999 444 5566');
      expect(filas[1]).toHaveTextContent('4 personas');
      expect(filas[1]).toHaveTextContent('25 min');
      expect(filas[1]).toHaveTextContent('Mesa 4 · Terraza');

      const badgeNotificado = within(filas[1]).getByTestId(
        `badge-estado-${EstadoEspera.NOTIFICADO}`,
      );
      expect(badgeNotificado).toHaveTextContent('Notificado');
      expect(badgeNotificado.className).toContain('bg-blue-50');

      // Verifica contadores de resumen
      expect(screen.getByTestId('contador-espera-activos')).toHaveTextContent('En cola activa:2');
      expect(screen.getByTestId('contador-espera-en-espera')).toHaveTextContent('En espera:1');
      expect(screen.getByTestId('contador-espera-notificado')).toHaveTextContent('Notificado:1');
    });

    it('permite filtrar por pestañas de estado y navegar con teclado', async () => {
      renderListaEsperaView();
      await screen.findByRole('table', { name: 'Cola de lista de espera' });

      const tablist = screen.getByRole('tablist', { name: 'Filtrar lista de espera por estado' });

      // Filtrar por En espera
      fireEvent.click(within(tablist).getByRole('tab', { name: 'En espera' }));
      expect(await screen.findByText('Gabriel Torres')).toBeInTheDocument();
      expect(screen.queryByText('Valeria Méndez')).not.toBeInTheDocument();

      // Navegación por teclado: ArrowRight -> Notificado
      const tabEnEspera = within(tablist).getByRole('tab', { name: 'En espera' });
      fireEvent.keyDown(tabEnEspera, { key: 'ArrowRight' });
      expect(within(tablist).getByRole('tab', { name: 'Notificado' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(await screen.findByText('Valeria Méndez')).toBeInTheDocument();
      expect(screen.queryByText('Gabriel Torres')).not.toBeInTheDocument();

      // Filtrar por Sentado
      fireEvent.click(within(tablist).getByRole('tab', { name: 'Sentado' }));
      expect(await screen.findByText('David Campos')).toBeInTheDocument();
      const badgeSentado = screen.getByTestId(`badge-estado-${EstadoEspera.SENTADO}`);
      expect(badgeSentado.className).toContain('bg-emerald-50');

      // Filtrar por Cancelado
      fireEvent.click(within(tablist).getByRole('tab', { name: 'Cancelado' }));
      expect(await screen.findByText('Mónica Ruiz')).toBeInTheDocument();
      const badgeCancelado = screen.getByTestId(`badge-estado-${EstadoEspera.CANCELADO}`);
      expect(badgeCancelado.className).toContain('bg-gray-100');
    });
  });

  describe('2. Formulario rápido para registrar cliente en espera (RF-021)', () => {
    it('registra un nuevo cliente mediante POST /sala/espera, limpia el formulario y actualiza la cola', async () => {
      renderListaEsperaView();
      await screen.findByRole('table', { name: 'Cola de lista de espera' });

      const formSection = screen.getByTestId('formulario-registro-espera');
      const inputNombre = within(formSection).getByLabelText(/Nombre del cliente/);
      const inputTelefono = within(formSection).getByLabelText(/Teléfono de contacto/);
      const inputPersonas = within(formSection).getByLabelText(/Cantidad de personas/);

      fireEvent.change(inputNombre, { target: { value: 'Roberto Gómez' } });
      fireEvent.change(inputTelefono, { target: { value: '+52 999 888 7766' } });
      fireEvent.click(within(formSection).getByRole('button', { name: '4p' }));
      expect((inputPersonas as HTMLInputElement).value).toBe('4');

      fireEvent.click(within(formSection).getByRole('button', { name: /Registrar en espera/i }));

      expect(await screen.findByText('Roberto Gómez')).toBeInTheDocument();
      expect(screen.getByTestId('espera-notice-banner')).toHaveTextContent(
        'Cliente "Roberto Gómez" agregado a la lista de espera.',
      );

      // El formulario se limpia tras el éxito
      expect((inputNombre as HTMLInputElement).value).toBe('');
      expect((inputTelefono as HTMLInputElement).value).toBe('');
      expect((inputPersonas as HTMLInputElement).value).toBe('2');
    });

    it('valida los campos obligatorios antes de enviar la petición y preserva los datos si ocurre un error de API', async () => {
      const spyCrear = vi.spyOn(mockDb, 'crearEspera');
      renderListaEsperaView();
      await screen.findByRole('table', { name: 'Cola de lista de espera' });

      const formSection = screen.getByTestId('formulario-registro-espera');
      const inputNombre = within(formSection).getByLabelText(/Nombre del cliente/);
      const inputTelefono = within(formSection).getByLabelText(/Teléfono de contacto/);
      const inputPersonas = within(formSection).getByLabelText(/Cantidad de personas/);

      // Intento con datos inválidos
      fireEvent.change(inputNombre, { target: { value: '   ' } });
      fireEvent.change(inputTelefono, { target: { value: '123' } });
      fireEvent.change(inputPersonas, { target: { value: '0' } });

      fireEvent.click(within(formSection).getByRole('button', { name: /Registrar en espera/i }));

      expect(within(formSection).getAllByRole('alert')).toHaveLength(3);
      expect(spyCrear).not.toHaveBeenCalled();

      // Simular fallo de servidor al enviar datos válidos: no debe vaciar el formulario
      server.use(
        http.post('*/sala/espera', () =>
          HttpResponse.json(
            {
              statusCode: 500,
              code: 'ERROR_INTERNO',
              message: 'Error temporal al guardar en lista de espera',
            },
            { status: 500 },
          ),
        ),
      );

      fireEvent.change(inputNombre, { target: { value: 'Cliente Persistente' } });
      fireEvent.change(inputTelefono, { target: { value: '+52 999 333 4455' } });
      fireEvent.change(inputPersonas, { target: { value: '3' } });

      fireEvent.click(within(formSection).getByRole('button', { name: /Registrar en espera/i }));

      expect(await screen.findByTestId('espera-form-api-error')).toHaveTextContent(
        'Error temporal al guardar en lista de espera',
      );
      expect((inputNombre as HTMLInputElement).value).toBe('Cliente Persistente');
      expect((inputTelefono as HTMLInputElement).value).toBe('+52 999 333 4455');
      expect((inputPersonas as HTMLInputElement).value).toBe('3');
    });
  });

  describe('3. Acciones de transición de estado en la cola (Sentar, Cancelar, Volver a espera · RF-022)', () => {
    it('transiciona un turno a Sentado al hacer clic en "Sentar cliente"', async () => {
      renderListaEsperaView();

      const filaGabriel = await screen.findByTestId(
        `espera-row-${FIXTURE_ESPERA_IDS.ESPERA_1_EN_ESPERA}`,
      );
      fireEvent.click(within(filaGabriel).getByRole('button', { name: 'Sentar cliente' }));

      expect(await screen.findByTestId('espera-notice-banner')).toHaveTextContent(
        'Turno de "Gabriel Torres" marcado como Sentado.',
      );
      expect(
        screen.queryByTestId(`espera-row-${FIXTURE_ESPERA_IDS.ESPERA_1_EN_ESPERA}`),
      ).not.toBeInTheDocument();

      // Al cambiar a la pestaña Sentado aparece Gabriel Torres
      const tablist = screen.getByRole('tablist', { name: 'Filtrar lista de espera por estado' });
      fireEvent.click(within(tablist).getByRole('tab', { name: 'Sentado' }));
      expect(await screen.findByText('Gabriel Torres')).toBeInTheDocument();
    });

    it('transiciona un turno a Cancelado al hacer clic en "Cancelar espera"', async () => {
      renderListaEsperaView();

      const filaGabriel = await screen.findByTestId(
        `espera-row-${FIXTURE_ESPERA_IDS.ESPERA_1_EN_ESPERA}`,
      );
      fireEvent.click(within(filaGabriel).getByRole('button', { name: 'Cancelar espera' }));

      expect(await screen.findByTestId('espera-notice-banner')).toHaveTextContent(
        'Turno de "Gabriel Torres" cancelado de la lista de espera.',
      );
      expect(
        screen.queryByTestId(`espera-row-${FIXTURE_ESPERA_IDS.ESPERA_1_EN_ESPERA}`),
      ).not.toBeInTheDocument();
    });

    it('permite devolver un cliente Notificado a "En espera" limpiando la mesa asignada (SPEC §4.3)', async () => {
      renderListaEsperaView();

      const filaValeria = await screen.findByTestId(
        `espera-row-${FIXTURE_ESPERA_IDS.ESPERA_2_NOTIFICADO}`,
      );
      expect(filaValeria).toHaveTextContent('Mesa 4 · Terraza');

      fireEvent.click(within(filaValeria).getByRole('button', { name: 'Volver a espera' }));

      expect(await screen.findByTestId('espera-notice-banner')).toHaveTextContent(
        'Turno de "Valeria Méndez" devuelto a En espera.',
      );

      const filaActualizada = await screen.findByTestId(
        `espera-row-${FIXTURE_ESPERA_IDS.ESPERA_2_NOTIFICADO}`,
      );
      expect(filaActualizada).toHaveTextContent('Sin mesa asignada');
      expect(
        within(filaActualizada).getByTestId(`badge-estado-${EstadoEspera.EN_ESPERA}`),
      ).toBeInTheDocument();
    });
  });

  describe('4. Recepción de evento WebSocket espera.mesa_disponible y asignación directa (RF-020, RN-17, Flujo F4)', () => {
    it('muestra alerta destacada al recibir espera.mesa_disponible por WebSocket y permite asignar mesa directamente', async () => {
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

      const onAsignarMock = vi.fn();
      renderListaEsperaView({ onAsignarMesaDisponible: onAsignarMock }, mockSocket);

      await screen.findByText('Gabriel Torres');

      const wsPayload = {
        mesaId: FIXTURE_MESA_IDS.MESA_1,
        esperaId: FIXTURE_ESPERA_IDS.ESPERA_1_EN_ESPERA,
        cliente: {
          nombre: 'Gabriel Torres',
          cantidadPersonas: 2,
        },
      };

      act(() => {
        listeners.get('espera.mesa_disponible')?.forEach((cb) => cb(wsPayload));
      });

      const alerta = await screen.findByTestId('alerta-mesa-disponible-ws');
      expect(alerta).toHaveTextContent('¡Mesa compatible disponible para lista de espera!');
      expect(alerta).toHaveTextContent('Gabriel Torres');
      expect(alerta).toHaveTextContent('2 personas');
      expect(alerta).toHaveTextContent('Mesa 1 (Principal)');

      // Acción directa para asignar la mesa y sentar al cliente
      fireEvent.click(within(alerta).getByTestId('btn-asignar-mesa-alerta'));

      expect(onAsignarMock).toHaveBeenCalledWith(wsPayload);
      expect(await screen.findByTestId('espera-notice-banner')).toHaveTextContent(
        'Turno de "Gabriel Torres" marcado como Sentado.',
      );
      expect(screen.queryByTestId('alerta-mesa-disponible-ws')).not.toBeInTheDocument();
    });

    it('reacciona al flujo F4 cuando una mesa en Limpieza pendiente pasa a Libre y notifica al primer cliente compatible en FIFO', async () => {
      renderListaEsperaView();
      await screen.findByText('Gabriel Torres');

      // MESA_4 está en Limpieza pendiente (capacidad 6). Al pasar a Libre, notifica en FIFO a Gabriel Torres (2 pers)
      act(() => {
        mockSalaSimulation.simulateMesaEstadoTransition(FIXTURE_MESA_IDS.MESA_4, EstadoMesa.LIBRE);
      });

      const alerta = await screen.findByTestId('alerta-mesa-disponible-ws');
      expect(alerta).toHaveTextContent('Gabriel Torres');
      expect(alerta).toHaveTextContent('Mesa 4 (Terraza)');

      // Permite descartar manualmente la alerta si el operador desea cerrarla
      fireEvent.click(
        within(alerta).getByRole('button', { name: 'Cerrar alerta de mesa disponible' }),
      );
      expect(screen.queryByTestId('alerta-mesa-disponible-ws')).not.toBeInTheDocument();
    });
  });

  describe('5. Estados de carga, vacío y error (Guía Visual §3.6 y §8)', () => {
    it('muestra skeletons durante la carga inicial de la cola', async () => {
      let resolver!: () => void;
      const espera = new Promise<void>((res) => {
        resolver = res;
      });

      server.use(
        http.get('*/sala/espera', async () => {
          await espera;
          return HttpResponse.json(mockDb.getEspera());
        }),
      );

      renderListaEsperaView();

      expect(screen.getByTestId('espera-loading-skeletons')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getAllByTestId('espera-skeleton')).toHaveLength(3);

      resolver();
      expect(await screen.findByText('Gabriel Torres')).toBeInTheDocument();
    });

    it('muestra el estado vacío cuando no hay comensales en la cola', async () => {
      server.use(http.get('*/sala/espera', () => HttpResponse.json([])));

      renderListaEsperaView();

      const empty = await screen.findByTestId('espera-empty-state');
      expect(empty).toHaveTextContent('No hay clientes en la lista de espera');
      expect(empty).toHaveTextContent(
        'Actualmente no hay comensales esperando mesa en la fila presencial.',
      );
    });

    it('muestra banner de error con botón Reintentar cuando falla GET /sala/espera', async () => {
      server.use(
        http.get('*/sala/espera', () =>
          HttpResponse.json(
            {
              statusCode: 500,
              code: 'ERROR_INTERNO',
              message: 'No se pudo conectar con el servicio de lista de espera',
            },
            { status: 500 },
          ),
        ),
      );

      renderListaEsperaView();

      const errorBanner = await screen.findByTestId('espera-error-banner');
      expect(errorBanner).toHaveTextContent('Error al cargar la lista de espera');
      expect(errorBanner).toHaveTextContent(
        'No se pudo conectar con el servicio de lista de espera',
      );

      server.resetHandlers();
      fireEvent.click(within(errorBanner).getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('Gabriel Torres')).toBeInTheDocument();
    });
  });

  describe('6. Integración de navegación en App', () => {
    it('navega a ListaEsperaView al seleccionar la pestaña "Lista de espera" en App', async () => {
      const client = createTestQueryClient();
      clients.push(client);
      render(
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>,
      );

      const tabEspera = screen.getByRole('tab', { name: 'Lista de espera' });
      fireEvent.click(tabEspera);

      expect(tabEspera).toHaveAttribute('aria-selected', 'true');
      expect(
        await screen.findByRole('heading', { name: 'Lista de espera presencial' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('formulario-registro-espera')).toBeInTheDocument();
    });
  });
});
