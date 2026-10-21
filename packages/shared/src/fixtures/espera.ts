import { EstadoEspera } from '../enums/index.js';
import type { EsperaDto } from '../schemas/index.js';
import { FIXTURE_MESA_IDS } from './mesas.js';

export const FIXTURE_ESPERA_IDS = {
  ESPERA_1_EN_ESPERA: 'e1000000-0000-4000-8000-000000000001',
  ESPERA_2_NOTIFICADO: 'e1000000-0000-4000-8000-000000000002',
  ESPERA_3_SENTADO: 'e1000000-0000-4000-8000-000000000003',
  ESPERA_4_CANCELADO: 'e1000000-0000-4000-8000-000000000004',
} as const;

export const fixtureListaEspera: EsperaDto[] = [
  {
    esperaId: FIXTURE_ESPERA_IDS.ESPERA_1_EN_ESPERA,
    nombreCliente: 'Gabriel Torres',
    telefonoContacto: '+52 999 111 2233',
    cantidadPersonas: 2,
    horaLlegada: '2026-10-11T13:15:00.000Z',
    estado: EstadoEspera.EN_ESPERA,
    idMesaAsignada: null,
  },
  {
    esperaId: FIXTURE_ESPERA_IDS.ESPERA_2_NOTIFICADO,
    nombreCliente: 'Valeria Méndez',
    telefonoContacto: '+52 999 444 5566',
    cantidadPersonas: 4,
    horaLlegada: '2026-10-11T13:20:00.000Z',
    estado: EstadoEspera.NOTIFICADO,
    idMesaAsignada: FIXTURE_MESA_IDS.MESA_4,
  },
  {
    esperaId: FIXTURE_ESPERA_IDS.ESPERA_3_SENTADO,
    nombreCliente: 'David Campos',
    telefonoContacto: '+52 999 777 8899',
    cantidadPersonas: 4,
    horaLlegada: '2026-10-11T12:00:00.000Z',
    estado: EstadoEspera.SENTADO,
    idMesaAsignada: FIXTURE_MESA_IDS.MESA_3,
  },
  {
    esperaId: FIXTURE_ESPERA_IDS.ESPERA_4_CANCELADO,
    nombreCliente: 'Mónica Ruiz',
    telefonoContacto: '+52 999 222 3344',
    cantidadPersonas: 3,
    horaLlegada: '2026-10-11T12:10:00.000Z',
    estado: EstadoEspera.CANCELADO,
    idMesaAsignada: null,
  },
];
