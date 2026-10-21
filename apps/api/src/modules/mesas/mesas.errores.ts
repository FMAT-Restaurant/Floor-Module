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
