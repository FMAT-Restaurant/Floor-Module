import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  EstadoMesa,
  FIXTURE_MESA_IDS,
  FIXTURE_MESERO_IDS,
  fixtureMeserosCatalogo,
  type MesaEnVivoDto,
} from '@floor/shared';
import { mockDb } from '../../mocks/db';
import { server } from '../../mocks/server';
import { createTestQueryClient } from '../../test/test-utils';
import { AccionesMesa, type AccionesMesaProps } from './AccionesMesa';

const clients: QueryClient[] = [];
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  mockDb.reset();
  vi.restoreAllMocks();
});

function renderActions(
  mesaId: string = FIXTURE_MESA_IDS.MESA_4,
  overrides: Partial<AccionesMesaProps> = {},
) {
  const client = createTestQueryClient();
  clients.push(client);
  const mesa = mockDb.getMesaEnVivo(mesaId);
  return {
    client,
    mesa,
    ...render(
      <QueryClientProvider client={client}>
        <AccionesMesa mesa={mesa} meserosCatalogo={fixtureMeserosCatalogo} {...overrides} />
      </QueryClientProvider>,
    ),
  };
}

describe('FE-005 · AccionesMesa', () => {
  it('RF-007: marca limpia por PATCH y bloquea las acciones mientras espera la respuesta', async () => {
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: unknown[] = [];
    server.use(
      http.patch('*/sala/mesas/:mesaId/estado', async ({ request, params }) => {
        requests.push(await request.json());
        await responseGate;
        return HttpResponse.json(
          mockDb.actualizarEstadoMesa(String(params.mesaId), EstadoMesa.LIBRE),
        );
      }),
    );
    const { client } = renderActions();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const button = screen.getByRole('button', { name: 'Marcar limpia' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Asignar mesero' })).toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ estado: EstadoMesa.LIBRE });
    release();
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 4 marcada como limpia.');
    expect(mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_4).estadoFisico).toBe(EstadoMesa.LIBRE);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['mesas'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['espera'] });
  });

  it('RF-006: cancelar la confirmación de salida conserva la mesa ocupada', () => {
    renderActions(FIXTURE_MESA_IDS.MESA_3);
    fireEvent.click(screen.getByRole('button', { name: 'Salida de comensales' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Limpieza pendiente');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_3).estadoFisico).toBe(EstadoMesa.OCUPADA);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('RF-006: confirma la salida y no permite cerrar ni duplicar la petición durante el envío', async () => {
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: unknown[] = [];
    server.use(
      http.patch('*/sala/mesas/:mesaId/estado', async ({ request, params }) => {
        requests.push(await request.json());
        await responseGate;
        return HttpResponse.json(
          mockDb.actualizarEstadoMesa(String(params.mesaId), EstadoMesa.LIMPIEZA_PENDIENTE),
        );
      }),
    );
    renderActions(FIXTURE_MESA_IDS.MESA_3);
    fireEvent.click(screen.getByRole('button', { name: 'Salida de comensales' }));
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled());
    expect(screen.queryByRole('button', { name: 'Guardar asignación' })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(requests).toEqual([{ estado: EstadoMesa.LIMPIEZA_PENDIENTE }]));
    release();
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 3 pendiente de limpieza.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_3).estadoFisico).toBe(
      EstadoMesa.LIMPIEZA_PENDIENTE,
    );
  });

  it('RN-15: bloquea el cambio de estado individual de mesas unidas', () => {
    renderActions(FIXTURE_MESA_IDS.MESA_5);
    const salida = screen.getByRole('button', { name: 'Salida de comensales' });
    expect(salida).toBeDisabled();
    fireEvent.click(salida);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Libera la unión/)).toBeInTheDocument();
  });

  it('RF-007: informa un conflicto y permite reintentar sin anunciar éxito', async () => {
    server.use(
      http.patch('*/sala/mesas/:mesaId/estado', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'TRANSICION_INVALIDA',
            message: 'La mesa ya no está pendiente de limpieza.',
          },
          { status: 409 },
        ),
      ),
    );
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar limpia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La mesa ya no está pendiente de limpieza.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar limpia' })).toBeEnabled();
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar limpia' }));
    expect(await screen.findByRole('status')).toHaveTextContent('marcada como limpia');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('RF-010: asigna por nombre una mesa sin mesero mediante PUT', async () => {
    renderActions(FIXTURE_MESA_IDS.MESA_1);
    fireEvent.click(screen.getByRole('button', { name: 'Asignar mesero' }));
    const save = screen.getByRole('button', { name: 'Guardar asignación' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 1 actualizado');
    expect(mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_1).meseroId).toBe(FIXTURE_MESERO_IDS.ANA);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('RF-011, RN-16: reasigna, cierra la asignación anterior e invalida los metadatos', async () => {
    let capturedBody: unknown;
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put('*/sala/mesas/:mesaId/mesero', async ({ request, params }) => {
        capturedBody = await request.json();
        await responseGate;
        return HttpResponse.json(
          mockDb.asignarMesero(String(params.mesaId), FIXTURE_MESERO_IDS.ANA),
        );
      }),
    );
    const { client } = renderActions(FIXTURE_MESA_IDS.MESA_3);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar mesero' }));
    const select = screen.getByLabelText('Mesero responsable');
    expect(select).toHaveValue(FIXTURE_MESERO_IDS.CARLOS);
    expect(screen.getByRole('button', { name: 'Guardar asignación' })).toBeDisabled();
    fireEvent.change(select, { target: { value: FIXTURE_MESERO_IDS.ANA } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignación' }));
    await waitFor(() => expect(select).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await waitFor(() => expect(capturedBody).toEqual({ meseroId: FIXTURE_MESERO_IDS.ANA }));
    release();
    await screen.findByRole('status');
    const assignments = mockDb
      .getState()
      .asignaciones.filter((a) => a.mesaId === FIXTURE_MESA_IDS.MESA_3);
    expect(assignments.filter((a) => a.activo)).toHaveLength(1);
    expect(assignments.find((a) => a.meseroId === FIXTURE_MESERO_IDS.CARLOS)).toMatchObject({
      activo: false,
      fechaHoraFin: expect.any(String),
    });
    expect(mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_3).meseroId).toBe(FIXTURE_MESERO_IDS.ANA);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['mesas'] });
  });

  it('RF-011: mantiene el selector y la asignación anterior si el servidor rechaza la operación', async () => {
    server.use(
      http.put('*/sala/mesas/:mesaId/mesero', () =>
        HttpResponse.json(
          {
            statusCode: 403,
            code: 'NO_AUTORIZADO',
            message: 'No tienes permiso para reasignar meseros.',
          },
          { status: 403 },
        ),
      ),
    );
    renderActions(FIXTURE_MESA_IDS.MESA_3);
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar mesero' }));
    fireEvent.change(screen.getByLabelText('Mesero responsable'), {
      target: { value: FIXTURE_MESERO_IDS.ANA },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Mesero responsable')).toBeEnabled();
    expect(mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_3).meseroId).toBe(FIXTURE_MESERO_IDS.CARLOS);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('no ofrece meseros inactivos y explica un catálogo vacío', () => {
    renderActions(FIXTURE_MESA_IDS.MESA_1, {
      meserosCatalogo: fixtureMeserosCatalogo.map((m) => ({ ...m, activo: false })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Asignar mesero' }));
    expect(screen.getByLabelText('Mesero responsable')).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'Carlos Gómez' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar asignación' })).toBeDisabled();
    expect(screen.getByText('No hay meseros disponibles para asignar.')).toBeInTheDocument();
  });

  it('impide cambios sobre mesas inactivas', () => {
    renderActions(FIXTURE_MESA_IDS.MESA_4, {
      mesa: { ...mockDb.getMesaEnVivo(FIXTURE_MESA_IDS.MESA_4), activo: false },
    });
    expect(screen.getByRole('button', { name: 'Marcar limpia' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Asignar mesero' })).toBeDisabled();
  });

  it('mantiene el foco en el modal, cierra con Escape y devuelve el foco al botón', () => {
    renderActions(FIXTURE_MESA_IDS.MESA_3);
    const trigger = screen.getByRole('button', { name: 'Reasignar mesero' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveFocus();
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    cancel.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cerrar modal' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('RN-15: una actualización en vivo impide confirmar una salida que dejó de ser válida', () => {
    const { client, mesa, rerender } = renderActions(FIXTURE_MESA_IDS.MESA_3);
    fireEvent.click(screen.getByRole('button', { name: 'Salida de comensales' }));
    const changed: MesaEnVivoDto = { ...mesa, estadoFisico: EstadoMesa.LIMPIEZA_PENDIENTE };
    rerender(
      <QueryClientProvider client={client}>
        <AccionesMesa mesa={changed} meserosCatalogo={fixtureMeserosCatalogo} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Confirmar salida' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('ya no permite registrar esta salida');
  });
});
