import { EstadoUnion } from '../enums';
import type { UnionDto } from '../schemas';

export const FIXTURE_UNION_IDS = {
  UNION_1: 'c1000000-0000-4000-8000-000000000001',
  UNION_2: 'c1000000-0000-4000-8000-000000000002',
} as const;

export const fixtureUniones: UnionDto[] = [
  {
    unionId: FIXTURE_UNION_IDS.UNION_1,
    zona: 'Terraza',
    mesasIds: ['a1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000006'],
    estado: EstadoUnion.ACTIVA,
    fechaCreacion: '2026-10-11T13:00:00.000Z',
    fechaDisolucion: null,
  },
  {
    unionId: FIXTURE_UNION_IDS.UNION_2,
    zona: 'Principal',
    mesasIds: ['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002'],
    estado: EstadoUnion.DISUELTA,
    fechaCreacion: '2026-10-10T19:00:00.000Z',
    fechaDisolucion: '2026-10-10T21:00:00.000Z',
  },
];
