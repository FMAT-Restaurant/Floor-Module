import type { AsignacionDto } from '../schemas/index.js';

export const FIXTURE_MESERO_IDS = {
  CARLOS: 'd1000000-0000-4000-8000-000000000001',
  ANA: 'd1000000-0000-4000-8000-000000000002',
  ROBERTO: 'd1000000-0000-4000-8000-000000000003',
} as const;

export interface MeseroCatalogoItem {
  meseroId: string;
  nombre: string;
  activo: boolean;
}

export const fixtureMeserosCatalogo: MeseroCatalogoItem[] = [
  {
    meseroId: FIXTURE_MESERO_IDS.CARLOS,
    nombre: 'Carlos Gómez',
    activo: true,
  },
  {
    meseroId: FIXTURE_MESERO_IDS.ANA,
    nombre: 'Ana Martínez',
    activo: true,
  },
  {
    meseroId: FIXTURE_MESERO_IDS.ROBERTO,
    nombre: 'Roberto Sánchez',
    activo: true,
  },
];

export const FIXTURE_ASIGNACION_IDS = {
  ASIGNACION_1: 'f1000000-0000-4000-8000-000000000001',
  ASIGNACION_2: 'f1000000-0000-4000-8000-000000000002',
  ASIGNACION_3: 'f1000000-0000-4000-8000-000000000003',
  ASIGNACION_4: 'f1000000-0000-4000-8000-000000000004',
} as const;

export const fixtureAsignaciones: AsignacionDto[] = [
  {
    asignacionId: FIXTURE_ASIGNACION_IDS.ASIGNACION_1,
    mesaId: 'a1000000-0000-4000-8000-000000000003',
    meseroId: FIXTURE_MESERO_IDS.CARLOS,
    fechaHoraInicio: '2026-10-11T12:00:00.000Z',
    fechaHoraFin: null,
    activo: true,
  },
  {
    asignacionId: FIXTURE_ASIGNACION_IDS.ASIGNACION_2,
    mesaId: 'a1000000-0000-4000-8000-000000000005',
    meseroId: FIXTURE_MESERO_IDS.ANA,
    fechaHoraInicio: '2026-10-11T13:00:00.000Z',
    fechaHoraFin: null,
    activo: true,
  },
  {
    asignacionId: FIXTURE_ASIGNACION_IDS.ASIGNACION_3,
    mesaId: 'a1000000-0000-4000-8000-000000000006',
    meseroId: FIXTURE_MESERO_IDS.ANA,
    fechaHoraInicio: '2026-10-11T13:00:00.000Z',
    fechaHoraFin: null,
    activo: true,
  },
  {
    asignacionId: FIXTURE_ASIGNACION_IDS.ASIGNACION_4,
    mesaId: 'a1000000-0000-4000-8000-000000000001',
    meseroId: FIXTURE_MESERO_IDS.ROBERTO,
    fechaHoraInicio: '2026-10-11T10:00:00.000Z',
    fechaHoraFin: '2026-10-11T11:30:00.000Z',
    activo: false,
  },
];
