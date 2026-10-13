import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  EstadoMesa,
  FIXTURE_MESA_IDS,
  FIXTURE_AUTH_USERS,
  FIXTURE_MESERO_IDS,
  type CrearMesaRequestDto,
} from '@floor/shared';
import { App } from '../App';
import { mockDb } from '../mocks/db';
import { server } from '../mocks/server';
import { createTestQueryClient } from '../test/test-utils';
import { AdministracionMesasView } from './AdministracionMesasView';

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

function renderPanel(app = false) {
  const client = createTestQueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      {app ? <App /> : <AdministracionMesasView />}
    </QueryClientProvider>,
  );
  return client;
}

async function table() {
  return screen.findByRole('table', { name: 'Mesas del plano' });
}

function openAction(mesaId: string, action: 'Editar mesa' | 'Dar de baja') {
  const row = screen.getByTestId(`mesa-admin-row-${mesaId}`);
  fireEvent.click(within(row).getByRole('button', { name: /Acciones de Mesa/ }));
  fireEvent.click(within(row).getByRole('button', { name: action }));
  return screen.getByRole('dialog');
}

function fillForm(numero: string, capacidad = '4', zona = 'Patio') {
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Número de mesa'), { target: { value: numero } });
  fireEvent.change(dialog.getByLabelText('Capacidad (personas)'), { target: { value: capacidad } });
  fireEvent.change(dialog.getByLabelText('Zona'), { target: { value: zona } });
}

function addFutureReservation(mesaId = FIXTURE_MESA_IDS.MESA_1) {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const fecha = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  mockDb.crearReserva({
    mesaId,
    fecha,
    horaInicio: '18:00',
    duracion: 60,
    cantidadPersonas: 2,
    cliente: { nombre: 'Grupo previsto', tel: '9991234567' },
  });
}

describe('FE-006 · Administración de mesas (integración frontend + MSW)', () => {
  it('RF-001, RF-002, RF-003: completa alta, edición y baja lógica, y actualiza el plano operativo', async () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Configuración de mesas' }));
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('99', '6', '  Patio  ');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 99 creada.');
    const created = mockDb.getMesas().find((mesa) => mesa.numeroMesa === 99)!;
    expect(created).toMatchObject({
      capacidad: 6,
      zona: 'Patio',
      activo: true,
      estadoFisico: EstadoMesa.LIBRE,
    });
    expect(screen.getByTestId(`mesa-admin-row-${created.mesaId}`)).toHaveTextContent('Patio');

    openAction(created.mesaId, 'Editar mesa');
    expect(screen.getByLabelText('Número de mesa')).toHaveValue(99);
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    fillForm('100', '8', 'Jardín');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 100 actualizada.');
    expect(screen.getByTestId(`mesa-admin-row-${created.mesaId}`)).toHaveTextContent('Jardín');
    expect(mockDb.getMesa(created.mesaId)).toMatchObject({
      numeroMesa: 100,
      capacidad: 8,
      zona: 'Jardín',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Plano de sala' }));
    expect(await screen.findByTestId('mesa-card-100')).toHaveTextContent('8 personas');
    expect(screen.getByTestId('mesa-card-100')).toHaveTextContent('Jardín');
    fireEvent.click(screen.getByRole('tab', { name: 'Configuración de mesas' }));
    await table();
    openAction(created.mesaId, 'Dar de baja');
    const confirm = screen.getByRole('button', { name: 'Dar de baja mesa' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 100 dada de baja.');
    expect(screen.queryByTestId(`mesa-admin-row-${created.mesaId}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Mostrar mesas dadas de baja'));
    expect(screen.getByTestId(`mesa-admin-row-${created.mesaId}`)).toHaveTextContent(
      'Dada de baja',
    );
    expect(mockDb.getMesa(created.mesaId).activo).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Plano de sala' }));
    await screen.findByTestId('mesa-card-1');
    expect(screen.queryByTestId('mesa-card-100')).not.toBeInTheDocument();
  });

  it('RNF-010: busca por número y zona y ordena por número, capacidad y zona', async () => {
    renderPanel();
    const grid = within(await table());
    const numbers = () => grid.getAllByRole('rowheader').map((element) => element.textContent);
    expect(numbers()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    const numeroSort = grid.getByRole('button', { name: 'Ordenar por número' });
    fireEvent.click(numeroSort);
    expect(numbers()[0]).toBe('7');
    expect(numeroSort.parentElement).toHaveAttribute('aria-sort', 'descending');
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'capacidad:desc' } });
    expect(numbers()[0]).toBe('4');
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'zona:asc' } });
    expect(numbers()[0]).toBe('7');
    fireEvent.change(screen.getByLabelText('Buscar mesas'), { target: { value: ' TERRAZA ' } });
    expect(numbers()).toEqual(['4', '5', '6']);
    fireEvent.change(screen.getByLabelText('Buscar mesas'), { target: { value: '2' } });
    expect(numbers()).toEqual(['2']);
    fireEvent.change(screen.getByLabelText('Buscar mesas'), {
      target: { value: 'sin coincidencias' },
    });
    expect(screen.getByText('No hay mesas que coincidan con la búsqueda')).toBeInTheDocument();
  });

  it('RNF-010: ofrece también las acciones en la lista móvil', async () => {
    renderPanel();
    await table();
    const mobile = within(screen.getByRole('list', { name: 'Mesas del plano en móvil' }));
    const row = within(mobile.getAllByRole('listitem')[0]);
    fireEvent.click(row.getByRole('button', { name: 'Acciones de Mesa 1' }));
    fireEvent.click(row.getByRole('button', { name: 'Editar mesa' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Editar Mesa 1');
  });

  it('RF-001: Zod rechaza decimales, capacidad menor a uno y una zona vacía antes del POST', async () => {
    const create = vi.spyOn(mockDb, 'crearMesa');
    renderPanel();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('9.5', '0', '   ');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' }));
    expect(screen.getByLabelText('Número de mesa')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Capacidad (personas)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Zona')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(create).not.toHaveBeenCalled();
  });

  it('RF-002: valida la edición con Zod y conserva el registro ante datos inválidos', async () => {
    const update = vi.spyOn(mockDb, 'actualizarMesa');
    renderPanel();
    await table();
    openAction(FIXTURE_MESA_IDS.MESA_1, 'Editar mesa');
    fillForm('1', '-1', 'a'.repeat(51));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByLabelText('Capacidad (personas)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Zona')).toHaveAttribute('aria-invalid', 'true');
    expect(update).not.toHaveBeenCalled();
    expect(mockDb.getMesa(FIXTURE_MESA_IDS.MESA_1).capacidad).toBe(2);
  });

  it('RN-19: impide duplicar un número activo tanto al crear como al editar', async () => {
    const create = vi.spyOn(mockDb, 'crearMesa');
    const update = vi.spyOn(mockDb, 'actualizarMesa');
    renderPanel();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('1');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Este número ya está en uso');
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    openAction(FIXTURE_MESA_IDS.MESA_1, 'Editar mesa');
    fillForm('2');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Este número ya está en uso');
    expect(update).not.toHaveBeenCalled();
  });

  it('RN-19: permite reutilizar el número de una mesa dada de baja', async () => {
    renderPanel();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('8');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 8 creada.');
    expect(mockDb.getMesas().filter((mesa) => mesa.numeroMesa === 8)).toHaveLength(1);
    expect(mockDb.getState().mesas.filter((mesa) => mesa.numeroMesa === 8)).toHaveLength(2);
  });

  it('RN-19: muestra un 409 por duplicidad concurrente sin cerrar el formulario', async () => {
    renderPanel();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('99');
    mockDb.crearMesa({ numeroMesa: 99, capacidad: 4, zona: 'Otro registro' });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este número ya está en uso');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockDb.getMesas().filter((mesa) => mesa.numeroMesa === 99)).toHaveLength(1);
  });

  it('RF-003: cancelar la baja conserva la mesa y devuelve el foco al menú', async () => {
    const remove = vi.spyOn(mockDb, 'eliminarMesa');
    renderPanel();
    await table();
    const row = within(screen.getByTestId(`mesa-admin-row-${FIXTURE_MESA_IDS.MESA_7}`));
    const trigger = row.getByRole('button', { name: 'Acciones de Mesa 7' });
    openAction(FIXTURE_MESA_IDS.MESA_7, 'Dar de baja');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dar de baja mesa' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(remove).not.toHaveBeenCalled();
    expect(mockDb.getMesa(FIXTURE_MESA_IDS.MESA_7).activo).toBe(true);
  });

  it.each([
    [FIXTURE_MESA_IDS.MESA_3, 'Ocupada'],
    [FIXTURE_MESA_IDS.MESA_4, 'Limpieza pendiente'],
    [FIXTURE_MESA_IDS.MESA_5, 'unión activa'],
  ])('RF-003, RN-18: protege la baja de %s por %s', async (mesaId, reason) => {
    const remove = vi.spyOn(mockDb, 'eliminarMesa');
    renderPanel();
    await table();
    const dialog = within(openAction(mesaId, 'Dar de baja'));
    expect(await dialog.findByRole('alert')).toHaveTextContent(reason);
    const confirm = dialog.getByRole('button', { name: 'Dar de baja mesa' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(remove).not.toHaveBeenCalled();
  });

  it('RF-003: advierte sobre las reservas futuras y bloquea la baja', async () => {
    addFutureReservation();
    const remove = vi.spyOn(mockDb, 'eliminarMesa');
    renderPanel();
    await table();
    const dialog = within(openAction(FIXTURE_MESA_IDS.MESA_1, 'Dar de baja'));
    expect(await dialog.findByRole('alert')).toHaveTextContent('1 reserva confirmada futura');
    expect(dialog.getByText(/Grupo previsto/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Dar de baja mesa' })).toBeDisabled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('RF-003: el servidor también protege una reserva creada después de la comprobación', async () => {
    renderPanel();
    await table();
    openAction(FIXTURE_MESA_IDS.MESA_1, 'Dar de baja');
    const confirm = screen.getByRole('button', { name: 'Dar de baja mesa' });
    await waitFor(() => expect(confirm).toBeEnabled());
    addFutureReservation();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((element) => element.textContent?.includes('Cancela o reasigna')),
      ).toBe(true),
    );
    expect(mockDb.getMesa(FIXTURE_MESA_IDS.MESA_1).activo).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
  });

  it('RF-003: el servidor rechaza una mesa ocupada después de abrir la confirmación', async () => {
    renderPanel();
    await table();
    openAction(FIXTURE_MESA_IDS.MESA_1, 'Dar de baja');
    const confirm = screen.getByRole('button', { name: 'Dar de baja mesa' });
    await waitFor(() => expect(confirm).toBeEnabled());
    mockDb.ocuparMesa(FIXTURE_MESA_IDS.MESA_1, {
      comensales: 2,
      meseroId: FIXTURE_MESERO_IDS.CARLOS,
    });
    fireEvent.click(confirm);
    expect(
      await screen.findByText('Solo se puede dar de baja una mesa en estado Libre'),
    ).toBeInTheDocument();
    expect(mockDb.getMesa(FIXTURE_MESA_IDS.MESA_1)).toMatchObject({
      activo: true,
      estadoFisico: EstadoMesa.OCUPADA,
    });
  });

  it('RF-003: bloquea la baja si falla la consulta de reservas y permite reintentar', async () => {
    server.use(
      http.get('*/sala/reservas', () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Fallo de consulta' },
          { status: 500 },
        ),
      ),
    );
    renderPanel();
    await table();
    openAction(FIXTURE_MESA_IDS.MESA_7, 'Dar de baja');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar');
    const confirm = screen.getByRole('button', { name: 'Dar de baja mesa' });
    expect(confirm).toBeDisabled();
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar comprobación' }));
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it('RF-001: bloquea el formulario durante el alta y evita peticiones repetidas', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    server.use(
      http.post('*/sala/mesas', async ({ request }) => {
        const data = (await request.json()) as CrearMesaRequestDto;
        requests++;
        await gate;
        return HttpResponse.json(mockDb.crearMesa(data), { status: 201 });
      }),
    );
    renderPanel();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('99');
    const submit = within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByLabelText('Número de mesa')).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.click(submit);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(requests).toBe(1));
    release();
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 99 creada.');
  });

  it('RF-003: deshabilita la confirmación y el cierre durante DELETE', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    server.use(
      http.delete('*/sala/mesas/:mesaId', async ({ params }) => {
        requests++;
        await gate;
        mockDb.eliminarMesa(String(params.mesaId));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPanel();
    await table();
    openAction(FIXTURE_MESA_IDS.MESA_7, 'Dar de baja');
    const confirm = screen.getByRole('button', { name: 'Dar de baja mesa' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar modal' })).toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(requests).toBe(1));
    release();
    expect(await screen.findByRole('status')).toHaveTextContent('Mesa 7 dada de baja.');
  });

  it('el servidor deniega el alta a un usuario sin el rol ADMINISTRADOR', async () => {
    mockDb.setMockAuth(FIXTURE_AUTH_USERS.HOST);
    renderPanel();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Crear mesa' }));
    fillForm('99');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Crear mesa' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockDb.getMesas().some((mesa) => mesa.numeroMesa === 99)).toBe(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('muestra carga y recupera la tabla al completar GET', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/sala/mesas', async () => {
        await gate;
        return HttpResponse.json(mockDb.getMesas({ incluirInactivas: true }));
      }),
    );
    renderPanel();
    expect(screen.getByLabelText('Cargando mesas')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Crear mesa' })).toBeDisabled();
    release();
    expect(await table()).toBeInTheDocument();
  });

  it('muestra error de consulta y recupera la tabla al reintentar', async () => {
    server.use(
      http.get('*/sala/mesas', () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'No se pudieron cargar las mesas' },
          { status: 500 },
        ),
      ),
    );
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las mesas');
    server.resetHandlers();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await table()).toBeInTheDocument();
  });

  it('muestra el estado vacío y permite crear la primera mesa', async () => {
    server.use(http.get('*/sala/mesas', () => HttpResponse.json([])));
    renderPanel();
    expect(await screen.findByText('No hay mesas activas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear mesa' })).toBeEnabled();
  });

  it('permite cambiar de vista con teclado', async () => {
    renderPanel(true);
    const plano = screen.getByRole('tab', { name: 'Plano de sala' });
    fireEvent.keyDown(plano, { key: 'ArrowRight' });
    const admin = screen.getByRole('tab', { name: 'Configuración de mesas' });
    expect(admin).toHaveAttribute('aria-selected', 'true');
    expect(admin).toHaveFocus();
    expect(await table()).toBeInTheDocument();
  });
});
