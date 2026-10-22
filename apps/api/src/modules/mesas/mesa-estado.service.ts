import { Injectable, Optional } from '@nestjs/common';
import {
  EVENT_TOPICS,
  type ActualizarEstadoMesaRequestDto,
  type ActualizarEstadoMesaResponseDto,
} from '@floor/shared';
import { Reloj } from '../../common/reloj/reloj';
import { OutboxService } from '../../events/outbox.service';
import { esTransicionManualPermitida } from './domain/transiciones-mesa';
import { mesaEnUnion, mesaNoEncontrada, transicionInvalida } from './mesas.errores';
import { MesasRepository } from './mesas.repository';

@Injectable()
export class MesaEstadoService {
  constructor(
    private readonly repositorio: MesasRepository,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional() private readonly reloj?: Reloj,
  ) {}

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
}
