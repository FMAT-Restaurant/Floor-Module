import { Injectable } from '@nestjs/common';
import type {
  ActualizarEstadoMesaRequestDto,
  ActualizarEstadoMesaResponseDto,
} from '@floor/shared';
import { esTransicionManualPermitida } from './domain/transiciones-mesa';
import { mesaEnUnion, mesaNoEncontrada, transicionInvalida } from './mesas.errores';
import { MesasRepository } from './mesas.repository';

@Injectable()
export class MesaEstadoService {
  constructor(private readonly repositorio: MesasRepository) {}

  /**
   * RF-006 · RF-007 · RN-06 · RN-07 · RN-15: cambio manual de estado físico de una mesa.
   * Orden de validación: existe y está activa → no está en unión → transición permitida.
   */
  async actualizarEstado(
    mesaId: string,
    { estado }: ActualizarEstadoMesaRequestDto,
  ): Promise<ActualizarEstadoMesaResponseDto> {
    return this.repositorio.enTransaccion(async (repo) => {
      const mesa = await repo.buscarPorId(mesaId);
      if (!mesa?.activo) throw mesaNoEncontrada(mesaId);
      if (mesa.unionMesaId) throw mesaEnUnion(mesa.id);
      if (!esTransicionManualPermitida(mesa.estadoFisico, estado)) {
        throw transicionInvalida(mesa.id, mesa.estadoFisico, estado);
      }

      const aplicada = await repo.transicionarEstado(mesa.id, mesa.estadoFisico, estado);
      // Otra petición cambió la mesa entre la lectura y la escritura.
      if (!aplicada) throw transicionInvalida(mesa.id, mesa.estadoFisico, estado);

      return { mesaId: mesa.id, estado };
    });
  }
}
