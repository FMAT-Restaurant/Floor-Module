import type { EstadoEspera } from '@floor/shared';

export interface EsperaRegistro {
  id: string;
  nombreCliente: string;
  telefonoContacto: string;
  cantidadPersonas: number;
  horaLlegada: Date;
  estado: EstadoEspera;
  mesaAsignadaId: string | null;
}
