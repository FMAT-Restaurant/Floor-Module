import { Injectable } from '@nestjs/common';
import {
  EstadoMesa as EstadoMesaPrisma,
  EstadoUnion as EstadoUnionPrisma,
  type Prisma,
} from '@prisma/client';
import { EstadoMesa, EstadoUnion } from '@floor/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { MesaCandidataRegistro, ReservaProximaEnUnion, UnionRegistro } from './union.registro';

type ClientePrisma = PrismaService | Prisma.TransactionClient;

const ESTADOS_MESA = new Set<string>(Object.values(EstadoMesa));

function aEstadoMesa(valor: string): EstadoMesa {
  if (!ESTADOS_MESA.has(valor)) throw new Error(`Estado de mesa desconocido: ${valor}`);
  return valor as EstadoMesa;
}

function aEstadoUnion(valor: EstadoUnionPrisma): EstadoUnion {
  return valor === EstadoUnionPrisma.Activa ? EstadoUnion.ACTIVA : EstadoUnion.DISUELTA;
}

function aEstadoUnionPrisma(valor: EstadoUnion): EstadoUnionPrisma {
  return valor === EstadoUnion.ACTIVA ? EstadoUnionPrisma.Activa : EstadoUnionPrisma.Disuelta;
}

/** BE-009 · persistencia de `UnionMesa` y de las mesas que agrupa (RN-12..RN-14). */
@Injectable()
export class UnionesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Construye un repositorio ligado a un cliente transaccional. */
  private static deCliente(cliente: ClientePrisma): UnionesRepository {
    return new UnionesRepository(cliente as PrismaService);
  }

  /** RNF-004: ejecuta `operacion` dentro de una única transacción de base de datos. */
  enTransaccion<T>(
    operacion: (repo: UnionesRepository, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => operacion(UnionesRepository.deCliente(tx), tx));
  }

  /**
   * F3 paso 3: bloquea las mesas en orden `id_mesa` ASC (`FOR UPDATE`) para serializar
   * uniones/ocupaciones concurrentes sin riesgo de deadlock.
   */
  async bloquearMesas(mesasIds: readonly string[]): Promise<MesaCandidataRegistro[]> {
    const filas = await this.prisma.$queryRaw<
      Array<Omit<MesaCandidataRegistro, 'estadoFisico'> & { estadoFisico: string }>
    >`
      SELECT
        "id_mesa" AS "id",
        "numero_mesa" AS "numeroMesa",
        "capacidad",
        "zona",
        "estado_fisico"::text AS "estadoFisico",
        "id_union_mesa" AS "unionMesaId",
        "activo"
      FROM "Mesa"
      WHERE "id_mesa" = ANY(${[...mesasIds]}::uuid[])
      ORDER BY "id_mesa" ASC
      FOR UPDATE`;
    return filas.map((fila) => ({ ...fila, estadoFisico: aEstadoMesa(fila.estadoFisico) }));
  }

  /** RN-05 · RN-08: primera reserva Confirmada que inicia en [desde, hasta] en alguna mesa. */
  async buscarReservaProxima(
    mesasIds: readonly string[],
    desde: Date,
    hasta: Date,
  ): Promise<ReservaProximaEnUnion | null> {
    const filas = await this.prisma.$queryRaw<ReservaProximaEnUnion[]>`
      SELECT
        "id_mesa" AS "mesaId",
        "id_reserva" AS "reservaId",
        "nombre_contacto" AS "nombreContacto",
        TO_CHAR("hora_inicio", 'HH24:MI') AS "horaInicio",
        "cantidad_personas"::int AS "cantidadPersonas"
      FROM "Reserva"
      WHERE "id_mesa" = ANY(${[...mesasIds]}::uuid[])
        AND "estado" = 'Confirmada'::"EstadoReserva"
        AND lower("rango") >= ${desde.toISOString()}::timestamptz
        AND lower("rango") <= ${hasta.toISOString()}::timestamptz
      ORDER BY lower("rango") ASC
      LIMIT 1`;
    return filas[0] ?? null;
  }

  async crearUnion(zona: string, fechaCreacion: Date): Promise<string> {
    const union = await this.prisma.unionMesa.create({
      data: { zona, fechaCreacion, estado: EstadoUnionPrisma.Activa },
      select: { id: true },
    });
    return union.id;
  }

  /**
   * RN-13: pasa todas las mesas a Ocupada vinculadas a la unión. Sólo actualiza mesas que
   * siguen activas, Libres y sin unión; devuelve cuántas filas cambiaron.
   */
  async ocuparMesasEnUnion(
    mesasIds: readonly string[],
    unionId: string,
    ocupadaDesde: Date,
  ): Promise<number> {
    const { count } = await this.prisma.mesa.updateMany({
      where: {
        id: { in: [...mesasIds] },
        activo: true,
        unionMesaId: null,
        estadoFisico: EstadoMesaPrisma.Libre,
      },
      data: { estadoFisico: EstadoMesaPrisma.Ocupada, unionMesaId: unionId, ocupadaDesde },
    });
    return count;
  }

  /** RN-16: cierra las asignaciones activas de las mesas y crea la del mesero de la unión. */
  async asignarMesero(
    mesasIds: readonly string[],
    meseroId: string,
    fechaHoraInicio: Date,
  ): Promise<void> {
    await this.prisma.asignacionMesero.updateMany({
      where: { mesaId: { in: [...mesasIds] }, activo: true },
      data: { activo: false, fechaHoraFin: fechaHoraInicio },
    });
    await this.prisma.asignacionMesero.createMany({
      data: mesasIds.map((mesaId) => ({ mesaId, meseroId, fechaHoraInicio, activo: true })),
    });
  }

  /** Bloquea la unión (`FOR UPDATE`) para serializar disoluciones concurrentes. */
  async bloquearUnion(unionId: string): Promise<{ id: string; estado: EstadoUnion } | null> {
    const filas = await this.prisma.$queryRaw<Array<{ id: string; estado: EstadoUnionPrisma }>>`
      SELECT "id_union" AS "id", "estado"
      FROM "UnionMesa"
      WHERE "id_union" = ${unionId}::uuid
      FOR UPDATE`;
    const fila = filas[0];
    return fila ? { id: fila.id, estado: aEstadoUnion(fila.estado) } : null;
  }

  /** Mesas vinculadas a la unión, bloqueadas en orden `id_mesa` ASC. */
  async bloquearMesasDeUnion(unionId: string): Promise<string[]> {
    const filas = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id_mesa" AS "id"
      FROM "Mesa"
      WHERE "id_union_mesa" = ${unionId}::uuid
      ORDER BY "id_mesa" ASC
      FOR UPDATE`;
    return filas.map((fila) => fila.id);
  }

  /** RN-14: desvincula las mesas de la unión y las pasa a Limpieza pendiente. */
  async liberarMesasDeUnion(unionId: string): Promise<number> {
    const { count } = await this.prisma.mesa.updateMany({
      where: { unionMesaId: unionId },
      data: {
        unionMesaId: null,
        estadoFisico: EstadoMesaPrisma.Limpieza_pendiente,
        ocupadaDesde: null,
      },
    });
    return count;
  }

  async disolverUnion(unionId: string, fechaDisolucion: Date): Promise<void> {
    await this.prisma.unionMesa.update({
      where: { id: unionId },
      data: { estado: EstadoUnionPrisma.Disuelta, fechaDisolucion },
    });
  }

  /**
   * SPEC §5.5 · GET /mesas/uniones. `mesasIds` refleja las mesas vinculadas actualmente:
   * al disolverse, las mesas se desvinculan (RN-14), por lo que una unión Disuelta no conserva
   * su lista de mesas en el modelo de datos actual.
   */
  async listar(estado: EstadoUnion): Promise<UnionRegistro[]> {
    const filas = await this.prisma.unionMesa.findMany({
      where: { estado: aEstadoUnionPrisma(estado) },
      orderBy: { fechaCreacion: 'desc' },
      include: { mesas: { select: { id: true }, orderBy: { numeroMesa: 'asc' } } },
    });
    return filas.map((fila) => ({
      id: fila.id,
      zona: fila.zona,
      estado: aEstadoUnion(fila.estado),
      fechaCreacion: fila.fechaCreacion,
      fechaDisolucion: fila.fechaDisolucion,
      mesasIds: fila.mesas.map((mesa) => mesa.id),
    }));
  }
}
