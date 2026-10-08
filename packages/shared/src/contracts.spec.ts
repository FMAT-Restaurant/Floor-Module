import { describe, it, expect } from 'vitest';
import { EstadoMesa, EstadoReserva, EstadoEspera, EstadoUnion, EVENT_TOPICS } from './index';

describe('Shared Domain Contracts', () => {
  it('should maintain exact domain values for EstadoMesa enum', () => {
    expect(EstadoMesa.LIBRE).toBe('Libre');
    expect(EstadoMesa.OCUPADA).toBe('Ocupada');
    expect(EstadoMesa.LIMPIEZA_PENDIENTE).toBe('Limpieza pendiente');
  });

  it('should maintain exact domain values for EstadoReserva enum', () => {
    expect(EstadoReserva.CONFIRMADA).toBe('Confirmada');
    expect(EstadoReserva.CANCELADA).toBe('Cancelada');
    expect(EstadoReserva.COMPLETADA).toBe('Completada');
    expect(EstadoReserva.NO_SHOW).toBe('No-show');
  });

  it('should maintain exact domain values for EstadoEspera enum', () => {
    expect(EstadoEspera.EN_ESPERA).toBe('En espera');
    expect(EstadoEspera.NOTIFICADO).toBe('Notificado');
    expect(EstadoEspera.SENTADO).toBe('Sentado');
    expect(EstadoEspera.CANCELADO).toBe('Cancelado');
  });

  it('should maintain exact domain values for EstadoUnion enum', () => {
    expect(EstadoUnion.ACTIVA).toBe('Activa');
    expect(EstadoUnion.DISUELTA).toBe('Disuelta');
  });

  it('should declare correct AMQP routing keys for domain events', () => {
    expect(EVENT_TOPICS.DINING_SESSION_INICIADA).toBe('sala.dining_session.iniciada');
    expect(EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO).toBe('sala.mesa.estado_actualizado');
    expect(EVENT_TOPICS.RESERVA_PROXIMA_ALERTA).toBe('sala.reserva.proxima_alerta');
  });
});
