import { describe, it, expect } from 'vitest';
import {
  EstadoMesa,
  EstadoReserva,
  EstadoEspera,
  EstadoUnion,
  RoleEnum,
  EVENT_TOPICS,
} from './index.js';

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

  it('should maintain exact domain values for RoleEnum', () => {
    expect(RoleEnum.ADMINISTRADOR).toBe('ADMINISTRADOR');
    expect(RoleEnum.HOST).toBe('HOST');
    expect(RoleEnum.ALMACENISTA).toBe('ALMACENISTA');
    expect(RoleEnum.MESERO).toBe('MESERO');
    expect(RoleEnum.CHEF_MASTER).toBe('CHEF_MASTER');
  });

  it('should declare correct AMQP routing keys for domain events', () => {
    expect(EVENT_TOPICS.DINING_SESSION_INICIADA).toBe('sala.dining_session.iniciada');
    expect(EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO).toBe('sala.mesa.estado_actualizado');
    expect(EVENT_TOPICS.RESERVA_PROXIMA_ALERTA).toBe('sala.reserva.proxima_alerta');
  });

  it('should support generic EventEnvelope structure and DiningSessionIniciadaPayload alias', () => {
    const payload = {
      sessionId: '550e8400-e29b-41d4-a716-446655440099',
      meseroId: 'd1000000-0000-4000-8000-000000000001',
      comensales: 4,
      numComensales: 4,
      timestamp: '2026-10-21T18:00:00.000Z',
    };

    const envelope = {
      eventId: 'e1000000-0000-4000-8000-000000000001',
      eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
      timestamp: '2026-10-21T18:00:00.000Z',
      correlationId: 'c1000000-0000-4000-8000-000000000001',
      data: payload,
    };

    expect(envelope.eventId).toBe('e1000000-0000-4000-8000-000000000001');
    expect(envelope.eventType).toBe('sala.dining_session.iniciada');
    expect(envelope.data.numComensales).toBe(4);
    expect(envelope.data.comensales).toBe(4);
  });
});
