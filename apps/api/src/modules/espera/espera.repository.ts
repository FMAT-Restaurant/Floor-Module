import { Injectable } from '@nestjs/common';
import {
  EstadoEspera as EstadoEsperaPrisma,
  type ListaEspera as FilaEspera,
  type Prisma,
} from '@prisma/client';
import { EstadoEspera, type CrearEsperaRequestDto } from '@floor/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { EsperaRegistro } from './espera.registro';
import { estadoEsperaAPrisma, estadoEsperaDesdePrisma } from './estado-espera.mapper';

interface FilaEsperaRaw {
  id: string;
  nombreCliente: string;
  telefonoContacto: string;
  cantidadPersonas: number;
  horaLlegada: Date | string;
  estado: string;
  mesaAsignadaId: string | null;
}

function aRegistro(fila: FilaEspera | FilaEsperaRaw): EsperaRegistro {
  return {
    id: fila.id,
    nombreCliente: fila.nombreCliente,
    telefonoContacto: fila.telefonoContacto,
    cantidadPersonas: Number(fila.cantidadPersonas),
    horaLlegada:
      fila.horaLlegada instanceof Date ? fila.horaLlegada : new Date(String(fila.horaLlegada)),
    estado: estadoEsperaDesdePrisma(fila.estado),
    mesaAsignadaId: fila.mesaAsignadaId,
  };
}

@Injectable()
export class EsperaRepository {
  constructor(private readonly prisma: PrismaService) {}

  enTransaccion<T>(
    operacion: (repo: EsperaRepository, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      operacion(new EsperaRepository(tx as PrismaService), tx),
    );
  }

  /** RF-021 · SPEC §5.6: crea la entrada en estado `En espera` con `horaLlegada`. */
  async crear(datos: CrearEsperaRequestDto, horaLlegada: Date): Promise<EsperaRegistro> {
    const fila = await this.prisma.listaEspera.create({
      data: {
        nombreCliente: datos.nombreCliente,
        telefonoContacto: datos.telefonoContacto,
        cantidadPersonas: datos.cantidadPersonas,
        horaLlegada,
        estado: EstadoEsperaPrisma.En_espera,
        mesaAsignadaId: null,
      },
    });
    return aRegistro(fila);
  }

  /** SPEC §5.6: lista entradas filtradas por estado y ordenadas por `horaLlegada` ASC. */
  async listar(estados: readonly EstadoEspera[]): Promise<EsperaRegistro[]> {
    const filas = await this.prisma.listaEspera.findMany({
      where: {
        estado: { in: estados.map(estadoEsperaAPrisma) },
      },
      orderBy: [{ horaLlegada: 'asc' }, { id: 'asc' }],
    });
    return filas.map(aRegistro);
  }

  async buscarPorId(esperaId: string): Promise<EsperaRegistro | null> {
    const fila = await this.prisma.listaEspera.findUnique({ where: { id: esperaId } });
    return fila ? aRegistro(fila) : null;
  }

  /**
   * RF-022 · SPEC §5.6: actualiza el estado sólo si la entrada continúa en `desde`
   * (control optimista ante concurrencia).
   */
  async transicionarEstado(
    esperaId: string,
    desde: EstadoEspera,
    hacia: EstadoEspera,
    mesaAsignadaId: string | null,
  ): Promise<EsperaRegistro | null> {
    const { count } = await this.prisma.listaEspera.updateMany({
      where: {
        id: esperaId,
        estado: estadoEsperaAPrisma(desde),
      },
      data: {
        estado: estadoEsperaAPrisma(hacia),
        mesaAsignadaId,
      },
    });
    if (count !== 1) {
      return null;
    }
    return this.buscarPorId(esperaId);
  }

  /**
   * RN-17 · F4: obtiene y bloquea (`FOR UPDATE SKIP LOCKED`) las entradas `En espera`
   * compatibles con la capacidad liberada, ordenadas en FIFO (`horaLlegada` ASC).
   */
  async bloquearCandidatosEnEspera(capacidad: number): Promise<EsperaRegistro[]> {
    if (typeof this.prisma.$queryRaw === 'function') {
      const filas = await this.prisma.$queryRaw<FilaEsperaRaw[]>`
        SELECT
          "id_espera" AS "id",
          "nombre_cliente" AS "nombreCliente",
          "telefono_contacto" AS "telefonoContacto",
          "cantidad_personas"::int AS "cantidadPersonas",
          "hora_llegada" AS "horaLlegada",
          "estado"::text AS "estado",
          "id_mesa_asignada" AS "mesaAsignadaId"
        FROM "ListaEspera"
        WHERE "estado" = 'En espera'::"EstadoEspera"
          AND "cantidad_personas" <= ${capacidad}
        ORDER BY "hora_llegada" ASC, "id_espera" ASC
        FOR UPDATE SKIP LOCKED`;
      return filas.map(aRegistro);
    }

    const filas = await this.prisma.listaEspera.findMany({
      where: {
        estado: EstadoEsperaPrisma.En_espera,
        cantidadPersonas: { lte: capacidad },
      },
      orderBy: [{ horaLlegada: 'asc' }, { id: 'asc' }],
    });
    return filas.map(aRegistro);
  }

  /**
   * RN-17 · F4: marca la entrada elegida como `Notificado` y fija `mesaAsignadaId`.
   */
  async marcarNotificado(esperaId: string, mesaId: string): Promise<EsperaRegistro | null> {
    return this.transicionarEstado(
      esperaId,
      EstadoEspera.EN_ESPERA,
      EstadoEspera.NOTIFICADO,
      mesaId,
    );
  }
}
