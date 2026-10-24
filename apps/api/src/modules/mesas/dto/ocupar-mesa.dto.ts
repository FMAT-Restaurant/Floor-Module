import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import type { EsquemaValidable } from '../../../common/pipes/zod-validation.pipe';

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAMPOS_PERMITIDOS = new Set([
  'comensales',
  'forzarOcupacion',
  'forzarSobrecupo',
  'meseroId',
  'reservaId',
  'esperaId',
]);

/**
 * BE-006 · DTO para ocupar una mesa (`POST /api/v1/floor/mesas/:mesaId/ocupar`).
 * - `comensales`: number (obligatorio, entero >= 1)
 * - `forzarOcupacion`: boolean (opcional)
 * - `forzarSobrecupo`: boolean (opcional)
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

export const ocuparMesaDtoSchema: EsquemaValidable = {
  safeParse(valor: unknown) {
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: 'El cuerpo debe ser un objeto JSON válido' }] },
      };
    }

    const registro = valor as Record<string, unknown>;
    const issues: Array<{ path: ReadonlyArray<PropertyKey>; message: string }> = [];

    for (const clave of Object.keys(registro)) {
      if (!CAMPOS_PERMITIDOS.has(clave)) {
        issues.push({ path: [clave], message: `Propiedad no reconocida: '${clave}'` });
      }
    }

    if (
      typeof registro.comensales !== 'number' ||
      !Number.isInteger(registro.comensales) ||
      registro.comensales < 1
    ) {
      issues.push({
        path: ['comensales'],
        message: 'comensales es obligatorio y debe ser un entero mayor o igual a 1',
      });
    }

    if (registro.forzarOcupacion !== undefined && typeof registro.forzarOcupacion !== 'boolean') {
      issues.push({
        path: ['forzarOcupacion'],
        message: 'forzarOcupacion debe ser un valor booleano',
      });
    }

    if (registro.forzarSobrecupo !== undefined && typeof registro.forzarSobrecupo !== 'boolean') {
      issues.push({
        path: ['forzarSobrecupo'],
        message: 'forzarSobrecupo debe ser un valor booleano',
      });
    }

    for (const campoUuid of ['meseroId', 'reservaId', 'esperaId'] as const) {
      const val = registro[campoUuid];
      if (val !== undefined && (typeof val !== 'string' || !PATRON_UUID.test(val))) {
        issues.push({
          path: [campoUuid],
          message: `${campoUuid} debe ser un identificador UUID válido`,
        });
      }
    }

    if (issues.length > 0) {
      return { success: false, error: { issues } };
    }

    const data: OcuparMesaDto = {
      comensales: registro.comensales as number,
      ...(registro.forzarOcupacion !== undefined
        ? { forzarOcupacion: registro.forzarOcupacion as boolean }
        : {}),
      ...(registro.forzarSobrecupo !== undefined
        ? { forzarSobrecupo: registro.forzarSobrecupo as boolean }
        : {}),
      ...(registro.meseroId !== undefined ? { meseroId: registro.meseroId as string } : {}),
      ...(registro.reservaId !== undefined ? { reservaId: registro.reservaId as string } : {}),
      ...(registro.esperaId !== undefined ? { esperaId: registro.esperaId as string } : {}),
    };

    return { success: true, data };
  },
};
