import { HttpStatus, Injectable } from '@nestjs/common';
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
import { aMesaDto } from '../mesas/mesa.dto.mapper';
import {
  calcularDuracionMinutos,
  calcularHoraFin,
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
  estado?: EstadoReserva;
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
  constructor(private readonly repositorio: ReservasRepository) {}

  /**
   * RF-012 · RN-09 · RN-10 · RNF-003: registra una nueva reserva en estado `Confirmada`.
   * Valida que `cantidadPersonas` sea > 0 y <= capacidad de la mesa activa seleccionada.
   * La base de datos genera el `tstzrange` y aplica la restricción `EXCLUDE` (`reserva_no_solapada_excl`),
   * traduciendo cualquier solapamiento temporal a 409 `RESERVA_SOLAPADA`.
   */
  async crear(datos: CrearReservaRequestDto): Promise<CrearReservaResponseDto> {
    if (!Number.isInteger(datos.cantidadPersonas) || datos.cantidadPersonas <= 0) {
      throw cantidadPersonasInvalida(datos.mesaId, datos.cantidadPersonas, 0);
    }
    validarFecha(datos.fecha);
    const horaFin = calcularHoraFin(datos.horaInicio, datos.duracion);

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
   * Valida que la reserva no esté ya completada o cancelada antes de modificar su estado o su franja horaria.
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

        const tieneCambiosHorarioOMesa =
          datos.mesaId !== undefined ||
          datos.fecha !== undefined ||
          datos.horaInicio !== undefined ||
          datos.hora !== undefined ||
          datos.duracion !== undefined ||
          datos.cantidadPersonas !== undefined;

        if (datos.estado && !tieneCambiosHorarioOMesa) {
          const actualizadaEstado = await repo.actualizarEstado(reserva.id, datos.estado);
          return aReservaDto(actualizadaEstado);
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

        const actualizada = await repo.actualizar(reserva.id, {
          mesaId: mesa.id,
          cantidadPersonas,
          fecha,
          horaInicio,
          horaFin,
          estado: datos.estado,
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
}
