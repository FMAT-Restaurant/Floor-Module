import type { EsperaDto } from '@floor/shared';
import type { EsperaRegistro } from './espera.registro';

export function aEsperaDto(registro: EsperaRegistro): EsperaDto {
  return {
    esperaId: registro.id,
    nombreCliente: registro.nombreCliente,
    telefonoContacto: registro.telefonoContacto,
    cantidadPersonas: registro.cantidadPersonas,
    horaLlegada: registro.horaLlegada.toISOString(),
    estado: registro.estado,
    idMesaAsignada: registro.mesaAsignadaId,
  };
}
