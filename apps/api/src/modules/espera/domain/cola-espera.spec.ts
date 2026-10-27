import { EstadoEspera } from '@floor/shared';
import type { EsperaRegistro } from '../espera.registro';
import {
  esTransicionEsperaPermitida,
  ESTADOS_ACTIVOS_ESPERA,
  filtrarYOrdenarColaEspera,
  ordenarColaFifo,
  resolverEstadosFiltroEspera,
  resolverMesaAsignadaEnTransicion,
  seleccionarSiguienteCompatibleFifo,
  transicionesManualesEsperaDesde,
} from './cola-espera';

const ID_1 = 'e1000000-0000-4000-8000-000000000001';
const ID_2 = 'e1000000-0000-4000-8000-000000000002';
const ID_3 = 'e1000000-0000-4000-8000-000000000003';
const ID_4 = 'e1000000-0000-4000-8000-000000000004';
const MESA_ID = 'a1000000-0000-4000-8000-000000000001';

function entrada(id: string, parcial: Partial<EsperaRegistro> = {}): EsperaRegistro {
  return {
    id,
    nombreCliente: 'Cliente Prueba',
    telefonoContacto: '+52 999 111 2233',
    cantidadPersonas: 2,
    horaLlegada: new Date('2030-01-15T12:00:00.000Z'),
    estado: EstadoEspera.EN_ESPERA,
    mesaAsignadaId: null,
    ...parcial,
  };
}

describe('cola-espera · ordenamiento FIFO, filtrado y transiciones (BE-010, RN-17, RF-020..RF-022)', () => {
  describe('ordenarColaFifo y filtrarYOrdenarColaEspera (SPEC §5.6)', () => {
    it('ordena estrictamente por horaLlegada ASC y desempata por id ASC sin mutar el arreglo original', () => {
      const t1 = new Date('2030-01-15T12:00:00.000Z');
      const t2 = new Date('2030-01-15T12:05:00.000Z');
      const t3 = new Date('2030-01-15T12:10:00.000Z');

      const original = [
        entrada(ID_3, { horaLlegada: t3 }),
        entrada(ID_2, { horaLlegada: t1 }),
        entrada(ID_1, { horaLlegada: t1 }),
        entrada(ID_4, { horaLlegada: t2 }),
      ];

      const ordenado = ordenarColaFifo(original);

      expect(ordenado.map((e) => e.id)).toEqual([ID_1, ID_2, ID_4, ID_3]);
      expect(original.map((e) => e.id)).toEqual([ID_3, ID_2, ID_1, ID_4]);
    });

    it('filtra por estados activos (En espera, Notificado) por defecto y permite filtrar por un estado específico', () => {
      expect(resolverEstadosFiltroEspera()).toEqual(ESTADOS_ACTIVOS_ESPERA);
      expect(resolverEstadosFiltroEspera(EstadoEspera.CANCELADO)).toEqual([EstadoEspera.CANCELADO]);

      const cola = [
        entrada(ID_1, {
          horaLlegada: new Date('2030-01-15T12:10:00.000Z'),
          estado: EstadoEspera.NOTIFICADO,
        }),
        entrada(ID_2, {
          horaLlegada: new Date('2030-01-15T12:00:00.000Z'),
          estado: EstadoEspera.EN_ESPERA,
        }),
        entrada(ID_3, {
          horaLlegada: new Date('2030-01-15T11:50:00.000Z'),
          estado: EstadoEspera.SENTADO,
        }),
        entrada(ID_4, {
          horaLlegada: new Date('2030-01-15T11:40:00.000Z'),
          estado: EstadoEspera.CANCELADO,
        }),
      ];

      expect(filtrarYOrdenarColaEspera(cola).map((e) => e.id)).toEqual([ID_2, ID_1]);
      expect(filtrarYOrdenarColaEspera(cola, EstadoEspera.EN_ESPERA).map((e) => e.id)).toEqual([
        ID_2,
      ]);
      expect(filtrarYOrdenarColaEspera(cola, EstadoEspera.SENTADO).map((e) => e.id)).toEqual([
        ID_3,
      ]);
    });
  });

  describe('seleccionarSiguienteCompatibleFifo (RN-17, RF-020, F4)', () => {
    it('T4.3 · selecciona el cliente En espera más antiguo con cantidadPersonas <= capacidad de la mesa', () => {
      const masAntiguoGrande = entrada(ID_1, {
        nombreCliente: 'Grupo Grande (6)',
        cantidadPersonas: 6,
        horaLlegada: new Date('2030-01-15T12:00:00.000Z'),
      });
      const yaNotificado = entrada(ID_2, {
        nombreCliente: 'Ya Notificado (2)',
        cantidadPersonas: 2,
        horaLlegada: new Date('2030-01-15T12:01:00.000Z'),
        estado: EstadoEspera.NOTIFICADO,
      });
      const primeroCompatible = entrada(ID_3, {
        nombreCliente: 'Pareja 1 (4)',
        cantidadPersonas: 4,
        horaLlegada: new Date('2030-01-15T12:05:00.000Z'),
      });
      const segundoCompatible = entrada(ID_4, {
        nombreCliente: 'Pareja 2 (2)',
        cantidadPersonas: 2,
        horaLlegada: new Date('2030-01-15T12:08:00.000Z'),
      });

      const elegido = seleccionarSiguienteCompatibleFifo(
        [segundoCompatible, masAntiguoGrande, primeroCompatible, yaNotificado],
        4,
      );

      expect(elegido).toEqual(primeroCompatible);
    });

    it('retorna null si ningún cliente En espera cabe en la capacidad liberada o si la capacidad es inválida', () => {
      const cola = [
        entrada(ID_1, { cantidadPersonas: 6 }),
        entrada(ID_2, { cantidadPersonas: 2, estado: EstadoEspera.NOTIFICADO }),
      ];

      expect(seleccionarSiguienteCompatibleFifo(cola, 4)).toBeNull();
      expect(seleccionarSiguienteCompatibleFifo(cola, 0)).toBeNull();
      expect(seleccionarSiguienteCompatibleFifo([], 4)).toBeNull();
    });
  });

  describe('transiciones de estado de espera (SPEC §4.3, RF-022)', () => {
    it.each([
      [EstadoEspera.EN_ESPERA, EstadoEspera.SENTADO, true],
      [EstadoEspera.EN_ESPERA, EstadoEspera.CANCELADO, true],
      [EstadoEspera.EN_ESPERA, EstadoEspera.EN_ESPERA, false],
      [EstadoEspera.NOTIFICADO, EstadoEspera.SENTADO, true],
      [EstadoEspera.NOTIFICADO, EstadoEspera.CANCELADO, true],
      [EstadoEspera.NOTIFICADO, EstadoEspera.EN_ESPERA, true],
      [EstadoEspera.NOTIFICADO, EstadoEspera.NOTIFICADO, false],
      [EstadoEspera.SENTADO, EstadoEspera.CANCELADO, false],
      [EstadoEspera.SENTADO, EstadoEspera.EN_ESPERA, false],
      [EstadoEspera.SENTADO, EstadoEspera.SENTADO, false],
      [EstadoEspera.CANCELADO, EstadoEspera.SENTADO, false],
      [EstadoEspera.CANCELADO, EstadoEspera.EN_ESPERA, false],
      [EstadoEspera.CANCELADO, EstadoEspera.CANCELADO, false],
    ] as const)('%s → %s permitido = %s', (desde, hacia, esperado) => {
      expect(esTransicionEsperaPermitida(desde, hacia)).toBe(esperado);
    });

    it('expone las transiciones permitidas desde cada estado y resuelve mesaAsignadaId', () => {
      expect(transicionesManualesEsperaDesde(EstadoEspera.EN_ESPERA)).toEqual([
        EstadoEspera.SENTADO,
        EstadoEspera.CANCELADO,
      ]);
      expect(transicionesManualesEsperaDesde(EstadoEspera.SENTADO)).toEqual([]);

      expect(resolverMesaAsignadaEnTransicion(EstadoEspera.SENTADO, MESA_ID)).toBe(MESA_ID);
      expect(resolverMesaAsignadaEnTransicion(EstadoEspera.EN_ESPERA, MESA_ID)).toBeNull();
      expect(resolverMesaAsignadaEnTransicion(EstadoEspera.CANCELADO, MESA_ID)).toBeNull();
    });
  });
});
