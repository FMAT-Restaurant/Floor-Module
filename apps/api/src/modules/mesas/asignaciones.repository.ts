import { Injectable } from '@nestjs/common';
import type { AsignacionMesero as FilaAsignacion, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AsignacionRegistro,
  CrearAsignacionDatos,
  FiltroAsignaciones,
} from './asignacion.registro';

function aRegistro(fila: FilaAsignacion): AsignacionRegistro {
  return {
    id: fila.id,
    mesaId: fila.mesaId,
    meseroId: fila.meseroId,
    fechaHoraInicio: fila.fechaHoraInicio,
    fechaHoraFin: fila.fechaHoraFin,
    activo: fila.activo,
  };
}

@Injectable()
export class AsignacionesRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(operacion: (repo: AsignacionesRepository) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) =>
      operacion(new AsignacionesRepository(tx as PrismaService)),
    );
  }

  /**
   * Verifica que la mesa exista y esté activa, bloqueando la fila dentro de la transacción
   * para serializar asignaciones concurrentes sobre la misma mesa (RN-16).
   */
  async bloquearMesaActiva(mesaId: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "id_mesa" AS "id"
      FROM "Mesa"
      WHERE "id_mesa" = ${mesaId}::uuid
        AND "activo" = true
      FOR UPDATE`;
    return filas.length > 0;
  }

  async buscarActivaPorMesa(mesaId: string): Promise<AsignacionRegistro | null> {
    const fila = await this.prisma.asignacionMesero.findFirst({
      where: { mesaId, activo: true },
    });
    return fila ? aRegistro(fila) : null;
  }

  async cerrar(asignacionId: string, fechaHoraFin: Date): Promise<AsignacionRegistro> {
    const fila = await this.prisma.asignacionMesero.update({
      where: { id: asignacionId },
      data: { activo: false, fechaHoraFin },
    });
    return aRegistro(fila);
  }

  async crear(datos: CrearAsignacionDatos): Promise<AsignacionRegistro> {
    const fila = await this.prisma.asignacionMesero.create({
      data: {
        mesaId: datos.mesaId,
        meseroId: datos.meseroId,
        fechaHoraInicio: datos.fechaHoraInicio,
        fechaHoraFin: null,
        activo: true,
      },
    });
    return aRegistro(fila);
  }

  async listar(filtro: FiltroAsignaciones): Promise<AsignacionRegistro[]> {
    const where: Prisma.AsignacionMeseroWhereInput = {
      activo: filtro.activo ?? true,
    };
    if (filtro.meseroId) {
      where.meseroId = filtro.meseroId;
    }

    const filas = await this.prisma.asignacionMesero.findMany({
      where,
      orderBy: [{ fechaHoraInicio: 'desc' }, { id: 'asc' }],
    });
    return filas.map(aRegistro);
  }
}
