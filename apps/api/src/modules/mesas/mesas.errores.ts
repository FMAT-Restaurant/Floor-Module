import { HttpStatus } from '@nestjs/common';
import type { EstadoMesa } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import { transicionesManualesDesde } from './domain/transiciones-mesa';

export function mesaNoEncontrada(mesaId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.MESA_NO_ENCONTRADA,
    'La mesa no existe o está inactiva',
    { mesaId },
  );
}

/** RN-15: una mesa vinculada a una unión activa no admite cambios individuales. */
export function mesaEnUnion(mesaId: string): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.MESA_EN_UNION,
    'La mesa pertenece a una unión activa',
    { mesaId },
  );
}

/** RN-07: cualquier transición manual distinta de las permitidas es 409. */
export function transicionInvalida(
  mesaId: string,
  desde: EstadoMesa,
  hacia: EstadoMesa,
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.TRANSICION_INVALIDA,
    `No se puede pasar la mesa de '${desde}' a '${hacia}'`,
    { mesaId, desde, hacia, permitidas: [...transicionesManualesDesde(desde)] },
  );
}

/** RN-01: sólo se puede ocupar una mesa en estado Libre. */
export function mesaNoDisponible(mesaId: string, estadoActual: EstadoMesa): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.MESA_NO_DISPONIBLE,
    'La mesa se encuentra ocupada o en limpieza',
    { mesaId, estadoActual },
  );
}

/** RN-02: si comensales supera la capacidad física sin forzarSobrecupo, lanza 409 SOBRECUPO_DETECTADO. */
export function sobrecupoDetectado(
  mesaId: string,
  comensales: number,
  capacidad: number,
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.SOBRECUPO_DETECTADO,
    `El número de comensales (${comensales}) supera la capacidad física de la mesa (${capacidad})`,
    { mesaId, comensales, capacidad },
  );
}

/** RN-05: si la mesa tiene una reserva en los próximos 30 minutos sin forzarOcupacion, lanza 409 RESERVA_PROXIMA_PRESENTE. */
export function reservaProximaPresente(
  mesaId: string,
  detalles: Record<string, unknown> = {},
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
    'La mesa tiene una reserva confirmada en los próximos 30 minutos',
    { mesaId, ...detalles },
  );
}

/** SPEC §5.2: reservaId y esperaId son mutuamente excluyentes al ocupar una mesa. */
export function camposOcupacionMutuamenteExcluyentes(
  reservaId: string,
  esperaId: string,
): DomainException {
  return new DomainException(
    HttpStatus.BAD_REQUEST,
    CODIGO_ERROR.VALIDACION,
    'Los campos reservaId y esperaId son mutuamente excluyentes',
    { reservaId, esperaId },
  );
}

export function reservaNoEncontradaEnOcupacion(reservaId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.RESERVA_NO_ENCONTRADA,
    'La reserva indicada para ocupar la mesa no existe',
    { reservaId },
  );
}

export function transicionReservaInvalidaEnOcupacion(
  reservaId: string,
  mesaId: string,
  detalles: Record<string, unknown> = {},
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.TRANSICION_INVALIDA,
    'La reserva no pertenece a esta mesa o no se encuentra en estado Confirmada',
    { reservaId, mesaId, ...detalles },
  );
}

export function esperaNoEncontradaEnOcupacion(esperaId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.ESPERA_NO_ENCONTRADA,
    'El registro de lista de espera indicado no existe',
    { esperaId },
  );
}

export function transicionEsperaInvalidaEnOcupacion(
  esperaId: string,
  detalles: Record<string, unknown> = {},
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.TRANSICION_INVALIDA,
    'El registro de lista de espera ya fue sentado o cancelado',
    { esperaId, ...detalles },
  );
}
