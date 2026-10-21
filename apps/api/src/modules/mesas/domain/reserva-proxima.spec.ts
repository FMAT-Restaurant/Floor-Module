import { EstadoReserva } from '@floor/shared';
import {
  VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN,
  esReservaProxima,
  resolverVentanaMinutos,
  tieneReservaProxima,
  type ReservaAgendada,
} from './reserva-proxima';

const AHORA = new Date('2026-10-16T18:00:00.000Z');
const VENTANA = 30;

function reservaEn(minutosDesdeAhora: number, estado = EstadoReserva.CONFIRMADA): ReservaAgendada {
  return { inicio: new Date(AHORA.getTime() + minutosDesdeAhora * 60_000), estado };
}

describe('RN-08 · cálculo de reserva próxima', () => {
  describe('esReservaProxima', () => {
    it('es próxima si inicia dentro de la ventana', () => {
      expect(esReservaProxima(reservaEn(15), AHORA, VENTANA)).toBe(true);
    });

    it('incluye el borde inferior: inicia exactamente ahora', () => {
      expect(esReservaProxima(reservaEn(0), AHORA, VENTANA)).toBe(true);
    });

    it('incluye el borde superior: inicia exactamente ahora + V', () => {
      expect(esReservaProxima(reservaEn(30), AHORA, VENTANA)).toBe(true);
    });

    it('no es próxima un milisegundo después de la ventana', () => {
      const reserva = {
        inicio: new Date(AHORA.getTime() + 30 * 60_000 + 1),
        estado: EstadoReserva.CONFIRMADA,
      };
      expect(esReservaProxima(reserva, AHORA, VENTANA)).toBe(false);
    });

    it('no es próxima si ya inició (un milisegundo antes de ahora)', () => {
      const reserva = { inicio: new Date(AHORA.getTime() - 1), estado: EstadoReserva.CONFIRMADA };
      expect(esReservaProxima(reserva, AHORA, VENTANA)).toBe(false);
    });

    it('respeta una ventana distinta a la de por defecto', () => {
      expect(esReservaProxima(reservaEn(45), AHORA, 60)).toBe(true);
      expect(esReservaProxima(reservaEn(45), AHORA, 30)).toBe(false);
    });

    it.each([EstadoReserva.CANCELADA, EstadoReserva.COMPLETADA, EstadoReserva.NO_SHOW])(
      'ignora reservas en estado %s aunque estén dentro de la ventana',
      (estado) => {
        expect(esReservaProxima(reservaEn(10, estado), AHORA, VENTANA)).toBe(false);
      },
    );
  });

  describe('tieneReservaProxima', () => {
    it('es false sin reservas', () => {
      expect(tieneReservaProxima([], AHORA, VENTANA)).toBe(false);
    });

    it('es true si al menos una reserva cae en la ventana', () => {
      const reservas = [reservaEn(-60), reservaEn(20), reservaEn(180)];
      expect(tieneReservaProxima(reservas, AHORA, VENTANA)).toBe(true);
    });

    it('es false si todas están fuera de la ventana o no están confirmadas', () => {
      const reservas = [reservaEn(-5), reservaEn(31), reservaEn(10, EstadoReserva.CANCELADA)];
      expect(tieneReservaProxima(reservas, AHORA, VENTANA)).toBe(false);
    });

    it('usa la ventana por defecto de 30 minutos si no se indica', () => {
      expect(tieneReservaProxima([reservaEn(30)], AHORA)).toBe(true);
      expect(tieneReservaProxima([reservaEn(31)], AHORA)).toBe(false);
    });
  });

  describe('resolverVentanaMinutos (RESERVA_PROXIMA_VENTANA_MINUTOS)', () => {
    it('usa el valor configurado si es un entero positivo', () => {
      expect(resolverVentanaMinutos('45')).toBe(45);
    });

    it.each([undefined, '', 'abc', '0', '-5', '30.5'])(
      'usa el default (%p) cuando el valor no es válido',
      (valor) => {
        expect(resolverVentanaMinutos(valor)).toBe(VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN);
      },
    );
  });
});
