import { HttpException } from '@nestjs/common';
import type { ApiErrorResponseDto } from '@floor/shared';

/** Excepción con el formato de error estándar del SPEC §1: { statusCode, code, message, details }. */
export class DomainException extends HttpException {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    const cuerpo: ApiErrorResponseDto = { statusCode, code, message, details };
    super(cuerpo, statusCode);
  }
}
