import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  EstadoReserva,
  type ActualizarReservaRequestDto,
  type ConsultarDisponibilidadQueryDto,
  type CrearReservaRequestDto,
  type CrearReservaResponseDto,
  type ListarReservasQueryDto,
  type MesaDto,
  type ReservaDto,
} from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import { traducirErrorPrisma } from '../../common/errors/prisma-error.translator';
import { Reloj } from '../../common/reloj/reloj';
import { aMesaDto } from '../mesas/mesa.dto.mapper';
import {
  calcularDuracionMinutos,
  calcularHoraFin,
  construirTstzRange,
  esEstadoModificable,
  validarFecha,
} from './domain/rango-reserva';
import { aCrearReservaResponseDto, aReservaDto } from './reserva.dto.mapper';
import {
  cantidadPersonasInvalida,
  mesaNoEncontradaParaReserva,
  reservaNoEncontrada,
  reservaNoModificable,
} from './reservas.errores';
import { ReservasRepository } from './reservas.repository';
import { OutboxService } from '../../events/outbox.service';

export type ConsultarDisponibilidadEntrada = Partial<ConsultarDisponibilidadQueryDto> & {
  fecha: string;
  duracion?: number;
  horaInicio?: string;
  hora?: string;
  personas?: number;
  aforo?: number;
};

export type ActualizarReservaEntrada = Partial<ActualizarReservaRequestDto> & {
  hora?: string;
};

function traducirORelanzar(error: unknown): never {
  if (error instanceof DomainException) {
    throw error;
  }
  const traducido = traducirErrorPrisma(error);
  if (traducido) {
    throw traducido;
  }
  throw error;
}

@Injectable()
export class ReservasService {
  constructor(
    private readonly repositorio: ReservasRepository,
    private readonly outboxService: OutboxService, // <-- Inyectar OutboxService
    @Optional() private readonly reloj: Reloj = new Reloj(),
  ) {}

  /**
   * RF-012 · RN-09 · RN-10 · RNF-003: registra una nueva reserva en estado `Confirmada`.
   * Valida que `cantidadPersonas` sea > 0 y <= capacidad de la mesa activa seleccionada,
   * y que el inicio de la reserva sea en el futuro (`RN-10`).
   * La base de datos genera el `tstzrange` y aplica la restricción `EXCLUDE` (`reserva_no_solapada_excl`),
   * traduciendo cualquier solapamiento temporal a 409 `RESERVA_SOLAPADA`.
   */
  async crear(datos: CrearReservaRequestDto): Promise<CrearReservaResponseDto> {
    if (!Number.isInteger(datos.cantidadPersonas) || datos.cantidadPersonas <= 0) {
      throw cantidadPersonasInvalida(datos.mesaId, datos.cantidadPersonas, 0);
    }
    validarFecha(datos.fecha);
    const horaFin = calcularHoraFin(datos.horaInicio, datos.duracion);
    const rango = construirTstzRange(datos.fecha, datos.horaInicio, horaFin);

    if (rango.inicio.getTime() <= this.reloj.ahora().getTime()) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        CODIGO_ERROR.VALIDACION,
        'La reserva debe iniciar en el futuro',
        { fecha: datos.fecha, horaInicio: datos.horaInicio },
      );
    }

    const mesa = await this.repositorio.buscarMesaActiva(datos.mesaId);
    if (!mesa) {
      throw mesaNoEncontradaParaReserva(datos.mesaId);
    }

    if (datos.cantidadPersonas > mesa.capacidad) {
      throw cantidadPersonasInvalida(mesa.id, datos.cantidadPersonas, mesa.capacidad);
    }

    try {
      const creada = await this.repositorio.crear({
        mesaId: mesa.id,
        nombreContacto: datos.cliente.nombre,
        telefonoContacto: datos.cliente.tel,
        cantidadPersonas: datos.cantidadPersonas,
        fecha: datos.fecha,
        horaInicio: datos.horaInicio,
        horaFin,
      });
      return aCrearReservaResponseDto(creada);
    } catch (error) {
      traducirORelanzar(error);
    }
  }

  /** SPEC §5.4: lista reservas con filtros opcionales por fecha, mesaId y estado. */
  async listar(filtro: ListarReservasQueryDto = {}): Promise<ReservaDto[]> {
    const reservas = await this.repositorio.listar(filtro);
    return reservas.map(aReservaDto);
  }

  async obtener(reservaId: string): Promise<ReservaDto> {
    const reserva = await this.repositorio.buscarPorId(reservaId);
    if (!reserva) {
      throw reservaNoEncontrada(reservaId);
    }
    return aReservaDto(reserva);
  }

  /**
   * RF-015 · SPEC §5.4: consulta mesas activas libres para la fecha, hora, duración y aforo
   * (`capacidad >= aforo` y sin reservas `Confirmada` solapadas en esa franja `tstzrange`).
   */
  async consultarDisponibilidad(query: ConsultarDisponibilidadEntrada): Promise<MesaDto[]> {
    const horaInicio = query.horaInicio ?? query.hora;
    const personas = query.personas ?? query.aforo;

    if (!horaInicio) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        CODIGO_ERROR.VALIDACION,
        'La hora de inicio es obligatoria',
        { errores: [{ campo: 'horaInicio', mensaje: 'La hora de inicio es obligatoria' }] },
      );
    }
    if (personas === undefined || !Number.isInteger(personas) || personas <= 0) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        CODIGO_ERROR.VALIDACION,
        'El aforo solicitado debe ser mayor a 0',
        { errores: [{ campo: 'personas', mensaje: 'Debe ser mayor o igual a 1' }] },
      );
    }

    validarFecha(query.fecha);
    const horaFin = calcularHoraFin(horaInicio, query.duracion ?? 0);

    const mesas = await this.repositorio.listarMesasDisponibles({
      fecha: query.fecha,
      horaInicio,
      horaFin,
      personas,
    });
    return mesas.map(aMesaDto);
  }

  /**
   * RF-013 · RF-014 · RN-09 · RN-10 · RN-11: reprograma o modifica una reserva existente.
   * Valida que la reserva esté en estado `Confirmada` y que cuando se reprograme fecha u hora,
   * el nuevo inicio sea en el futuro (`RN-10`).
   */
  async actualizar(reservaId: string, datos: ActualizarReservaEntrada): Promise<ReservaDto> {
    try {
      return await this.repositorio.enTransaccion(async (repo) => {
        const reserva = await repo.buscarPorId(reservaId);
        if (!reserva) {
          throw reservaNoEncontrada(reservaId);
        }

        if (!esEstadoModificable(reserva.estado)) {
          throw reservaNoModificable(reserva.id, reserva.estado);
        }

        const mesaDestinoId = datos.mesaId ?? reserva.mesaId;
        const cantidadPersonas = datos.cantidadPersonas ?? reserva.cantidadPersonas;
        if (!Number.isInteger(cantidadPersonas) || cantidadPersonas <= 0) {
          throw cantidadPersonasInvalida(mesaDestinoId, cantidadPersonas, 0);
        }

        const mesa = await repo.buscarMesaActiva(mesaDestinoId);
        if (!mesa) {
          throw mesaNoEncontradaParaReserva(mesaDestinoId);
        }
        if (cantidadPersonas > mesa.capacidad) {
          throw cantidadPersonasInvalida(mesa.id, cantidadPersonas, mesa.capacidad);
        }

        const fecha = datos.fecha ?? reserva.fecha;
        validarFecha(fecha);

        const horaInicio = datos.horaInicio ?? datos.hora ?? reserva.horaInicio;
        const duracion =
          datos.duracion ?? calcularDuracionMinutos(reserva.horaInicio, reserva.horaFin);
        const horaFin = calcularHoraFin(horaInicio, duracion);
        const rango = construirTstzRange(fecha, horaInicio, horaFin);

        const reprogramaFechaOHora =
          datos.fecha !== undefined || datos.horaInicio !== undefined || datos.hora !== undefined;
        if (reprogramaFechaOHora && rango.inicio.getTime() <= this.reloj.ahora().getTime()) {
          throw new DomainException(
            HttpStatus.BAD_REQUEST,
            CODIGO_ERROR.VALIDACION,
            'La reserva debe iniciar en el futuro',
            { fecha, horaInicio },
          );
        }

        const actualizada = await repo.actualizar(reserva.id, {
          mesaId: mesa.id,
          cantidadPersonas,
          fecha,
          horaInicio,
          horaFin,
        });

        return aReservaDto(actualizada);
      });
    } catch (error) {
      traducirORelanzar(error);
    }
  }

  /**
   * RF-014 · RN-11: cancela una reserva activa.
   * Valida que la reserva no esté ya completada o cancelada antes de transicionar a `Cancelada`.
   */
  async cancelar(reservaId: string): Promise<ReservaDto> {
    try {
      return await this.repositorio.enTransaccion(async (repo) => {
        const reserva = await repo.buscarPorId(reservaId);
        if (!reserva) {
          throw reservaNoEncontrada(reservaId);
        }

        if (!esEstadoModificable(reserva.estado)) {
          throw reservaNoModificable(reserva.id, reserva.estado);
        }

        const cancelada = await repo.actualizarEstado(reserva.id, EstadoReserva.CANCELADA);
        return aReservaDto(cancelada);
      });
    } catch (error) {
      traducirORelanzar(error);
    }
  }

    /**
 * RF-016 · RN-20: procesa las reservas próximas dentro de la ventana de anticipación de 30 minutos.
 * Publica el evento `sala.reserva.proxima_alerta` mediante outbox y marca la alerta como emitida
 * dentro de una transacción para evitar duplicados por reserva.
 */
  async procesarAlertasProximas(): Promise<void> {
    const ahora = this.reloj.ahora();
    const en30Minutos = new Date(ahora.getTime() + 30 * 60000);
    const fechaHoy = ahora.toISOString().slice(0, 10); 

    const reservasDelDia = await this.repositorio.listarParaAlertas(fechaHoy);

    const reservasProximas = reservasDelDia.filter((reserva) => {
      // Reconstruye el objeto Date usando la convención UTC de tu repositorio
      const fechaHoraReserva = new Date(`${reserva.fecha}T${reserva.horaInicio}:00.000Z`);
      return fechaHoraReserva >= ahora && fechaHoraReserva <= en30Minutos;
    });

    for (const reserva of reservasProximas) {
      try {
        // Pasamos (repo, tx) capturando la transacción generada
        await this.repositorio.enTransaccion(async (repo, tx) => {
          await repo.marcarAlertaEmitida(reserva.id);
          
          await this.outboxService.enqueueEvent(tx, {
            routingKey: 'sala.reserva.proxima_alerta' as any,
            payload: { reservaId: reserva.id, fecha: reserva.fecha, horaInicio: reserva.horaInicio },
          });
        });
      } catch (error) {
        console.error(`Error al procesar alerta para reserva ${reserva.id}:`, error);
      }
    }
  }

  /**
   * RF-017b · RN-11: marca una reserva como `No-show`.
   * Valida que la reserva exista y que su estado permita la transición antes de actualizarla.
   */
  async marcarComoNoShow(reservaId: string): Promise<ReservaDto> {
    try {
      return await this.repositorio.enTransaccion(async (repo) => {
        const reserva = await repo.buscarPorId(reservaId);
        if (!reserva) {
          throw reservaNoEncontrada(reservaId);
        }
        if (!esEstadoModificable(reserva.estado)) {
          throw reservaNoModificable(reserva.id, reserva.estado);
        }
        
        const noShow = await repo.actualizarEstado(reserva.id, EstadoReserva.NO_SHOW);
        return aReservaDto(noShow);
      });
    } catch (error) {
      traducirORelanzar(error);
    }
  }
}
