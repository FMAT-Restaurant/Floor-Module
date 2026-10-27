import { HttpStatus } from '@nestjs/common';
import type { EstadoEspera } from '@floor/shared';
import { CODIGO_ERROR } from '../../common/errors/codigos-error';
import { DomainException } from '../../common/errors/domain.exception';
import { transicionesManualesEsperaDesde } from './domain/cola-espera';

export function esperaNoEncontrada(esperaId: string): DomainException {
  return new DomainException(
    HttpStatus.NOT_FOUND,
    CODIGO_ERROR.ESPERA_NO_ENCONTRADA,
    'El registro de lista de espera no existe',
    { esperaId },
  );
}

/** RF-022 · SPEC §4.3 · §5.6: transición manual no permitida desde el estado actual. */
export function transicionEsperaInvalida(
  esperaId: string,
  desde: EstadoEspera,
  hacia: EstadoEspera,
): DomainException {
  return new DomainException(
    HttpStatus.CONFLICT,
    CODIGO_ERROR.TRANSICION_INVALIDA,
    `No se puede pasar la entrada de espera de '${desde}' a '${hacia}'`,
    {
      esperaId,
      desde,
      hacia,
      permitidas: [...transicionesManualesEsperaDesde(desde)],
    },
  );
}
