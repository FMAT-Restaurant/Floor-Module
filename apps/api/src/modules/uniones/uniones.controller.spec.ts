import { EstadoMesa, EstadoUnion } from '@floor/shared';
import { UnionesController } from './uniones.controller';
import type { UnionesService } from './uniones.service';

const MESA_1 = 'a1000000-0000-4000-8000-000000000001';
const MESA_2 = 'a1000000-0000-4000-8000-000000000002';
const UNION_ID = 'c1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'e1000000-0000-4000-8000-000000000001';

describe('UnionesController', () => {
  let servicio: jest.Mocked<UnionesService>;
  let controller: UnionesController;

  beforeEach(() => {
    servicio = {
      listar: jest.fn().mockResolvedValue([]),
      crear: jest.fn().mockResolvedValue({
        unionId: UNION_ID,
        mesasIds: [MESA_1, MESA_2],
        estado: EstadoMesa.OCUPADA,
        sessionId: 'd1000000-0000-4000-8000-000000000001',
      }),
      liberar: jest.fn().mockResolvedValue({
        mesasIds: [MESA_1, MESA_2],
        estado: EstadoMesa.LIMPIEZA_PENDIENTE,
      }),
    } as unknown as jest.Mocked<UnionesService>;
    controller = new UnionesController(servicio);
  });

  it('delega listar, crear y liberar al servicio con sus parámetros y correlationId', async () => {
    await controller.listar({ estado: EstadoUnion.ACTIVA });
    expect(servicio.listar).toHaveBeenCalledWith(EstadoUnion.ACTIVA);

    const payload = {
      mesasIds: [MESA_1, MESA_2],
      totalPersonas: 6,
      meseroId: MESERO_ID,
    };
    const creada = await controller.crear(payload, 'corr-crear');
    expect(servicio.crear).toHaveBeenCalledWith(payload, 'corr-crear');
    expect(creada.estado).toBe(EstadoMesa.OCUPADA);

    const liberada = await controller.liberar({ unionId: UNION_ID }, 'corr-liberar');
    expect(servicio.liberar).toHaveBeenCalledWith(UNION_ID, 'corr-liberar');
    expect(liberada.estado).toBe(EstadoMesa.LIMPIEZA_PENDIENTE);
  });
});
