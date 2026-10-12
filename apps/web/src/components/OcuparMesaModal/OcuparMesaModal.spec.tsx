import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { EstadoMesa, FIXTURE_MESERO_IDS, type MesaEnVivoDto } from '@floor/shared';
import { server } from '../../mocks/server';
import { mockDb } from '../../mocks/db';
import { createTestQueryClient } from '../../test/test-utils';
import { OcuparMesaModal } from './OcuparMesaModal';

const mesaLibreMock: MesaEnVivoDto = {
  mesaId: 'a1000000-0000-4000-8000-000000000001',
  numeroMesa: 1,
  capacidad: 4,
  zona: 'Principal',
  estadoFisico: EstadoMesa.LIBRE,
  unionId: null,
  activo: true,
  tieneReservaProxima: false,
  ocupadaDesde: null,
  meseroId: null,
};

const mesaConReservaMock: MesaEnVivoDto = {
  mesaId: 'a1000000-0000-4000-8000-000000000002',
  numeroMesa: 2,
  capacidad: 4,
  zona: 'Terraza',
  estadoFisico: EstadoMesa.LIBRE,
  unionId: null,
  activo: true,
  tieneReservaProxima: true,
  ocupadaDesde: null,
  meseroId: null,
};

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

function renderModal(
  props: Partial<React.ComponentProps<typeof OcuparMesaModal>> = {},
  client: QueryClient = createTestQueryClient(),
) {
  const defaultProps = {
    mesa: mesaLibreMock,
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  return {
    ...render(
      <QueryClientProvider client={client}>
        <OcuparMesaModal {...defaultProps} {...props} />
      </QueryClientProvider>,
    ),
    client,
  };
}

describe('OcuparMesaModal Component', () => {
  it('no renderiza nada si isOpen es false o mesa es null', () => {
    const { rerender } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <OcuparMesaModal mesa={mesaLibreMock} isOpen={false} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <OcuparMesaModal mesa={null} isOpen={true} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('1. Renderizado del formulario: muestra datos de mesa, inputs y catálogo de meseros', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ocupar Mesa 1')).toBeInTheDocument();
    expect(screen.getByText('Capacidad máxima: 4 personas · Zona: Principal')).toBeInTheDocument();

    const inputComensales = screen.getByLabelText(/número de comensales/i);
    expect(inputComensales).toBeInTheDocument();
    expect(inputComensales).toHaveValue(1);

    const selectMesero = screen.getByLabelText(/mesero responsable/i);
    expect(selectMesero).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Carlos Gómez' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ana Martínez' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Roberto Sánchez' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar ocupación/i })).toBeInTheDocument();
  });

  it('2. Validación de campos obligatorios: no permite enviar si falta mesero o comensales < 1', () => {
    renderModal();

    const btnSubmit = screen.getByRole('button', { name: /confirmar ocupación/i });
    // Inicialmente no hay mesero seleccionado -> botón deshabilitado
    expect(btnSubmit).toBeDisabled();

    // Seleccionamos mesero
    const selectMesero = screen.getByLabelText(/mesero responsable/i);
    fireEvent.change(selectMesero, { target: { value: FIXTURE_MESERO_IDS.CARLOS } });
    expect(btnSubmit).toBeEnabled();

    // Comensales < 1
    const inputComensales = screen.getByLabelText(/número de comensales/i);
    fireEvent.change(inputComensales, { target: { value: '0' } });

    expect(
      screen.getByText('El número de comensales debe ser un entero mayor o igual a 1.'),
    ).toBeInTheDocument();
    expect(btnSubmit).toBeDisabled();
  });

  it('3. Detección de sobrecupo: comensales > capacidad muestra alerta ámbar y requiere confirmación', () => {
    renderModal({ mesa: mesaLibreMock }); // Capacidad 4

    const selectMesero = screen.getByLabelText(/mesero responsable/i);
    fireEvent.change(selectMesero, { target: { value: FIXTURE_MESERO_IDS.CARLOS } });

    const inputComensales = screen.getByLabelText(/número de comensales/i);
    fireEvent.change(inputComensales, { target: { value: '6' } });

    // Alerta ámbar presente
    expect(screen.getByTestId('alerta-sobrecupo')).toBeInTheDocument();
    expect(screen.getByText('Aforo excedido')).toBeInTheDocument();
    expect(
      screen.getByText('La mesa tiene capacidad para 4 personas y se registraron 6.'),
    ).toBeInTheDocument();

    const btnSubmit = screen.getByRole('button', { name: /confirmar ocupación/i });
    expect(btnSubmit).toBeDisabled();

    // Marcamos checkbox de sobrecupo
    const checkboxSobrecupo = screen.getByLabelText(/autorizar sobrecupo para esta mesa/i);
    fireEvent.click(checkboxSobrecupo);

    expect(btnSubmit).toBeEnabled();
  });

  it('4. Envío con forzarSobrecupo: incluye forzarSobrecupo: true en el payload', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('*/sala/mesas/:mesaId/ocupar', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          mesaId: mesaLibreMock.mesaId,
          estado: 'Ocupada',
          sessionId: 'b1000000-0000-4000-8000-000000000001',
        });
      }),
    );

    renderModal({ mesa: mesaLibreMock });

    fireEvent.change(screen.getByLabelText(/mesero responsable/i), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.change(screen.getByLabelText(/número de comensales/i), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByLabelText(/autorizar sobrecupo para esta mesa/i));

    fireEvent.click(screen.getByRole('button', { name: /confirmar ocupación/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    expect(capturedBody).toEqual({
      comensales: 5,
      meseroId: FIXTURE_MESERO_IDS.ANA,
      forzarSobrecupo: true,
    });
  });

  it('5. Detección de reserva próxima: muestra alerta azul y requiere forzarOcupacion', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('*/sala/mesas/:mesaId/ocupar', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          mesaId: mesaConReservaMock.mesaId,
          estado: 'Ocupada',
          sessionId: 'b1000000-0000-4000-8000-000000000001',
        });
      }),
    );

    renderModal({ mesa: mesaConReservaMock });

    // Alerta azul
    expect(screen.getByTestId('alerta-reserva-proxima')).toBeInTheDocument();
    expect(screen.getByText('Reserva próxima programada')).toBeInTheDocument();
    expect(
      screen.getByText('Esta mesa tiene una reserva confirmada en los próximos 30 minutos.'),
    ).toBeInTheDocument();

    const selectMesero = screen.getByLabelText(/mesero responsable/i);
    fireEvent.change(selectMesero, { target: { value: FIXTURE_MESERO_IDS.ROBERTO } });

    const btnSubmit = screen.getByRole('button', { name: /confirmar ocupación/i });
    expect(btnSubmit).toBeDisabled();

    // Marcamos checkbox de forzar ocupación
    const checkboxReserva = screen.getByLabelText(
      /ocupar de todos modos \(tiempo de servicio limitado\)/i,
    );
    fireEvent.click(checkboxReserva);

    expect(btnSubmit).toBeEnabled();
    fireEvent.click(btnSubmit);

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    expect(capturedBody).toEqual({
      comensales: 1,
      meseroId: FIXTURE_MESERO_IDS.ROBERTO,
      forzarOcupacion: true,
    });
  });

  it('6. Envío exitoso y cierre: llama a onClose, onSuccess e invalida las queries', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    server.use(
      http.post('*/sala/mesas/:mesaId/ocupar', () => {
        return HttpResponse.json({
          mesaId: mesaLibreMock.mesaId,
          estado: 'Ocupada',
          sessionId: 'b1000000-0000-4000-8000-000000000001',
        });
      }),
    );

    renderModal({ onClose: handleClose, onSuccess: handleSuccess }, queryClient);

    fireEvent.change(screen.getByLabelText(/mesero responsable/i), {
      target: { value: FIXTURE_MESERO_IDS.CARLOS },
    });

    fireEvent.click(screen.getByRole('button', { name: /confirmar ocupación/i }));

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledTimes(1);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['mesas'],
    });
  });

  it('7. Manejo de error 409: muestra el mensaje de error de ApiError y reactiva advertencias', async () => {
    server.use(
      http.post('*/sala/mesas/:mesaId/ocupar', () => {
        return HttpResponse.json(
          {
            statusCode: 409,
            code: 'SOBRECUPO_DETECTADO',
            message: 'La cantidad de comensales supera la capacidad permitida por aforo',
          },
          { status: 409 },
        );
      }),
    );

    renderModal();

    fireEvent.change(screen.getByLabelText(/mesero responsable/i), {
      target: { value: FIXTURE_MESERO_IDS.CARLOS },
    });

    fireEvent.click(screen.getByRole('button', { name: /confirmar ocupación/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('La cantidad de comensales supera la capacidad permitida por aforo'),
    ).toBeInTheDocument();
    // Activa la visualización de la confirmación de sobrecupo
    expect(screen.getByTestId('alerta-sobrecupo')).toBeInTheDocument();
  });

  it('soporta seleccion amigable mediante dropdowns y garantiza que reserva y espera sean mutuamente excluyentes', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('*/sala/mesas/:mesaId/ocupar', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          mesaId: mesaLibreMock.mesaId,
          estado: 'Ocupada',
          sessionId: 'b1000000-0000-4000-8000-000000000001',
        });
      }),
    );

    renderModal();

    fireEvent.change(screen.getByLabelText(/mesero responsable/i), {
      target: { value: FIXTURE_MESERO_IDS.CARLOS },
    });

    // Expandir opciones avanzadas
    fireEvent.click(screen.getByRole('button', { name: /opciones avanzadas/i }));

    const selectReserva = screen.getByLabelText(/reserva asociada/i);
    const selectEspera = screen.getByLabelText(/turno en lista de espera/i);

    // Opciones legibles para el host (sin UUIDs crudos)
    expect(screen.getByRole('option', { name: 'Sin reserva vinculada' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Mauricio Díaz · 2 pers\. \(20:00\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Sin turno en lista de espera' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Gabriel Torres · 2 pers\./i })).toBeInTheDocument();

    // 1. Seleccionamos la reserva de Mauricio Díaz (2 personas)
    fireEvent.change(selectReserva, {
      target: { value: 'b1000000-0000-4000-8000-000000000002' },
    });

    expect(selectReserva).toHaveValue('b1000000-0000-4000-8000-000000000002');
    expect(selectEspera).toHaveValue('');

    // 2. Al seleccionar luego el turno de lista de espera, la reserva se deselecciona automáticamente
    fireEvent.change(selectEspera, {
      target: { value: 'e1000000-0000-4000-8000-000000000001' },
    });

    expect(selectEspera).toHaveValue('e1000000-0000-4000-8000-000000000001');
    expect(selectReserva).toHaveValue(''); // Se limpió por exclusión mutua

    fireEvent.click(screen.getByRole('button', { name: /confirmar ocupación/i }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });

    expect(capturedBody).toEqual({
      comensales: 2,
      meseroId: FIXTURE_MESERO_IDS.CARLOS,
      esperaId: 'e1000000-0000-4000-8000-000000000001',
    });
    expect(capturedBody).not.toHaveProperty('reservaId');
  });

  it('cierra el modal al presionar Cancelar, el botón X o la tecla Escape', () => {
    const handleClose = vi.fn();
    renderModal({ onClose: handleClose });

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /cerrar modal/i }));
    expect(handleClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(3);
  });
});
