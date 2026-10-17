import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { CODIGO_ERROR } from '../errors/codigos-error';
import { DomainException } from '../errors/domain.exception';

interface IncidenciaValidacion {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

/**
 * Forma mínima de un schema de Zod. Se tipa de forma estructural porque `zod` es dependencia
 * de @floor/shared y no de la API; así no hay que agregar paquetes nuevos.
 */
export interface EsquemaValidable {
  safeParse(valor: unknown): {
    success: boolean;
    data?: unknown;
    error?: { issues: ReadonlyArray<IncidenciaValidacion> };
  };
}

/** Valida body, query o params con los schemas de @floor/shared (única fuente de contratos). */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly esquema: EsquemaValidable) {}

  transform(valor: unknown): unknown {
    const resultado = this.esquema.safeParse(valor);
    if (resultado.success) {
      return resultado.data;
    }
    const errores = (resultado.error?.issues ?? []).map((incidencia) => ({
      campo: incidencia.path.map(String).join('.'),
      mensaje: incidencia.message,
    }));
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      CODIGO_ERROR.VALIDACION,
      'La solicitud contiene datos inválidos',
      { errores },
    );
  }
}
