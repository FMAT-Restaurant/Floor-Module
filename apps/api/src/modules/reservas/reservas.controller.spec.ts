import { EstadoReserva } from '@floor/shared';
import {
  esquemaActualizar,
  esquemaDisponibilidad,
  ReservasController,
} from './reservas.controller';
import type { ReservasService } from './reservas.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const RESERVA_ID = 'b1000000-0000-4000-8000-000000000001';

describe('ReservasController', () => {
  let servicio: jest.Mocked<ReservasService>;
  let controller: ReservasController;

  beforeEach(() => {
    servicio = {
      listar: jest.fn().mockResolvedValue([]),
      consultarDisponibilidad: jest.fn().mockResolvedValue([]),
      obtener: jest.fn().mockResolvedValue({ reservaId: RESERVA_ID }),
      crear: jest.fn().mockResolvedValue({
        reservaId: RESERVA_ID,
        mesaId: MESA_ID,
        estado: EstadoReserva.CONFIRMADA,
      }),
      actualizar: jest.fn().mockResolvedValue({
        reservaId: RESERVA_ID,
        estado: EstadoReserva.CONFIRMADA,
      }),
      cancelar: jest.fn().mockResolvedValue({
        reservaId: RESERVA_ID,
        estado: EstadoReserva.CANCELADA,
      }),
      marcarComoNoShow: jest.fn().mockResolvedValue({
        reservaId: RESERVA_ID,
        estado: EstadoReserva.NO_SHOW,
      }),
    } as unknown as jest.Mocked<ReservasService>;
    controller = new ReservasController(servicio);
  });

  it('delega listar, consultarDisponibilidad, obtener, crear, actualizar, cancelar, eliminar y marcarNoShow al servicio', async () => {
    await controller.listar({ fecha: '2030-01-15' });
    expect(servicio.listar).toHaveBeenCalledWith({ fecha: '2030-01-15' });

    await controller.consultarDisponibilidad({
      fecha: '2030-01-15',
      horaInicio: '19:00',
      duracion: 90,
      personas: 4,
    });
    expect(servicio.consultarDisponibilidad).toHaveBeenCalledWith({
      fecha: '2030-01-15',
      horaInicio: '19:00',
      duracion: 90,
      personas: 4,
    });

    await controller.obtener({ reservaId: RESERVA_ID });
    expect(servicio.obtener).toHaveBeenCalledWith(RESERVA_ID);

    const payload = {
      mesaId: MESA_ID,
      fecha: '2030-01-15',
      horaInicio: '19:00',
      duracion: 90,
      cantidadPersonas: 4,
      cliente: { nombre: 'Ana', tel: '5512345678' },
    };
    await controller.crear(payload);
    expect(servicio.crear).toHaveBeenCalledWith(payload);

    await controller.actualizar({ reservaId: RESERVA_ID }, { cantidadPersonas: 2 });
    expect(servicio.actualizar).toHaveBeenCalledWith(RESERVA_ID, { cantidadPersonas: 2 });

    await controller.cancelar({ reservaId: RESERVA_ID });
    expect(servicio.cancelar).toHaveBeenCalledWith(RESERVA_ID);

    await controller.eliminar({ reservaId: RESERVA_ID });
    expect(servicio.cancelar).toHaveBeenCalledTimes(2);

    const noShow = await controller.marcarNoShow({ reservaId: RESERVA_ID });
    expect(servicio.marcarComoNoShow).toHaveBeenCalledWith(RESERVA_ID);
    expect(noShow.estado).toBe(EstadoReserva.NO_SHOW);
  });

  describe('esquemaDisponibilidad y esquemaActualizar', () => {
    it('normaliza hora y aforo en esquemaDisponibilidad y rechaza valores no objeto', () => {
      const ok = esquemaDisponibilidad.safeParse({
        fecha: '2030-01-15',
        hora: '19:00',
        duracion: '60',
        aforo: '4',
      });
      expect(ok.success).toBe(true);
      expect(ok.data).toEqual({
        fecha: '2030-01-15',
        horaInicio: '19:00',
        duracion: 60,
        personas: 4,
      });

      expect(esquemaDisponibilidad.safeParse(null).success).toBe(false);
    });

    it('valida payloads parciales con actualizarReservaSchema y rechaza cambio de estado por PATCH (IMP-08)', () => {
      expect(esquemaActualizar.safeParse(null).success).toBe(false);
      expect(esquemaActualizar.safeParse([]).success).toBe(false);
      expect(esquemaActualizar.safeParse({}).success).toBe(false);

      const conHora = esquemaActualizar.safeParse({ hora: '20:30', duracion: 60 });
      expect(conHora.success).toBe(true);
      expect(conHora.data).toEqual({ horaInicio: '20:30', duracion: 60 });

      const conEstadoCancelada = esquemaActualizar.safeParse({
        estado: EstadoReserva.CANCELADA,
      });
      expect(conEstadoCancelada.success).toBe(false);

      const conCantidadValida = esquemaActualizar.safeParse({
        cantidadPersonas: 3,
      });
      expect(conCantidadValida.success).toBe(true);
      expect(conCantidadValida.data).toEqual({
        cantidadPersonas: 3,
      });

      const conCampoInvalido = esquemaActualizar.safeParse({
        cantidadPersonas: 0,
      });
      expect(conCampoInvalido.success).toBe(false);
    });
  });
});
