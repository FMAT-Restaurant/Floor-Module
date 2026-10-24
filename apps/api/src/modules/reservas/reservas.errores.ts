import { HttpStatus } from '@nestjs/common';
import type { EstadoReserva } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';

export function reservaNoEncontrada(reservaId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.RESERVA_NO_ENCONTRADA,
    'La reserva no existe',
    { reservaId },
  );
}

export function mesaNoEncontradaParaReserva(mesaId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.MESA_NO_ENCONTRADA,
    'La mesa no existe o está inactiva',
    { mesaId },
  );
}

/** RN-10 · SPEC §7 T2.3: cantidadPersonas debe ser > 0 y <= capacidad de la mesa. */
export function cantidadPersonasInvalida(
  mesaId: string,
  cantidadPersonas: number,
  capacidad: number,
): DomainException {
  if (cantidadPersonas <= 0) {
    return new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La cantidad de personas debe ser mayor a 0',
      { mesaId, cantidadPersonas },
    );
  }
  return new DomainException(
    HttpStatus.BAD_REQUEST,
    CODIGO_ERROR.VALIDACION,
    `La cantidad de personas (${cantidadPersonas}) supera la capacidad de la mesa (${capacidad})`,
    { mesaId, cantidadPersonas, capacidad },
  );
}

/** RN-11 · SPEC §4.2: no se puede reprogramar ni cancelar una reserva ya completada o cancelada. */
export function reservaNoModificable(
  reservaId: string,
  estadoActual: EstadoReserva,
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.TRANSICION_INVALIDA,
    `La reserva se encuentra en estado '${estadoActual}' y no puede modificarse ni cancelarse`,
    { reservaId, estadoActual },
  );
}
