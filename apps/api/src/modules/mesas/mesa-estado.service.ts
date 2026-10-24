import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  EstadoMesa,
  EstadoReserva,
  EVENT_TOPICS,
  type ActualizarEstadoMesaRequestDto,
  type ActualizarEstadoMesaResponseDto,
  type DiningSessionIniciadaPayload,
  type EventEnvelope,
  type OcuparMesaResponseDto,
} from '@floor/shared';
import {
  resolverMeseroId,
  type UsuarioAutenticado,
} from '../../common/decorators/usuario-actual.decorator';
import { Reloj } from '../../common/reloj/reloj';
import { OutboxService } from '../../events/outbox.service';
import {
  tieneReservaProxima,
  VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN,
} from './domain/reserva-proxima';
import { esTransicionManualPermitida } from './domain/transiciones-mesa';
import type { OcuparMesaDto } from './dto/ocupar-mesa.dto';
import type { MesaRegistro } from './mesa.registro';
import {
  mesaEnUnion,
  mesaNoDisponible,
  mesaNoEncontrada,
  reservaProximaPresente,
  sobrecupoDetectado,
  transicionInvalida,
} from './mesas.errores';
import { MesasRepository } from './mesas.repository';
import { VENTANA_RESERVA_PROXIMA_MINUTOS } from './mesas.tokens';

const MS_POR_MINUTO = 60_000;

function resolverCorrelationId(correlationId?: string | null): string {
  const limpio = correlationId?.trim();
  return limpio && limpio.length > 0 ? limpio : randomUUID();
}

@Injectable()
export class MesaEstadoService {
  constructor(
    private readonly repositorio: MesasRepository,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly reloj?: Reloj,
    @Optional()
    @Inject(VENTANA_RESERVA_PROXIMA_MINUTOS)
    private readonly ventanaMinutos: number = VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN,
  ) {}

  /**
   * BE-006 · RF-005 · RN-01 · RN-02 · RN-03 · RN-05 · ADR-005 · ADR-010:
   * Ocupa una mesa libre validando sobrecupo y reserva próxima en los siguientes 30 minutos,
   * transiciona la mesa a `Ocupada`, genera `sessionId` (UUID v4) y registra transaccionalmente
   * `sala.dining_session.iniciada` envuelto en `EventEnvelope` en el outbox.
   */
  async ocupar(
    mesaId: string,
    cuerpo: OcuparMesaDto,
    usuarioOMeseroId?: UsuarioAutenticado | string,
    correlationId?: string,
  ): Promise<OcuparMesaResponseDto> {
    return this.repositorio.enTransaccion(async (repo, tx) => {
      const mesa = await repo.buscarPorId(mesaId);
      if (!mesa?.activo) throw mesaNoEncontrada(mesaId);
      if (mesa.unionMesaId) throw mesaEnUnion(mesa.id);
      if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
        throw mesaNoDisponible(mesa.id, mesa.estadoFisico);
      }

      if (cuerpo.comensales > mesa.capacidad && !cuerpo.forzarSobrecupo) {
        throw sobrecupoDetectado(mesa.id, cuerpo.comensales, mesa.capacidad);
      }

      const ahora = this.reloj?.ahora() ?? new Date();
      const hayReservaProxima = await this.evaluarReservaProxima(repo, mesa, ahora);
      if (hayReservaProxima && !cuerpo.forzarOcupacion) {
        throw reservaProximaPresente(mesa.id);
      }

      const aplicada = await this.aplicarOcupacionEnRepositorio(repo, mesa.id, ahora);
      if (aplicada === false) {
        throw mesaNoDisponible(mesa.id, EstadoMesa.OCUPADA);
      }

      const sessionId = randomUUID();
      const timestamp = ahora.toISOString();
      const meseroId = resolverMeseroId(usuarioOMeseroId, cuerpo.meseroId);
      const correlationIdFinal = resolverCorrelationId(correlationId);

      const data: DiningSessionIniciadaPayload = {
        sessionId,
        mesaId: mesa.id,
        unionId: mesa.unionMesaId,
        meseroId,
        comensales: cuerpo.comensales,
        numComensales: cuerpo.comensales,
        timestamp,
      };

      const envelope: EventEnvelope<DiningSessionIniciadaPayload> = {
        eventId: randomUUID(),
        eventType: EVENT_TOPICS.DINING_SESSION_INICIADA,
        timestamp,
        correlationId: correlationIdFinal,
        data,
      };

      await this.persistirEventoOutbox(repo, tx, envelope, correlationIdFinal);

      return {
        mesaId: mesa.id,
        estado: EstadoMesa.OCUPADA,
        sessionId,
      };
    });
  }

  /** Alias semántico de `ocupar`. */
  ocuparMesa(
    mesaId: string,
    cuerpo: OcuparMesaDto,
    usuarioOMeseroId?: UsuarioAutenticado | string,
    correlationId?: string,
  ): Promise<OcuparMesaResponseDto> {
    return this.ocupar(mesaId, cuerpo, usuarioOMeseroId, correlationId);
  }

  /**
   * RF-006 · RF-007 · RF-008 · RN-06 · RN-07 · RN-15: cambio manual de estado físico de una mesa.
   * Orden de validación: existe y está activa → no está en unión → transición permitida.
   * Si se dispone de `OutboxService`, registra `sala.mesa.estado_actualizado` en la misma transacción.
   */
  async actualizarEstado(
    mesaId: string,
    { estado }: ActualizarEstadoMesaRequestDto,
    correlationId?: string,
  ): Promise<ActualizarEstadoMesaResponseDto> {
    return this.repositorio.enTransaccion(async (repo, tx) => {
      const mesa = await repo.buscarPorId(mesaId);
      if (!mesa?.activo) throw mesaNoEncontrada(mesaId);
      if (mesa.unionMesaId) throw mesaEnUnion(mesa.id);
      if (!esTransicionManualPermitida(mesa.estadoFisico, estado)) {
        throw transicionInvalida(mesa.id, mesa.estadoFisico, estado);
      }

      const aplicada = await repo.transicionarEstado(mesa.id, mesa.estadoFisico, estado);
      // Otra petición cambió la mesa entre la lectura y la escritura.
      if (!aplicada) throw transicionInvalida(mesa.id, mesa.estadoFisico, estado);

      if (this.outboxService && tx) {
        await this.outboxService.enqueue(tx, {
          routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
          payload: {
            mesaId: mesa.id,
            estado,
            unionId: mesa.unionMesaId,
            timestamp: (this.reloj?.ahora() ?? new Date()).toISOString(),
          },
          correlationId,
        });
      }

      return { mesaId: mesa.id, estado };
    });
  }

  private async evaluarReservaProxima(
    repo: MesasRepository,
    mesa: MesaRegistro,
    ahora: Date,
  ): Promise<boolean> {
    if (typeof mesa.tieneReservaProxima === 'boolean') {
      return mesa.tieneReservaProxima;
    }

    const hasta = new Date(ahora.getTime() + this.ventanaMinutos * MS_POR_MINUTO);

    if (typeof repo.tieneReservaProxima === 'function') {
      return Boolean(await repo.tieneReservaProxima(mesa.id, ahora, hasta));
    }

    if (typeof repo.reservasConfirmadasEntre === 'function') {
      const reservas = await repo.reservasConfirmadasEntre(ahora, hasta);
      const deLaMesa = (reservas ?? [])
        .filter((r) => r.mesaId === mesa.id)
        .map((r) => ({ inicio: r.inicio, estado: EstadoReserva.CONFIRMADA }));
      return tieneReservaProxima(deLaMesa, ahora, this.ventanaMinutos);
    }

    return false;
  }

  private async aplicarOcupacionEnRepositorio(
    repo: MesasRepository,
    mesaId: string,
    ahora: Date,
  ): Promise<boolean | undefined> {
    if (typeof repo.ocuparMesa === 'function') {
      return repo.ocuparMesa(mesaId, ahora);
    }
    if (typeof repo.transicionarEstado === 'function') {
      return repo.transicionarEstado(mesaId, EstadoMesa.LIBRE, EstadoMesa.OCUPADA);
    }
    return true;
  }

  private async persistirEventoOutbox(
    repo: MesasRepository,
    tx: Prisma.TransactionClient | undefined,
    envelope: EventEnvelope<DiningSessionIniciadaPayload>,
    correlationId: string,
  ): Promise<void> {
    if (this.outboxService) {
      if (tx) {
        await this.outboxService.enqueue(tx, {
          routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
          payload: envelope,
          correlationId,
        });
        return;
      }
      await this.outboxService.enqueue({
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: envelope,
        correlationId,
      });
      return;
    }

    if (typeof tx?.outboxEvento?.create === 'function') {
      await tx.outboxEvento.create({
        data: {
          routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
          payload: envelope as unknown as Prisma.InputJsonValue,
          correlationId,
          intentos: 0,
        },
      });
      return;
    }

    if (typeof repo.registrarEventoOutbox === 'function') {
      await repo.registrarEventoOutbox({
        routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
        payload: envelope,
        correlationId,
      });
    }
  }
}
