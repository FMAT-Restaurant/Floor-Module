import { ocuparMesaSchema } from '@floor/shared';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import type { EsquemaValidable } from '../../../common/pipes/zod-validation.pipe';

/**
 * BE-006 · DTO para ocupar una mesa (`POST /api/v1/floor/mesas/:mesaId/ocupar`).
 * Reutiliza `ocuparMesaSchema` de `@floor/shared` (IMP-03), permitiendo omitir `meseroId`
 * en el cuerpo HTTP cuando se toma de la identidad verificada en `request.user` (BE-011).
 */
export class OcuparMesaDto {
  @IsInt({ message: 'El número de comensales debe ser un número entero' })
  @Min(1, { message: 'El número de comensales debe ser mayor o igual a 1' })
  comensales!: number;

  @IsOptional()
  @IsBoolean({ message: 'forzarOcupacion debe ser booleano' })
  forzarOcupacion?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'forzarSobrecupo debe ser booleano' })
  forzarSobrecupo?: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'meseroId debe ser un UUID válido' })
  meseroId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'reservaId debe ser un UUID válido' })
  reservaId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'esperaId debe ser un UUID válido' })
  esperaId?: string;
}

export const ocuparMesaDtoSchema: EsquemaValidable = ocuparMesaSchema
  .partial({ meseroId: true })
  .strict();
