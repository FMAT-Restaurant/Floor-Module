import { HttpStatus } from '@nestjs/common';
import type { EstadoMesa } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import type { ReservaProximaEnUnion } from './union.registro';

/** SPEC §8: una unión requiere ≥ 2 mesas distintas. */
export function unionInvalida(
  mensaje: string,
  detalles: Record<string, unknown> = {},
): DomainException {
  return new DomainException(
    HttpStatus.BAD_REQUEST,
    CODIGO_ERROR.UNION_INVALIDA,
    mensaje,
    detalles,
  );
}

export function mesasNoEncontradasEnUnion(mesasIds: string[]): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.MESA_NO_ENCONTRADA,
    'Una o más mesas no existen o están inactivas',
    { mesasIds },
  );
}

/** RN-12 · ADR-009: todas las mesas deben pertenecer a la misma zona. */
export function zonaIncompatible(zonas: Record<string, string>): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.ZONA_INCOMPATIBLE,
    'Las mesas a unir pertenecen a zonas distintas',
    { zonas },
  );
}

/** RN-12: todas las mesas deben estar Libres y sin unión previa. */
export function mesasNoDisponiblesParaUnion(
  mesas: Array<{ mesaId: string; estadoFisico: EstadoMesa; unionId: string | null }>,
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.MESA_NO_DISPONIBLE,
    'Una o más mesas están ocupadas, en limpieza o pertenecen a otra unión',
    { mesas },
  );
}

/** RN-02 aplicado a uniones: totalPersonas supera la suma de capacidades. */
export function sobrecupoEnUnion(totalPersonas: number, capacidadTotal: number): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.SOBRECUPO_DETECTADO,
    `El número de personas (${totalPersonas}) supera la capacidad conjunta de las mesas (${capacidadTotal})`,
    { totalPersonas, capacidadTotal },
  );
}

/** RN-05 aplicado a uniones: alguna mesa tiene una reserva próxima. */
export function reservaProximaEnUnion(
  reserva: ReservaProximaEnUnion,
  ventanaMinutos: number,
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.RESERVA_PROXIMA_PRESENTE,
    `Una de las mesas tiene una reserva confirmada en los próximos ${ventanaMinutos} minutos`,
    { ...reserva },
  );
}

export function unionNoEncontrada(unionId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.UNION_NO_ENCONTRADA,
    'La unión no existe',
    { unionId },
  );
}

/** Estado §4.4: sólo una unión Activa puede disolverse. */
export function unionYaDisuelta(unionId: string): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.TRANSICION_INVALIDA,
    'La unión ya fue disuelta',
    { unionId },
  );
}
