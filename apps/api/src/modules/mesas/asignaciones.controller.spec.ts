import type { AsignacionDto } from '@floor/shared';
import { AsignacionesController } from './asignaciones.controller';
import type { AsignacionesService } from './asignaciones.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'b1000000-0000-4000-8000-000000000001';
const ASIGNACION_ID = 'f1000000-0000-4000-8000-000000000001';

const DTO: AsignacionDto = {
  asignacionId: ASIGNACION_ID,
  mesaId: MESA_ID,
  meseroId: MESERO_ID,
  fechaHoraInicio: '2030-01-15T12:00:00.000Z',
  fechaHoraFin: null,
  activo: true,
};

describe('AsignacionesController (SPEC §5.3)', () => {
  it('PUT mesas/:mesaId/mesero delega en AsignacionesService.asignar', async () => {
    const servicio = {
      asignar: jest.fn().mockResolvedValue(DTO),
    } as unknown as jest.Mocked<AsignacionesService>;
    const controlador = new AsignacionesController(servicio);

    const resultado = await controlador.asignar({ mesaId: MESA_ID }, { meseroId: MESERO_ID });

    expect(resultado).toBe(DTO);
    expect(servicio.asignar).toHaveBeenCalledWith(MESA_ID, { meseroId: MESERO_ID });
  });

  it('GET asignaciones delega en AsignacionesService.listar con los filtros validados', async () => {
    const servicio = {
      listar: jest.fn().mockResolvedValue([DTO]),
    } as unknown as jest.Mocked<AsignacionesService>;
    const controlador = new AsignacionesController(servicio);

    const resultado = await controlador.listar({ meseroId: MESERO_ID, activo: true });

    expect(resultado).toEqual([DTO]);
    expect(servicio.listar).toHaveBeenCalledWith({ meseroId: MESERO_ID, activo: true });
  });
});
