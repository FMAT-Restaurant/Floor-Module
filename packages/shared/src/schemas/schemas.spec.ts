import { describe, expect, it } from 'vitest';
import { EstadoEspera, EstadoMesa, EstadoReserva, EstadoUnion } from '../enums';
import {
  actualizarEstadoEsperaSchema,
  actualizarEstadoMesaSchema,
  actualizarMesaSchema,
  actualizarReservaSchema,
  apiErrorResponseSchema,
  asignacionDtoSchema,
  asignarMeseroSchema,
  booleanQuerySchema,
  consultarDisponibilidadQuerySchema,
  crearEsperaSchema,
  crearMesaSchema,
  crearReservaSchema,
  crearUnionSchema,
  esperaDtoSchema,
  healthDtoSchema,
  listarAsignacionesQuerySchema,
  listarEsperaQuerySchema,
  listarMesasQuerySchema,
  listarReservasQuerySchema,
  listarUnionesQuerySchema,
  mesaDtoSchema,
  mesaEnVivoDtoSchema,
  mesaParamSchema,
  ocuparMesaResponseSchema,
  ocuparMesaSchema,
  openApiSpec,
  reservaDtoSchema,
  unionDtoSchema,
} from '../index';

const MOCK_UUID_1 = '11111111-1111-4111-8111-111111111111';
const MOCK_UUID_2 = '22222222-2222-4222-8222-222222222222';
const MOCK_UUID_3 = '33333333-3333-4333-8333-333333333333';

describe('Zod Validation Schemas (SH-002)', () => {
  describe('Mesas Schemas', () => {
    it('debe validar un payload correcto para crearMesaSchema', () => {
      const payload = {
        numeroMesa: 5,
        capacidad: 4,
        zona: 'Terraza',
      };
      const result = crearMesaSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(payload);
      }
    });

    it('debe rechazar numeroMesa o capacidad menor a 1 o decimales', () => {
      expect(
        crearMesaSchema.safeParse({ numeroMesa: 0, capacidad: 4, zona: 'Terraza' }).success,
      ).toBe(false);
      expect(
        crearMesaSchema.safeParse({ numeroMesa: -1, capacidad: 4, zona: 'Terraza' }).success,
      ).toBe(false);
      expect(
        crearMesaSchema.safeParse({
          numeroMesa: 1,
          capacidad: 2.5,
          zona: 'Terraza',
        }).success,
      ).toBe(false);
    });

    it('debe rechazar zona vacía o que exceda 50 caracteres (RNF-008)', () => {
      expect(crearMesaSchema.safeParse({ numeroMesa: 1, capacidad: 4, zona: '   ' }).success).toBe(
        false,
      );
      expect(
        crearMesaSchema.safeParse({
          numeroMesa: 1,
          capacidad: 4,
          zona: 'A'.repeat(51),
        }).success,
      ).toBe(false);
    });

    it('debe rechazar propiedades desconocidas en crearMesaSchema (.strict)', () => {
      const result = crearMesaSchema.safeParse({
        numeroMesa: 1,
        capacidad: 4,
        zona: 'Principal',
        propiedadInvalida: true,
      });
      expect(result.success).toBe(false);
    });

    it('debe validar actualizarMesaSchema con actualización parcial válida', () => {
      expect(actualizarMesaSchema.safeParse({ capacidad: 6 }).success).toBe(true);
      expect(actualizarMesaSchema.safeParse({ zona: 'Salón VIP' }).success).toBe(true);
      expect(actualizarMesaSchema.safeParse({ numeroMesa: 10, capacidad: 8 }).success).toBe(true);
    });

    it('debe rechazar actualizarMesaSchema con objeto vacío', () => {
      const result = actualizarMesaSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('debe validar mesaParamSchema con UUID v4', () => {
      expect(mesaParamSchema.safeParse({ mesaId: MOCK_UUID_1 }).success).toBe(true);
      expect(mesaParamSchema.safeParse({ mesaId: 'not-a-uuid' }).success).toBe(false);
    });

    it('debe procesar listarMesasQuerySchema y coercer incluirInactivas', () => {
      const res1 = listarMesasQuerySchema.safeParse({
        zona: 'Terraza',
        estado: EstadoMesa.LIBRE,
        incluirInactivas: 'true',
      });
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.data.incluirInactivas).toBe(true);
        expect(res1.data.estado).toBe('Libre');
      }

      const res2 = listarMesasQuerySchema.safeParse({
        incluirInactivas: 'false',
      });
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.data.incluirInactivas).toBe(false);
      }
    });

    it('debe validar estructura completa de mesaDtoSchema y mesaEnVivoDtoSchema', () => {
      const mesa = {
        mesaId: MOCK_UUID_1,
        numeroMesa: 1,
        capacidad: 4,
        zona: 'Planta Baja',
        estadoFisico: EstadoMesa.LIBRE,
        unionId: null,
        activo: true,
      };
      expect(mesaDtoSchema.safeParse(mesa).success).toBe(true);

      const mesaEnVivo = {
        ...mesa,
        tieneReservaProxima: false,
        ocupadaDesde: null,
        meseroId: null,
      };
      expect(mesaEnVivoDtoSchema.safeParse(mesaEnVivo).success).toBe(true);
    });
  });

  describe('Ciclo Operativo Schemas', () => {
    it('debe validar ocuparMesaSchema con comensales y meseroId válidos', () => {
      const payload = {
        comensales: 3,
        meseroId: MOCK_UUID_1,
        reservaId: MOCK_UUID_2,
        forzarOcupacion: true,
        forzarSobrecupo: false,
      };
      const result = ocuparMesaSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('debe rechazar ocuparMesaSchema con comensales <= 0 o meseroId inválido', () => {
      expect(ocuparMesaSchema.safeParse({ comensales: 0, meseroId: MOCK_UUID_1 }).success).toBe(
        false,
      );
      expect(ocuparMesaSchema.safeParse({ comensales: 2, meseroId: 'invalido' }).success).toBe(
        false,
      );
    });

    it('debe validar ocuparMesaResponseSchema con estado Ocupada y sessionId', () => {
      const result = ocuparMesaResponseSchema.safeParse({
        mesaId: MOCK_UUID_1,
        estado: EstadoMesa.OCUPADA,
        sessionId: MOCK_UUID_2,
        advertencias: ['Reserva próxima a 15 minutos'],
      });
      expect(result.success).toBe(true);
    });

    it('debe permitir en actualizarEstadoMesaSchema únicamente Limpieza pendiente o Libre', () => {
      expect(
        actualizarEstadoMesaSchema.safeParse({
          estado: EstadoMesa.LIMPIEZA_PENDIENTE,
        }).success,
      ).toBe(true);
      expect(actualizarEstadoMesaSchema.safeParse({ estado: EstadoMesa.LIBRE }).success).toBe(true);
      expect(actualizarEstadoMesaSchema.safeParse({ estado: EstadoMesa.OCUPADA }).success).toBe(
        false,
      );
      expect(actualizarEstadoMesaSchema.safeParse({ estado: 'CualquierOtro' }).success).toBe(false);
    });
  });

  describe('Meseros Schemas', () => {
    it('debe validar asignarMeseroSchema con meseroId UUID', () => {
      expect(asignarMeseroSchema.safeParse({ meseroId: MOCK_UUID_1 }).success).toBe(true);
      expect(asignarMeseroSchema.safeParse({ meseroId: '123' }).success).toBe(false);
    });

    it('debe validar y coercer listarAsignacionesQuerySchema', () => {
      const result = listarAsignacionesQuerySchema.safeParse({
        meseroId: MOCK_UUID_1,
        activo: 'false',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activo).toBe(false);
      }
    });

    it('debe validar asignacionDtoSchema', () => {
      const result = asignacionDtoSchema.safeParse({
        asignacionId: MOCK_UUID_1,
        mesaId: MOCK_UUID_2,
        meseroId: MOCK_UUID_3,
        fechaHoraInicio: '2026-10-11T14:00:00Z',
        fechaHoraFin: null,
        activo: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Reservas Schemas', () => {
    it('debe validar crearReservaSchema con datos válidos', () => {
      const payload = {
        mesaId: MOCK_UUID_1,
        fecha: '2026-10-15',
        horaInicio: '20:30',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: {
          nombre: 'Carlos Santana',
          tel: '+52 999 123 4567',
        },
      };
      const result = crearReservaSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('debe rechazar crearReservaSchema con formatos de fecha u hora incorrectos', () => {
      const base = {
        mesaId: MOCK_UUID_1,
        fecha: '15-10-2026',
        horaInicio: '20:30',
        duracion: 90,
        cantidadPersonas: 4,
        cliente: { nombre: 'Carlos', tel: '+52 999 123 4567' },
      };
      expect(crearReservaSchema.safeParse(base).success).toBe(false);

      expect(
        crearReservaSchema.safeParse({ ...base, fecha: '2026-10-15', horaInicio: '25:00' }).success,
      ).toBe(false);
      expect(
        crearReservaSchema.safeParse({ ...base, fecha: '2026-10-15', horaInicio: '20:65' }).success,
      ).toBe(false);
    });

    it('debe validar que la duración esté entre 15 y 480 minutos (SPEC.md §8)', () => {
      const base = {
        mesaId: MOCK_UUID_1,
        fecha: '2026-10-15',
        horaInicio: '20:30',
        cantidadPersonas: 4,
        cliente: { nombre: 'Carlos', tel: '+52 999 123 4567' },
      };
      expect(crearReservaSchema.safeParse({ ...base, duracion: 14 }).success).toBe(false);
      expect(crearReservaSchema.safeParse({ ...base, duracion: 15 }).success).toBe(true);
      expect(crearReservaSchema.safeParse({ ...base, duracion: 480 }).success).toBe(true);
      expect(crearReservaSchema.safeParse({ ...base, duracion: 481 }).success).toBe(false);
    });

    it('debe validar formato de teléfono regex ^[0-9 +()-]{7,20}$', () => {
      const base = {
        mesaId: MOCK_UUID_1,
        fecha: '2026-10-15',
        horaInicio: '20:30',
        duracion: 60,
        cantidadPersonas: 2,
      };
      // Inválido: < 7 caracteres
      expect(
        crearReservaSchema.safeParse({
          ...base,
          cliente: { nombre: 'Ana', tel: '12345' },
        }).success,
      ).toBe(false);
      // Inválido: > 20 caracteres
      expect(
        crearReservaSchema.safeParse({
          ...base,
          cliente: { nombre: 'Ana', tel: '1'.repeat(21) },
        }).success,
      ).toBe(false);
      // Inválido: letras o símbolos no permitidos
      expect(
        crearReservaSchema.safeParse({
          ...base,
          cliente: { nombre: 'Ana', tel: 'abc-1234567' },
        }).success,
      ).toBe(false);
      // Válido
      expect(
        crearReservaSchema.safeParse({
          ...base,
          cliente: { nombre: 'Ana', tel: '(999) 123-4567' },
        }).success,
      ).toBe(true);
    });

    it('debe validar y coercer parámetros en consultarDisponibilidadQuerySchema', () => {
      const result = consultarDisponibilidadQuerySchema.safeParse({
        fecha: '2026-10-20',
        horaInicio: '19:00',
        duracion: '90',
        personas: '5',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.duracion).toBe(90);
        expect(result.data.personas).toBe(5);
      }
    });

    it('debe validar actualizarReservaSchema con modificación parcial', () => {
      expect(actualizarReservaSchema.safeParse({ cantidadPersonas: 6 }).success).toBe(true);
      expect(actualizarReservaSchema.safeParse({}).success).toBe(false);
    });

    it('debe validar reservaDtoSchema', () => {
      const dto = {
        reservaId: MOCK_UUID_1,
        mesaId: MOCK_UUID_2,
        nombreContacto: 'Sofía',
        telefonoContacto: '9991234567',
        cantidadPersonas: 4,
        fecha: '2026-10-20',
        horaInicio: '19:00',
        horaFin: '20:30',
        estado: EstadoReserva.CONFIRMADA,
      };
      expect(reservaDtoSchema.safeParse(dto).success).toBe(true);
    });

    it('debe validar listarReservasQuerySchema', () => {
      expect(
        listarReservasQuerySchema.safeParse({
          fecha: '2026-10-20',
          estado: EstadoReserva.NO_SHOW,
        }).success,
      ).toBe(true);
    });
  });

  describe('Uniones Schemas', () => {
    it('debe validar crearUnionSchema con >= 2 mesas y sin duplicados', () => {
      const payload = {
        mesasIds: [MOCK_UUID_1, MOCK_UUID_2],
        totalPersonas: 8,
        meseroId: MOCK_UUID_3,
      };
      expect(crearUnionSchema.safeParse(payload).success).toBe(true);
    });

    it('debe rechazar crearUnionSchema si hay menos de 2 mesas', () => {
      const payload = {
        mesasIds: [MOCK_UUID_1],
        totalPersonas: 4,
        meseroId: MOCK_UUID_3,
      };
      expect(crearUnionSchema.safeParse(payload).success).toBe(false);
    });

    it('debe rechazar crearUnionSchema si hay mesasIds duplicadas', () => {
      const payload = {
        mesasIds: [MOCK_UUID_1, MOCK_UUID_1],
        totalPersonas: 6,
        meseroId: MOCK_UUID_3,
      };
      const result = crearUnionSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('debe validar unionDtoSchema y listarUnionesQuerySchema', () => {
      const union = {
        unionId: MOCK_UUID_1,
        zona: 'Salón Principal',
        mesasIds: [MOCK_UUID_2, MOCK_UUID_3],
        estado: EstadoUnion.ACTIVA,
        fechaCreacion: '2026-10-11T12:00:00Z',
        fechaDisolucion: null,
      };
      expect(unionDtoSchema.safeParse(union).success).toBe(true);

      const queryRes = listarUnionesQuerySchema.safeParse({});
      expect(queryRes.success).toBe(true);
      if (queryRes.success) {
        expect(queryRes.data.estado).toBe('Activa');
      }
    });
  });

  describe('Lista de Espera Schemas', () => {
    it('debe validar crearEsperaSchema con comensal válido', () => {
      const payload = {
        nombreCliente: 'Pedro Infante',
        telefonoContacto: '55 1234 5678',
        cantidadPersonas: 3,
      };
      expect(crearEsperaSchema.safeParse(payload).success).toBe(true);
    });

    it('debe rechazar crearEsperaSchema con nombre vacío o cantidad <= 0', () => {
      expect(
        crearEsperaSchema.safeParse({
          nombreCliente: '  ',
          telefonoContacto: '55 1234 5678',
          cantidadPersonas: 3,
        }).success,
      ).toBe(false);

      expect(
        crearEsperaSchema.safeParse({
          nombreCliente: 'Pedro',
          telefonoContacto: '55 1234 5678',
          cantidadPersonas: 0,
        }).success,
      ).toBe(false);
    });

    it('debe validar actualizarEstadoEsperaSchema con estados permitidos (Sentado, Cancelado, En espera)', () => {
      expect(actualizarEstadoEsperaSchema.safeParse({ estado: EstadoEspera.SENTADO }).success).toBe(
        true,
      );
      expect(
        actualizarEstadoEsperaSchema.safeParse({
          estado: EstadoEspera.CANCELADO,
        }).success,
      ).toBe(true);
      expect(
        actualizarEstadoEsperaSchema.safeParse({
          estado: EstadoEspera.EN_ESPERA,
        }).success,
      ).toBe(true);
      expect(
        actualizarEstadoEsperaSchema.safeParse({
          estado: EstadoEspera.NOTIFICADO,
        }).success,
      ).toBe(false);
    });

    it('debe validar esperaDtoSchema y listarEsperaQuerySchema', () => {
      const dto = {
        esperaId: MOCK_UUID_1,
        nombreCliente: 'Lucía',
        telefonoContacto: '9998765432',
        cantidadPersonas: 2,
        horaLlegada: '2026-10-11T13:30:00Z',
        estado: EstadoEspera.EN_ESPERA,
        idMesaAsignada: null,
      };
      expect(esperaDtoSchema.safeParse(dto).success).toBe(true);
      expect(listarEsperaQuerySchema.safeParse({ estado: EstadoEspera.NOTIFICADO }).success).toBe(
        true,
      );
    });
  });

  describe('Common & Error Response Schemas', () => {
    it('debe validar apiErrorResponseSchema según SPEC.md §1', () => {
      const err = {
        statusCode: 409,
        code: 'MESA_NO_DISPONIBLE',
        message: 'La mesa se encuentra ocupada o en limpieza',
        details: { mesaId: MOCK_UUID_1 },
      };
      expect(apiErrorResponseSchema.safeParse(err).success).toBe(true);
    });

    it('debe validar booleanQuerySchema para valores string y booleanos', () => {
      expect(booleanQuerySchema.parse('true')).toBe(true);
      expect(booleanQuerySchema.parse('TRUE')).toBe(true);
      expect(booleanQuerySchema.parse('false')).toBe(false);
      expect(booleanQuerySchema.parse('FALSE')).toBe(false);
      expect(booleanQuerySchema.parse(true)).toBe(true);
      expect(booleanQuerySchema.parse(false)).toBe(false);
    });

    it('debe validar healthDtoSchema', () => {
      expect(healthDtoSchema.safeParse({ status: 'ok', db: 'up', broker: 'up' }).success).toBe(
        true,
      );
    });
  });

  describe('OpenAPI 3.0 Specification', () => {
    it('debe cumplir con la especificación OpenAPI 3.0.3 y contener todos los paths requeridos', () => {
      expect(openApiSpec.openapi).toBe('3.0.3');
      expect(openApiSpec.info.title).toContain('Floor-Module API');
      expect(openApiSpec.info.version).toBe('1.0.0');

      const expectedPaths = [
        '/sala/mesas',
        '/sala/mesas/estado-en-vivo',
        '/sala/mesas/{mesaId}',
        '/sala/mesas/{mesaId}/ocupar',
        '/sala/mesas/{mesaId}/estado',
        '/sala/mesas/{mesaId}/mesero',
        '/sala/asignaciones',
        '/sala/reservas',
        '/sala/reservas/disponibilidad',
        '/sala/reservas/{reservaId}',
        '/sala/reservas/{reservaId}/cancelar',
        '/sala/reservas/{reservaId}/no-show',
        '/sala/mesas/uniones',
        '/sala/mesas/uniones/{unionId}/liberar',
        '/sala/espera',
        '/sala/espera/{esperaId}/estado',
        '/health',
      ];

      for (const path of expectedPaths) {
        expect(openApiSpec.paths).toHaveProperty(path);
      }
    });

    it('debe declarar todos los esquemas de componentes requeridos', () => {
      const expectedSchemas = [
        'ApiErrorResponse',
        'MesaDto',
        'MesaEnVivoDto',
        'CrearMesaRequestDto',
        'ActualizarMesaRequestDto',
        'OcuparMesaRequestDto',
        'OcuparMesaResponseDto',
        'ActualizarEstadoMesaRequestDto',
        'ActualizarEstadoMesaResponseDto',
        'AsignarMeseroRequestDto',
        'AsignacionDto',
        'CrearReservaRequestDto',
        'CrearReservaResponseDto',
        'ActualizarReservaRequestDto',
        'ReservaDto',
        'CrearUnionRequestDto',
        'CrearUnionResponseDto',
        'LiberarUnionResponseDto',
        'UnionDto',
        'CrearEsperaRequestDto',
        'ActualizarEstadoEsperaRequestDto',
        'EsperaDto',
        'HealthDto',
      ];

      for (const schemaName of expectedSchemas) {
        expect(openApiSpec.components.schemas).toHaveProperty(schemaName);
      }
    });

    it('debe mantener sincronizado el archivo openapi.json con openApiSpec', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const openApiJsonPath = path.resolve(__dirname, '../../openapi.json');
      expect(fs.existsSync(openApiJsonPath)).toBe(true);
      const rootParsed = JSON.parse(fs.readFileSync(openApiJsonPath, 'utf-8'));
      expect(rootParsed).toEqual(openApiSpec);
    });
  });
});
