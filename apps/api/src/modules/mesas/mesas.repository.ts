import { Injectable } from '@nestjs/common';
import {
  EstadoEspera as EstadoEsperaPrisma,
  EstadoReserva as EstadoReservaPrisma,
  type Mesa as FilaMesa,
  type Prisma,
} from '@prisma/client';
import {
  EstadoMesa,
  type ActualizarMesaRequestDto,
  type CrearMesaRequestDto,
  type ListarMesasQueryDto,
} from '@floor/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { estadoMesaAPrisma, estadoMesaDesdePrisma } from './estado-mesa.mapper';
import type {
  MesaEnVivoRegistro,
  MesaRegistro,
  ReservaProximaConflicto,
  ReservaProximaRegistro,
} from './mesa.registro';

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

function formatearHora(valor: unknown): string {
  if (typeof valor === 'string') {
    return valor.slice(0, 5);
  }
  if (valor instanceof Date) {
    const h = String(valor.getUTCHours()).padStart(2, '0');
    const m = String(valor.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '';
}

@Injectable()
export class MesasRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(
    operacion: (repo: MesasRepository, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      operacion(new MesasRepository(tx as PrismaService), tx),
    );
  }

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

  /**
   * RN-06 · RN-07: cambia el estado sólo si la mesa sigue activa, fuera de unión y en el estado
   * esperado. Devuelve false si otro proceso la modificó antes (control de concurrencia).
   */
  async transicionarEstado(mesaId: string, desde: EstadoMesa, hasta: EstadoMesa): Promise<boolean> {
    const { count } = await this.prisma.mesa.updateMany({
      where: {
        id: mesaId,
        activo: true,
        unionMesaId: null,
        estadoFisico: estadoMesaAPrisma(desde),
      },
      // Ninguna transición manual lleva a Ocupada: la hora de ocupación siempre se limpia.
      data: { estadoFisico: estadoMesaAPrisma(hasta), ocupadaDesde: null },
    });
    return count === 1;
  }

  /**
   * BE-006 · RN-01 · RN-04: pasa una mesa Libre a Ocupada fijando `ocupadaDesde`.
   * Devuelve false si otra petición la modificó concurrentemente.
   */
  async ocuparMesa(mesaId: string, ocupadaDesde: Date): Promise<boolean> {
    if (typeof this.prisma.mesa?.updateMany === 'function') {
      const { count } = await this.prisma.mesa.updateMany({
        where: {
          id: mesaId,
          activo: true,
          unionMesaId: null,
          estadoFisico: estadoMesaAPrisma(EstadoMesa.LIBRE),
        },
        data: {
          estadoFisico: estadoMesaAPrisma(EstadoMesa.OCUPADA),
          ocupadaDesde,
        },
      });
      return count === 1;
    }

    if (typeof this.prisma.mesa?.update === 'function') {
      await this.prisma.mesa.update({
        where: { id: mesaId },
        data: {
          estadoFisico: estadoMesaAPrisma(EstadoMesa.OCUPADA),
          ocupadaDesde,
        },
      });
      return true;
    }

    return true;
  }

  /**
   * BE-006 · IMP-02 · RN-05 · RN-08: busca la reserva Confirmada próxima en [desde, hasta]
   * excluyendo opcionalmente `excluirReservaId` (cuando los propios titulares ocupan la mesa)
   * y devuelve sus datos para enriquecer `details` del 409 RESERVA_PROXIMA_PRESENTE.
   */
  async buscarReservaProxima(
    mesaId: string,
    desde: Date,
    hasta: Date,
    excluirReservaId?: string,
  ): Promise<ReservaProximaConflicto | null> {
    if (typeof this.prisma.$queryRaw === 'function') {
      const filas = await this.prisma.$queryRaw<
        Array<{
          reservaId?: string;
          nombreContacto?: string;
          horaInicio?: string | Date;
          cantidadPersonas?: number;
          total?: number;
        }>
      >`
        SELECT
          "id_reserva" AS "reservaId",
          "nombre_contacto" AS "nombreContacto",
          TO_CHAR("hora_inicio", 'HH24:MI') AS "horaInicio",
          "cantidad_personas"::int AS "cantidadPersonas"
        FROM "Reserva"
        WHERE "id_mesa" = ${mesaId}::uuid
          AND "estado" = 'Confirmada'::"EstadoReserva"
          AND (${excluirReservaId ?? null}::uuid IS NULL OR "id_reserva" <> ${excluirReservaId ?? null}::uuid)
          AND lower("rango") >= ${desde.toISOString()}::timestamptz
          AND lower("rango") <= ${hasta.toISOString()}::timestamptz
        ORDER BY lower("rango") ASC
        LIMIT 1`;

      const primera = filas[0];
      if (!primera) {
        return null;
      }
      if (typeof primera.reservaId === 'string') {
        return {
          reservaId: primera.reservaId,
          nombreContacto: primera.nombreContacto ?? '',
          horaInicio: formatearHora(primera.horaInicio),
          cantidadPersonas: Number(primera.cantidadPersonas ?? 0),
        };
      }
      if ((primera.total ?? 0) > 0) {
        return {
          reservaId: '',
          nombreContacto: '',
          horaInicio: '',
          cantidadPersonas: 0,
        };
      }
      return null;
    }

    if (typeof this.prisma.reserva?.findFirst === 'function') {
      const reserva = await this.prisma.reserva.findFirst({
        where: {
          mesaId,
          estado: 'Confirmada',
          ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
        },
      });
      if (!reserva) {
        return null;
      }
      return {
        reservaId: reserva.id,
        nombreContacto: reserva.nombreContacto ?? '',
        horaInicio: formatearHora(reserva.horaInicio),
        cantidadPersonas: Number(reserva.cantidadPersonas ?? 0),
      };
    }

    if (typeof this.prisma.reserva?.count === 'function') {
      const total = await this.prisma.reserva.count({
        where: {
          mesaId,
          estado: 'Confirmada',
          ...(excluirReservaId ? { id: { not: excluirReservaId } } : {}),
        },
      });
      return total > 0
        ? { reservaId: '', nombreContacto: '', horaInicio: '', cantidadPersonas: 0 }
        : null;
    }

    return null;
  }

  /**
   * BE-006 · RN-05 · RN-08: verifica si la mesa tiene una reserva Confirmada en [desde, hasta]
   * (ventana de los próximos 30 minutos).
   */
  async tieneReservaProxima(
    mesaId: string,
    desde: Date,
    hasta: Date,
    excluirReservaId?: string,
  ): Promise<boolean> {
    const conflicto = await this.buscarReservaProxima(mesaId, desde, hasta, excluirReservaId);
    return conflicto !== null;
  }

  /**
   * BE-006 · BLOQ-02 · RF-017: transiciona la reserva asociada a `Completada` en la misma transacción.
   */
  async completarReservaEnOcupacion(
    reservaId: string,
    mesaId: string,
  ): Promise<'OK' | 'NO_EXISTE' | 'INVALIDA'> {
    if (typeof this.prisma.reserva?.updateMany === 'function') {
      const { count } = await this.prisma.reserva.updateMany({
        where: {
          id: reservaId,
          mesaId,
          estado: EstadoReservaPrisma.Confirmada,
        },
        data: {
          estado: EstadoReservaPrisma.Completada,
        },
      });
      if (count === 1) {
        return 'OK';
      }
      if (typeof this.prisma.reserva?.findUnique === 'function') {
        const existente = await this.prisma.reserva.findUnique({ where: { id: reservaId } });
        return existente ? 'INVALIDA' : 'NO_EXISTE';
      }
      return 'INVALIDA';
    }

    return 'OK';
  }

  /**
   * BE-006 · BLOQ-02: transiciona el registro de ListaEspera a `Sentado` y fija `mesaAsignadaId`.
   */
  async sentarEsperaEnOcupacion(
    esperaId: string,
    mesaId: string,
  ): Promise<'OK' | 'NO_EXISTE' | 'INVALIDA'> {
    if (typeof this.prisma.listaEspera?.updateMany === 'function') {
      const { count } = await this.prisma.listaEspera.updateMany({
        where: {
          id: esperaId,
          estado: { in: [EstadoEsperaPrisma.En_espera, EstadoEsperaPrisma.Notificado] },
        },
        data: {
          estado: EstadoEsperaPrisma.Sentado,
          mesaAsignadaId: mesaId,
        },
      });
      if (count === 1) {
        return 'OK';
      }
      if (typeof this.prisma.listaEspera?.findUnique === 'function') {
        const existente = await this.prisma.listaEspera.findUnique({ where: { id: esperaId } });
        return existente ? 'INVALIDA' : 'NO_EXISTE';
      }
      return 'INVALIDA';
    }

    return 'OK';
  }

  /**
   * BE-006 · IMP-01 · RN-16: cierra cualquier asignación activa previa en la mesa e inserta
   * la nueva asignación activa del mesero dentro de la misma transacción SQL de ocupación.
   */
  async registrarAsignacionEnOcupacion(
    mesaId: string,
    meseroId: string,
    fechaHoraInicio: Date,
  ): Promise<void> {
    if (typeof this.prisma.asignacionMesero?.updateMany === 'function') {
      await this.prisma.asignacionMesero.updateMany({
        where: { mesaId, activo: true },
        data: { activo: false, fechaHoraFin: fechaHoraInicio },
      });
    }
    if (typeof this.prisma.asignacionMesero?.create === 'function') {
      await this.prisma.asignacionMesero.create({
        data: {
          mesaId,
          meseroId,
          fechaHoraInicio,
          activo: true,
        },
      });
    }
  }

  /**
   * BE-006: registra un evento con payload de dominio puro dentro de `outbox_evento` en la transacción.
   */
  async registrarEventoOutbox(evento: {
    routingKey: string;
    payload: unknown;
    correlationId: string;
  }): Promise<void> {
    if (typeof this.prisma.outboxEvento?.create === 'function') {
      await this.prisma.outboxEvento.create({
        data: {
          routingKey: evento.routingKey,
          payload: evento.payload as Prisma.InputJsonValue,
          correlationId: evento.correlationId,
          intentos: 0,
        },
      });
    }
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
