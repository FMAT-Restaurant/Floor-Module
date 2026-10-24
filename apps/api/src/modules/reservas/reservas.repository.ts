import { Injectable } from '@nestjs/common';
import type {
  EstadoMesa as EstadoMesaPrisma,
  Mesa as FilaMesa,
  Prisma,
  Reserva as FilaReserva,
} from '@prisma/client';
import type { EstadoReserva, ListarReservasQueryDto } from '@floor/shared';
import { traducirErrorPrisma } from '../../common/errors/prisma-error.translator';
import { PrismaService } from '../../prisma/prisma.service';
import { estadoMesaDesdePrisma } from '../mesas/estado-mesa.mapper';
import type { MesaRegistro } from '../mesas/mesa.registro';
import { construirTstzRange } from './domain/rango-reserva';
import { estadoReservaAPrisma, estadoReservaDesdePrisma } from './estado-reserva.mapper';
import type {
  ActualizarReservaDatos,
  CrearReservaDatos,
  FiltroDisponibilidadDatos,
  ReservaRegistro,
} from './reserva.registro';

interface FilaMesaCruda {
  id: string;
  numeroMesa: number;
  capacidad: number;
  zona: string;
  estadoFisico: EstadoMesaPrisma;
  unionMesaId: string | null;
  activo: boolean;
  ocupadaDesde: Date | null;
}

export function fechaAPrisma(fecha: string): Date {
  return new Date(`${fecha}T00:00:00.000Z`);
}

export function horaAPrisma(hora: string): Date {
  return new Date(`1970-01-01T${hora}:00.000Z`);
}

export function fechaDesdePrisma(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function horaDesdePrisma(hora: Date): string {
  return hora.toISOString().slice(11, 16);
}

function aReservaRegistro(fila: FilaReserva): ReservaRegistro {
  return {
    id: fila.id,
    mesaId: fila.mesaId,
    nombreContacto: fila.nombreContacto,
    telefonoContacto: fila.telefonoContacto,
    cantidadPersonas: fila.cantidadPersonas,
    fecha: fechaDesdePrisma(fila.fechaReserva),
    horaInicio: horaDesdePrisma(fila.horaInicio),
    horaFin: horaDesdePrisma(fila.horaFin),
    estado: estadoReservaDesdePrisma(fila.estado),
    alertaEmitida: fila.alertaEmitida,
  };
}

function aMesaRegistro(fila: FilaMesa | FilaMesaCruda): MesaRegistro {
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

function relanzarTraducido(error: unknown): never {
  const traducido = traducirErrorPrisma(error);
  if (traducido) {
    throw traducido;
  }
  throw error;
}

@Injectable()
export class ReservasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async enTransaccion<T>(
    operacion: (repo: ReservasRepository, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction((tx) =>
        operacion(new ReservasRepository(tx as PrismaService), tx),
      );
    } catch (error) {
      relanzarTraducido(error);
    }
  }

  async buscarMesaActiva(mesaId: string): Promise<MesaRegistro | null> {
    const fila = await this.prisma.mesa.findUnique({ where: { id: mesaId } });
    if (!fila?.activo) return null;
    return aMesaRegistro(fila);
  }

  async buscarPorId(reservaId: string): Promise<ReservaRegistro | null> {
    const fila = await this.prisma.reserva.findUnique({ where: { id: reservaId } });
    return fila ? aReservaRegistro(fila) : null;
  }

  async listar(filtro: ListarReservasQueryDto = {}): Promise<ReservaRegistro[]> {
    const where: Prisma.ReservaWhereInput = {};
    if (filtro.fecha) where.fechaReserva = fechaAPrisma(filtro.fecha);
    if (filtro.mesaId) where.mesaId = filtro.mesaId;
    if (filtro.estado) where.estado = estadoReservaAPrisma(filtro.estado);

    const filas = await this.prisma.reserva.findMany({
      where,
      orderBy: [{ fechaReserva: 'asc' }, { horaInicio: 'asc' }],
    });
    return filas.map(aReservaRegistro);
  }

  /**
   * RF-012 · RN-09 · RNF-003: inserta la reserva en estado Confirmada.
   * El trigger `reserva_calcular_rango_trg` genera `rango` (`tstzrange` semiabierto `[)`),
   * y la restricción `EXCLUDE USING gist (id_mesa WITH =, rango WITH &&)` garantiza a nivel motor
   * que no existan solapamientos temporales sobre la misma mesa.
   */
  async crear(datos: CrearReservaDatos): Promise<ReservaRegistro> {
    construirTstzRange(datos.fecha, datos.horaInicio, datos.horaFin);
    try {
      const fila = await this.prisma.reserva.create({
        data: {
          mesaId: datos.mesaId,
          nombreContacto: datos.nombreContacto,
          telefonoContacto: datos.telefonoContacto,
          cantidadPersonas: datos.cantidadPersonas,
          fechaReserva: fechaAPrisma(datos.fecha),
          horaInicio: horaAPrisma(datos.horaInicio),
          horaFin: horaAPrisma(datos.horaFin),
        },
      });
      return aReservaRegistro(fila);
    } catch (error) {
      relanzarTraducido(error);
    }
  }

  /**
   * RF-013 · RN-09: reprograma o modifica la reserva recalculando su `tstzrange` en PostgreSQL.
   * Si el nuevo horario colisiona con otra reserva Confirmada de la mesa, traduce la violación
   * de exclusión `reserva_no_solapada_excl` a 409 `RESERVA_SOLAPADA`.
   */
  async actualizar(reservaId: string, datos: ActualizarReservaDatos): Promise<ReservaRegistro> {
    construirTstzRange(datos.fecha, datos.horaInicio, datos.horaFin);
    try {
      const fila = await this.prisma.reserva.update({
        where: { id: reservaId },
        data: {
          mesaId: datos.mesaId,
          cantidadPersonas: datos.cantidadPersonas,
          fechaReserva: fechaAPrisma(datos.fecha),
          horaInicio: horaAPrisma(datos.horaInicio),
          horaFin: horaAPrisma(datos.horaFin),
          ...(datos.estado !== undefined ? { estado: estadoReservaAPrisma(datos.estado) } : {}),
        },
      });
      return aReservaRegistro(fila);
    } catch (error) {
      relanzarTraducido(error);
    }
  }

  async actualizarEstado(reservaId: string, estado: EstadoReserva): Promise<ReservaRegistro> {
    try {
      const fila = await this.prisma.reserva.update({
        where: { id: reservaId },
        data: { estado: estadoReservaAPrisma(estado) },
      });
      return aReservaRegistro(fila);
    } catch (error) {
      relanzarTraducido(error);
    }
  }

  /**
   * RF-015 · RN-09: retorna las mesas activas con `capacidad >= personas` que no tienen
   * ninguna reserva `Confirmada` cuyo `rango` (`tstzrange`) se solape (`&&`) con la franja solicitada.
   */
  async listarMesasDisponibles(filtro: FiltroDisponibilidadDatos): Promise<MesaRegistro[]> {
    const rango = construirTstzRange(filtro.fecha, filtro.horaInicio, filtro.horaFin);
    const filas = await this.prisma.$queryRaw<FilaMesaCruda[]>`
      SELECT
        m."id_mesa" AS "id",
        m."numero_mesa" AS "numeroMesa",
        m."capacidad",
        m."zona",
        m."estado_fisico" AS "estadoFisico",
        m."id_union_mesa" AS "unionMesaId",
        m."activo",
        m."ocupada_desde" AS "ocupadaDesde"
      FROM "Mesa" m
      WHERE m."activo" = true
        AND m."capacidad" >= ${filtro.personas}
        AND NOT EXISTS (
          SELECT 1
          FROM "Reserva" r
          WHERE r."id_mesa" = m."id_mesa"
            AND r."estado" = 'Confirmada'::"EstadoReserva"
            AND r."rango" && tstzrange(
              ${rango.inicio.toISOString()}::timestamptz,
              ${rango.fin.toISOString()}::timestamptz,
              '[)'
            )
        )
      ORDER BY m."numero_mesa" ASC`;
    return filas.map(aMesaRegistro);
  }
}
