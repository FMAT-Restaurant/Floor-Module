import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  EstadoMesa,
  EstadoUnion,
  EVENT_TOPICS,
  type CrearUnionRequestDto,
  type CrearUnionResponseDto,
  type LiberarUnionResponseDto,
  type UnionDto,
} from '@floor/shared';
import { Reloj } from '../../common/reloj/reloj';
import { OutboxService } from '../../events/outbox.service';
import { VENTANA_RESERVA_PROXIMA_MINUTOS } from '../mesas/mesas.tokens';
import { validarMesasParaUnion, validarSeleccionUnion } from './domain/validar-union';
import type { UnionRegistro } from './union.registro';
import {
  mesasNoDisponiblesParaUnion,
  reservaProximaEnUnion,
  sobrecupoEnUnion,
  unionNoEncontrada,
  unionYaDisuelta,
} from './uniones.errores';
import { UnionesRepository } from './uniones.repository';

const MS_POR_MINUTO = 60_000;

function aUnionDto(union: UnionRegistro): UnionDto {
  return {
    unionId: union.id,
    zona: union.zona,
    mesasIds: union.mesasIds,
    estado: union.estado,
    fechaCreacion: union.fechaCreacion.toISOString(),
    fechaDisolucion: union.fechaDisolucion?.toISOString() ?? null,
  };
}

/**
 * BE-009 · RF-018 · RF-019 · RNF-004 · ADR-009: creación y disolución atómica de uniones.
 * Toda escritura (mesas, unión, asignaciones y outbox) ocurre en una única transacción;
 * los eventos sólo se publican tras el commit vía outbox (ADR-006).
 */
@Injectable()
export class UnionesService {
  private readonly logger = new Logger(UnionesService.name);

  constructor(
    private readonly repositorio: UnionesRepository,
    private readonly outbox: OutboxService,
    private readonly reloj: Reloj,
    @Inject(VENTANA_RESERVA_PROXIMA_MINUTOS) private readonly ventanaMinutos: number,
  ) {}

  listar(estado: EstadoUnion = EstadoUnion.ACTIVA): Promise<UnionDto[]> {
    return this.repositorio.listar(estado).then((uniones) => uniones.map(aUnionDto));
  }

  /**
   * F3 pasos 1–7 · RN-12 · RN-13: valida y consolida la unión.
   * 1. Bloquea las mesas en orden `id_mesa` ASC.
   * 2. Valida existencia, misma zona y estado Libre sin unión previa.
   * 3. Aplica RN-02 (sobrecupo) y RN-05 (reserva próxima) con sus banderas de confirmación.
   * 4. Crea la `UnionMesa` Activa, ocupa todas las mesas y asigna el mesero (RN-16).
   * 5. Encola un único `sala.dining_session.iniciada` y un `sala.mesa.estado_actualizado` por mesa.
   */
  async crear(
    cuerpo: CrearUnionRequestDto,
    correlationId?: string,
  ): Promise<CrearUnionResponseDto> {
    const { mesasIds, totalPersonas, meseroId } = cuerpo;
    validarSeleccionUnion(mesasIds);

    const resultado = await this.repositorio.enTransaccion(async (repo, tx) => {
      const mesas = await repo.bloquearMesas(mesasIds);
      const { zona, capacidadTotal } = validarMesasParaUnion(mesasIds, mesas);

      if (totalPersonas > capacidadTotal && !cuerpo.forzarSobrecupo) {
        throw sobrecupoEnUnion(totalPersonas, capacidadTotal);
      }

      const ahora = this.reloj.ahora();
      const hasta = new Date(ahora.getTime() + this.ventanaMinutos * MS_POR_MINUTO);
      const reservaProxima = await repo.buscarReservaProxima(mesasIds, ahora, hasta);
      if (reservaProxima && !cuerpo.forzarOcupacion) {
        throw reservaProximaEnUnion(reservaProxima, this.ventanaMinutos);
      }

      const unionId = await repo.crearUnion(zona, ahora);
      const ocupadas = await repo.ocuparMesasEnUnion(mesasIds, unionId, ahora);
      if (ocupadas !== mesasIds.length) {
        // Defensa ante cambios concurrentes: cualquier diferencia revierte toda la transacción.
        throw mesasNoDisponiblesParaUnion([]);
      }
      await repo.asignarMesero(mesasIds, meseroId, ahora);

      const sessionId = randomUUID();
      await this.encolarEventosCreacion(tx, {
        sessionId,
        unionId,
        mesasIds,
        meseroId,
        totalPersonas,
        timestamp: ahora.toISOString(),
        correlationId,
      });

      return {
        unionId,
        sessionId,
        sobrecupo: totalPersonas > capacidadTotal,
        reservaProxima: reservaProxima !== null,
      };
    });

    if (resultado.sobrecupo || resultado.reservaProxima) {
      this.logger.warn(
        `Unión ${resultado.unionId} creada forzando ${[
          resultado.sobrecupo ? 'sobrecupo' : null,
          resultado.reservaProxima ? 'reserva próxima' : null,
        ]
          .filter(Boolean)
          .join(' y ')}`,
      );
    }

    return {
      unionId: resultado.unionId,
      mesasIds: [...mesasIds],
      estado: EstadoMesa.OCUPADA,
      sessionId: resultado.sessionId,
    };
  }

  /**
   * F3 pasos 8–10 · RN-14: disuelve la unión, desvincula sus mesas y las pasa a
   * Limpieza pendiente en una sola transacción; emite `sala.mesa.estado_actualizado`
   * con `unionId: null` por cada mesa.
   */
  async liberar(unionId: string, correlationId?: string): Promise<LiberarUnionResponseDto> {
    const mesasIds = await this.repositorio.enTransaccion(async (repo, tx) => {
      const union = await repo.bloquearUnion(unionId);
      if (!union) throw unionNoEncontrada(unionId);
      if (union.estado !== EstadoUnion.ACTIVA) throw unionYaDisuelta(unionId);

      const ids = await repo.bloquearMesasDeUnion(unionId);
      const ahora = this.reloj.ahora();
      await repo.liberarMesasDeUnion(unionId);
      await repo.disolverUnion(unionId, ahora);

      const timestamp = ahora.toISOString();
      for (const mesaId of ids) {
        await this.outbox.enqueue(tx, {
          routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
          payload: { mesaId, estado: EstadoMesa.LIMPIEZA_PENDIENTE, unionId: null, timestamp },
          correlationId,
        });
      }
      return ids;
    });

    return { mesasIds, estado: EstadoMesa.LIMPIEZA_PENDIENTE };
  }

  private async encolarEventosCreacion(
    tx: Prisma.TransactionClient,
    datos: {
      sessionId: string;
      unionId: string;
      mesasIds: readonly string[];
      meseroId: string;
      totalPersonas: number;
      timestamp: string;
      correlationId?: string;
    },
  ): Promise<void> {
    const { sessionId, unionId, mesasIds, meseroId, totalPersonas, timestamp, correlationId } =
      datos;

    await this.outbox.enqueue(tx, {
      routingKey: EVENT_TOPICS.DINING_SESSION_INICIADA,
      payload: {
        sessionId,
        unionId,
        mesasIds: [...mesasIds],
        meseroId,
        comensales: totalPersonas,
        numComensales: totalPersonas,
        timestamp,
      },
      correlationId,
    });

    for (const mesaId of mesasIds) {
      await this.outbox.enqueue(tx, {
        routingKey: EVENT_TOPICS.MESA_ESTADO_ACTUALIZADO,
        payload: { mesaId, estado: EstadoMesa.OCUPADA, unionId, timestamp },
        correlationId,
      });
    }
  }
}
