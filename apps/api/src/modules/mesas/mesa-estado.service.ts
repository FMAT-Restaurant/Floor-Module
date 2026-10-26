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
  type MesaEstadoActualizadoPayload,
  type OcuparMesaResponseDto,
} from '@floor/shared';
import { resolverMeseroId } from '../../common/decorators/usuario-actual.decorator';
import { Reloj } from '../../common/reloj/reloj';
import { OutboxService } from '../../events/outbox.service';
import type { OutboxEventPayloadMap, OutboxRoutingKey } from '../../events/outbox.types';
import {
  tieneReservaProxima,
  VENTANA_RESERVA_PROXIMA_POR_DEFECTO_MIN,
} from './domain/reserva-proxima';
import { esTransicionManualPermitida } from './domain/transiciones-mesa';
import type { OcuparMesaDto } from './dto/ocupar-mesa.dto';
import type { MesaRegistro, ReservaProximaConflicto } from './mesa.registro';
import {
  camposOcupacionMutuamenteExcluyentes,
  esperaNoEncontradaEnOcupacion,
  mesaEnUnion,
  mesaNoDisponible,
  mesaNoEncontrada,
  reservaNoEncontradaEnOcupacion,
  reservaProximaPresente,
  sobrecupoDetectado,
  transicionEsperaInvalidaEnOcupacion,
  transicionInvalida,
  transicionReservaInvalidaEnOcupacion,
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
   * BE-006 · RF-005 · RF-017 · RN-01..RN-05 · RN-16 · ADR-005 · ADR-010:
   * Ocupa una mesa libre dentro de una transacción ACID:
   * 1. Valida exclusión mutua entre `reservaId` y `esperaId` (BLOQ-02).
   * 2. Verifica estado `Libre`, ausencia de unión activa, sobrecupo (`RN-02`) y reserva próxima en
   *    30 min (`RN-05`, eximiendo la propia `reservaId` en IMP-02).
   * 3. Acumula `advertencias` si se forzó sobrecupo u ocupación con reserva próxima (BLOQ-03).
   * 4. Transiciona `Reserva` a `Completada` (`RF-017`) o `ListaEspera` a `Sentado` (BLOQ-02).
   * 5. Pasa la mesa a `Ocupada` y registra la asignación activa del mesero (`AsignacionMesero`, IMP-01).
   * 6. Encola `sala.dining_session.iniciada` y `sala.mesa.estado_actualizado` en Outbox con
   *    payload de dominio puro (BLOQ-01, BLOQ-04).
   */
  async ocupar(
    mesaId: string,
    cuerpo: OcuparMesaDto,
    usuarioOMeseroId?: unknown,
    correlationId?: string,
  ): Promise<OcuparMesaResponseDto> {
    if (cuerpo.reservaId !== undefined && cuerpo.esperaId !== undefined) {
      throw camposOcupacionMutuamenteExcluyentes(cuerpo.reservaId, cuerpo.esperaId);
    }

    const meseroId = resolverMeseroId(usuarioOMeseroId, cuerpo.meseroId);

    return this.repositorio.enTransaccion(async (repo, tx) => {
      const mesa = await repo.buscarPorId(mesaId);
      if (!mesa?.activo) throw mesaNoEncontrada(mesaId);
      if (mesa.unionMesaId) throw mesaEnUnion(mesa.id);
      if (mesa.estadoFisico !== EstadoMesa.LIBRE) {
        throw mesaNoDisponible(mesa.id, mesa.estadoFisico);
      }

      const advertencias: string[] = [];

      if (cuerpo.comensales > mesa.capacidad) {
        if (!cuerpo.forzarSobrecupo) {
          throw sobrecupoDetectado(mesa.id, cuerpo.comensales, mesa.capacidad);
        }
        advertencias.push(
          `Sobrecupo forzado: ${cuerpo.comensales} comensales superan la capacidad física de la mesa (${mesa.capacidad})`,
        );
      }

      const ahora = this.reloj?.ahora() ?? new Date();
      const conflictoReserva = await this.evaluarReservaProxima(
        repo,
        mesa,
        ahora,
        cuerpo.reservaId,
      );
      if (conflictoReserva !== null) {
        if (!cuerpo.forzarOcupacion) {
          const detallesConflicto: Record<string, unknown> = {};
          if (conflictoReserva.reservaId) {
            detallesConflicto.reservaId = conflictoReserva.reservaId;
            detallesConflicto.nombreContacto = conflictoReserva.nombreContacto;
            detallesConflicto.horaInicio = conflictoReserva.horaInicio;
            detallesConflicto.cantidadPersonas = conflictoReserva.cantidadPersonas;
          }
          throw reservaProximaPresente(mesa.id, detallesConflicto);
        }
        advertencias.push(
          `Ocupación forzada con reserva próxima confirmada en los próximos ${this.ventanaMinutos} minutos`,
        );
      }

      if (cuerpo.reservaId !== undefined) {
        await this.completarReservaAsociada(repo, cuerpo.reservaId, mesa.id);
      }

      if (cuerpo.esperaId !== undefined) {
        await this.sentarEsperaAsociada(repo, cuerpo.esperaId, mesa.id);
      }

      const aplicada = await this.aplicarOcupacionEnRepositorio(repo, mesa.id, ahora);
      if (aplicada === false) {
        throw mesaNoDisponible(mesa.id, EstadoMesa.OCUPADA);
      }

      await this.registrarAsignacionMesero(repo, mesa.id, meseroId, ahora);

      const sessionId = randomUUID();
      const timestamp = ahora.toISOString();
      const correlationIdFinal = resolverCorrelationId(correlationId);

      const payloadDiningSession: DiningSessionIniciadaPayload = {
        sessionId,
        mesaId: mesa.id,
        unionId: mesa.unionMesaId,
        meseroId,
        comensales: cuerpo.comensales,
        numComensales: cuerpo.comensales,
        timestamp,
      };

      const payloadEstadoActualizado: MesaEstadoActualizadoPayload = {
        mesaId: mesa.id,
        estado: EstadoMesa.OCUPADA,
        unionId: mesa.unionMesaId,
        timestamp,
      };

      await this.persistirEventoOutbox(
        repo,
        tx,
        EVENT_TOPICS.DINING_SESSION_INICIADA,
        payloadDiningSession,
        correlationIdFinal,
      );
      await this.persistirEventoOutbox(
        repo,
        tx,
        EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payloadEstadoActualizado,
        correlationIdFinal,
      );

      return {
        mesaId: mesa.id,
        estado: EstadoMesa.OCUPADA,
        sessionId,
        ...(advertencias.length > 0 ? { advertencias } : {}),
      };
    });
  }

  /** Alias semántico de `ocupar`. */
  ocuparMesa(
    mesaId: string,
    cuerpo: OcuparMesaDto,
    usuarioOMeseroId?: unknown,
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
    excluirReservaId?: string,
  ): Promise<ReservaProximaConflicto | null> {
    if (typeof mesa.tieneReservaProxima === 'boolean') {
      return mesa.tieneReservaProxima
        ? { reservaId: '', nombreContacto: '', horaInicio: '', cantidadPersonas: 0 }
        : null;
    }

    const hasta = new Date(ahora.getTime() + this.ventanaMinutos * MS_POR_MINUTO);

    if (typeof repo.buscarReservaProxima === 'function') {
      return repo.buscarReservaProxima(mesa.id, ahora, hasta, excluirReservaId);
    }

    if (typeof repo.tieneReservaProxima === 'function') {
      const tiene = Boolean(
        await repo.tieneReservaProxima(mesa.id, ahora, hasta, excluirReservaId),
      );
      return tiene
        ? { reservaId: '', nombreContacto: '', horaInicio: '', cantidadPersonas: 0 }
        : null;
    }

    if (typeof repo.reservasConfirmadasEntre === 'function') {
      const reservas = await repo.reservasConfirmadasEntre(ahora, hasta);
      const deLaMesa = (reservas ?? [])
        .filter((r) => r.mesaId === mesa.id)
        .map((r) => ({ inicio: r.inicio, estado: EstadoReserva.CONFIRMADA }));
      return tieneReservaProxima(deLaMesa, ahora, this.ventanaMinutos)
        ? { reservaId: '', nombreContacto: '', horaInicio: '', cantidadPersonas: 0 }
        : null;
    }

    return null;
  }

  private async completarReservaAsociada(
    repo: MesasRepository,
    reservaId: string,
    mesaId: string,
  ): Promise<void> {
    if (typeof repo.completarReservaEnOcupacion !== 'function') {
      return;
    }
    const resultado = await repo.completarReservaEnOcupacion(reservaId, mesaId);
    if (resultado === 'NO_EXISTE') {
      throw reservaNoEncontradaEnOcupacion(reservaId);
    }
    if (resultado === 'INVALIDA') {
      throw transicionReservaInvalidaEnOcupacion(reservaId, mesaId);
    }
  }

  private async sentarEsperaAsociada(
    repo: MesasRepository,
    esperaId: string,
    mesaId: string,
  ): Promise<void> {
    if (typeof repo.sentarEsperaEnOcupacion !== 'function') {
      return;
    }
    const resultado = await repo.sentarEsperaEnOcupacion(esperaId, mesaId);
    if (resultado === 'NO_EXISTE') {
      throw esperaNoEncontradaEnOcupacion(esperaId);
    }
    if (resultado === 'INVALIDA') {
      throw transicionEsperaInvalidaEnOcupacion(esperaId);
    }
  }

  private async registrarAsignacionMesero(
    repo: MesasRepository,
    mesaId: string,
    meseroId: string,
    ahora: Date,
  ): Promise<void> {
    if (typeof repo.registrarAsignacionEnOcupacion === 'function') {
      await repo.registrarAsignacionEnOcupacion(mesaId, meseroId, ahora);
    }
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

  private async persistirEventoOutbox<T extends OutboxRoutingKey>(
    repo: MesasRepository,
    tx: Prisma.TransactionClient | undefined,
    routingKey: T,
    payload: OutboxEventPayloadMap[T],
    correlationId: string,
  ): Promise<void> {
    if (this.outboxService) {
      if (tx) {
        await this.outboxService.enqueue(tx, {
          routingKey,
          payload,
          correlationId,
        });
        return;
      }
      await this.outboxService.enqueue({
        routingKey,
        payload,
        correlationId,
      });
      return;
    }

    if (typeof tx?.outboxEvento?.create === 'function') {
      await tx.outboxEvento.create({
        data: {
          routingKey,
          payload: payload as unknown as Prisma.InputJsonValue,
          correlationId,
          intentos: 0,
        },
      });
      return;
    }

    if (typeof repo.registrarEventoOutbox === 'function') {
      await repo.registrarEventoOutbox({
        routingKey,
        payload,
        correlationId,
      });
    }
  }
}
