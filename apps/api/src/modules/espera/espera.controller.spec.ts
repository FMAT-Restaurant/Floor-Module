import { EstadoEspera } from '@floor/shared';
import { EsperaController } from './espera.controller';
import type { EsperaService } from './espera.service';

const ESPERA_ID = 'e1000000-0000-4000-8000-000000000001';

describe('EsperaController', () => {
  let servicio: jest.Mocked<EsperaService>;
  let controller: EsperaController;

  beforeEach(() => {
    const dto = {
      esperaId: ESPERA_ID,
      nombreCliente: 'Gabriel Torres',
      telefonoContacto: '+52 999 111 2233',
      cantidadPersonas: 2,
      horaLlegada: '2030-01-15T12:00:00.000Z',
      estado: EstadoEspera.EN_ESPERA,
      idMesaAsignada: null,
    };
    servicio = {
      crear: jest.fn().mockResolvedValue(dto),
      listar: jest.fn().mockResolvedValue([dto]),
      actualizarEstado: jest.fn().mockResolvedValue({ ...dto, estado: EstadoEspera.SENTADO }),
    } as unknown as jest.Mocked<EsperaService>;
    controller = new EsperaController(servicio);
  });

  it('delega crear, listar y actualizarEstado en EsperaService', async () => {
    const payload = {
      nombreCliente: 'Gabriel Torres',
      telefonoContacto: '+52 999 111 2233',
      cantidadPersonas: 2,
    };
    const creada = await controller.crear(payload);
    expect(servicio.crear).toHaveBeenCalledWith(payload);
    expect(creada.esperaId).toBe(ESPERA_ID);

    const lista = await controller.listar({ estado: EstadoEspera.EN_ESPERA });
    expect(servicio.listar).toHaveBeenCalledWith({ estado: EstadoEspera.EN_ESPERA });
    expect(lista).toHaveLength(1);

    const actualizada = await controller.actualizarEstado(
      { esperaId: ESPERA_ID },
      { estado: EstadoEspera.SENTADO },
    );
    expect(servicio.actualizarEstado).toHaveBeenCalledWith(ESPERA_ID, {
      estado: EstadoEspera.SENTADO,
    });
    expect(actualizada.estado).toBe(EstadoEspera.SENTADO);
  });
});
