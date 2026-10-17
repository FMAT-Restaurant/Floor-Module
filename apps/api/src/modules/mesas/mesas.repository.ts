import { Injectable } from '@nestjs/common';
import type { Mesa as FilaMesa, Prisma } from '@prisma/client';
import type {
  ActualizarMesaRequestDto,
  CrearMesaRequestDto,
  ListarMesasQueryDto,
} from '@floor/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { estadoMesaAPrisma, estadoMesaDesdePrisma } from './estado-mesa.mapper';
import type { MesaEnVivoRegistro, MesaRegistro, ReservaProximaRegistro } from './mesa.registro';

function aRegistro(fila: FilaMesa): MesaRegistro {
  return {
    id: fila.id,
    numeroMesa: fila.numeroMesa,
    capacidad: fila.capacidad,
    zona: fila.zona,
    estadoFisico: estadoMesaDesdePrisma(fila.estadoFisico),
    unionMesaId: fila.unionMesaId,
    activo: fila.activo,
    ocupadaDesde: fila.ocupadaDesde,
  };
}

@Injectable()
export class MesasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: ListarMesasQueryDto): Promise<MesaRegistro[]> {
    const where: Prisma.MesaWhereInput = {};
    if (!filtro.incluirInactivas) where.activo = true;
    if (filtro.zona) where.zona = filtro.zona;
    if (filtro.estado) where.estadoFisico = estadoMesaAPrisma(filtro.estado);

    const filas = await this.prisma.mesa.findMany({ where, orderBy: { numeroMesa: 'asc' } });
    return filas.map(aRegistro);
  }

  async listarEnVivo(): Promise<MesaEnVivoRegistro[]> {
    const filas = await this.prisma.mesa.findMany({
      where: { activo: true },
      orderBy: { numeroMesa: 'asc' },
      include: {
        asignaciones: { where: { activo: true }, select: { meseroId: true }, take: 1 },
      },
    });
    return filas.map((fila) => ({
      ...aRegistro(fila),
      meseroId: fila.asignaciones[0]?.meseroId ?? null,
    }));
  }

  async buscarPorId(mesaId: string): Promise<MesaRegistro | null> {
    const fila = await this.prisma.mesa.findUnique({ where: { id: mesaId } });
    return fila ? aRegistro(fila) : null;
  }

  async existeMesaActivaConNumero(numeroMesa: number, excluirMesaId?: string): Promise<boolean> {
    const total = await this.prisma.mesa.count({
      where: {
        numeroMesa,
        activo: true,
        ...(excluirMesaId ? { id: { not: excluirMesaId } } : {}),
      },
    });
    return total > 0;
  }

  async crear(datos: CrearMesaRequestDto): Promise<MesaRegistro> {
    return aRegistro(await this.prisma.mesa.create({ data: datos }));
  }

  async actualizar(mesaId: string, datos: ActualizarMesaRequestDto): Promise<MesaRegistro> {
    return aRegistro(await this.prisma.mesa.update({ where: { id: mesaId }, data: datos }));
  }

  async darDeBaja(mesaId: string): Promise<void> {
    await this.prisma.mesa.update({ where: { id: mesaId }, data: { activo: false } });
  }

  /** RN-18: reservas Confirmada que aún no terminan. `rango` es Unsupported, de ahí el SQL. */
  async contarReservasConfirmadasFuturas(mesaId: string, ahora: Date): Promise<number> {
    const filas = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM "Reserva"
      WHERE "id_mesa" = ${mesaId}::uuid
        AND "estado" = 'Confirmada'::"EstadoReserva"
        AND upper("rango") > ${ahora.toISOString()}::timestamptz`;
    return filas[0]?.total ?? 0;
  }

  /** RN-08: inicios de reservas Confirmada dentro de [desde, hasta]. */
  async reservasConfirmadasEntre(desde: Date, hasta: Date): Promise<ReservaProximaRegistro[]> {
    return this.prisma.$queryRaw<ReservaProximaRegistro[]>`
      SELECT "id_mesa" AS "mesaId", lower("rango") AS "inicio"
      FROM "Reserva"
      WHERE "estado" = 'Confirmada'::"EstadoReserva"
        AND lower("rango") >= ${desde.toISOString()}::timestamptz
        AND lower("rango") <= ${hasta.toISOString()}::timestamptz`;
  }
}
