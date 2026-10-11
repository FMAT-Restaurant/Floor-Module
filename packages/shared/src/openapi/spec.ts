import { EstadoEspera, EstadoMesa, EstadoReserva, EstadoUnion } from '../enums/index.js';

const uuidPathParam = (name: string, description?: string) => ({
  name,
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  ...(description ? { description } : {}),
});

const jsonContent = (schema: unknown) => ({
  'application/json': { schema },
});

const jsonResponse = (schemaRef: string, description: string) => ({
  description,
  content: jsonContent({ $ref: schemaRef }),
});

const jsonArrayResponse = (schemaRef: string, description: string) => ({
  description,
  content: jsonContent({
    type: 'array' as const,
    items: { $ref: schemaRef },
  }),
});

const jsonRequestBody = (schemaRef: string) => ({
  required: true,
  content: jsonContent({ $ref: schemaRef }),
});

const badRequestRef = { $ref: '#/components/responses/BadRequest' } as const;
const unauthorizedRef = { $ref: '#/components/responses/Unauthorized' } as const;
const forbiddenRef = { $ref: '#/components/responses/Forbidden' } as const;
const notFoundRef = { $ref: '#/components/responses/NotFound' } as const;
const conflictRef = { $ref: '#/components/responses/Conflict' } as const;

const uuidProperty = { type: 'string' as const, format: 'uuid' as const };
const nullableUuidProperty = {
  type: 'string' as const,
  format: 'uuid' as const,
  nullable: true,
};
const positiveIntProperty = { type: 'integer' as const, minimum: 1 };
const dateTimeProperty = { type: 'string' as const, format: 'date-time' as const };
const nullableDateTimeProperty = {
  type: 'string' as const,
  format: 'date-time' as const,
  nullable: true,
};
const datePatternProperty = { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const timePatternProperty = {
  type: 'string' as const,
  pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
};
const phonePatternProperty = { type: 'string' as const, pattern: '^[0-9 +()-]{7,20}$' };
const clientNameProperty = { type: 'string' as const, minLength: 1, maxLength: 100 };
const zoneNameProperty = { type: 'string' as const, minLength: 1, maxLength: 50 };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Floor-Module API (Sala y Reservas)',
    version: '1.0.0',
    description:
      'Microservicio del ecosistema POS FMAT-Restaurant que gestiona el plano físico de mesas, ciclo operativo, asignación de meseros, reservas, uniones de mesas y lista de espera.',
  },
  servers: [
    {
      url: '/sala',
      description: 'API Gateway base path para el microservicio de Sala',
    },
    {
      url: 'http://localhost:3001',
      description: 'Entorno de desarrollo local directo',
    },
  ],
  tags: [
    { name: 'Mesas', description: 'Gestión y catálogo de mesas físicas' },
    {
      name: 'Ciclo Operativo',
      description: 'Ocupación de mesas y transiciones de estado operativo',
    },
    { name: 'Meseros', description: 'Asignación de meseros a mesas físicas' },
    { name: 'Reservas', description: 'Ciclo de vida de reservas y consulta de disponibilidad' },
    { name: 'Uniones', description: 'Unión y disolución atómica de mesas' },
    { name: 'Lista de Espera', description: 'Gestión de comensales en lista de espera' },
    { name: 'Operación', description: 'Health check y estado de servicios' },
  ],
  paths: {
    '/sala/mesas': {
      get: {
        tags: ['Mesas'],
        summary: 'Consultar mesas',
        description:
          'Obtiene el listado de mesas con filtros opcionales por zona, estado o inactivas.',
        operationId: 'listarMesas',
        parameters: [
          {
            name: 'zona',
            in: 'query',
            required: false,
            schema: zoneNameProperty,
            description: 'Filtrar por zona del restaurante',
          },
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: Object.values(EstadoMesa) },
            description: 'Filtrar por estado físico',
          },
          {
            name: 'incluirInactivas',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: false },
            description: 'Incluir mesas dadas de baja lógica',
          },
        ],
        responses: {
          '200': jsonArrayResponse(
            '#/components/schemas/MesaDto',
            'Listado de mesas obtenido exitosamente',
          ),
          '401': unauthorizedRef,
        },
      },
      post: {
        tags: ['Mesas'],
        summary: 'Crear mesa',
        description: 'Registra una nueva mesa física en el plano.',
        operationId: 'crearMesa',
        requestBody: jsonRequestBody('#/components/schemas/CrearMesaRequestDto'),
        responses: {
          '201': jsonResponse('#/components/schemas/MesaDto', 'Mesa creada exitosamente'),
          '400': badRequestRef,
          '401': unauthorizedRef,
          '403': forbiddenRef,
          '409': {
            description: 'Número de mesa duplicado',
            content: jsonContent({
              $ref: '#/components/schemas/ApiErrorResponse',
              example: {
                statusCode: 409,
                code: 'NUMERO_MESA_DUPLICADO',
                message: 'Ya existe una mesa activa con ese número',
              },
            }),
          },
        },
      },
    },
    '/sala/mesas/estado-en-vivo': {
      get: {
        tags: ['Mesas'],
        summary: 'Consultar estado en vivo de mesas',
        description:
          'Obtiene el estado completo en tiempo real de todas las mesas para el plano de sala.',
        operationId: 'listarMesasEnVivo',
        responses: {
          '200': jsonArrayResponse('#/components/schemas/MesaEnVivoDto', 'Estado en vivo de mesas'),
          '401': unauthorizedRef,
        },
      },
    },
    '/sala/mesas/{mesaId}': {
      get: {
        tags: ['Mesas'],
        summary: 'Consultar detalle de mesa',
        operationId: 'obtenerMesaPorId',
        parameters: [uuidPathParam('mesaId')],
        responses: {
          '200': jsonResponse('#/components/schemas/MesaDto', 'Mesa encontrada'),
          '404': notFoundRef,
        },
      },
      patch: {
        tags: ['Mesas'],
        summary: 'Actualizar mesa',
        operationId: 'actualizarMesa',
        parameters: [uuidPathParam('mesaId')],
        requestBody: jsonRequestBody('#/components/schemas/ActualizarMesaRequestDto'),
        responses: {
          '200': jsonResponse('#/components/schemas/MesaDto', 'Mesa actualizada exitosamente'),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
      delete: {
        tags: ['Mesas'],
        summary: 'Desactivar mesa',
        operationId: 'desactivarMesa',
        parameters: [uuidPathParam('mesaId')],
        responses: {
          '204': { description: 'Mesa desactivada exitosamente' },
          '404': notFoundRef,
          '409': {
            description: 'Conflicto: mesa ocupada o unida a otra',
            content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
          },
        },
      },
    },
    '/sala/mesas/{mesaId}/ocupar': {
      post: {
        tags: ['Ciclo Operativo'],
        summary: 'Ocupar mesa física',
        description:
          'Transiciona una mesa a Ocupada, asocia mesero y emite evento de inicio de dining session.',
        operationId: 'ocuparMesa',
        parameters: [uuidPathParam('mesaId')],
        requestBody: jsonRequestBody('#/components/schemas/OcuparMesaRequestDto'),
        responses: {
          '200': jsonResponse(
            '#/components/schemas/OcuparMesaResponseDto',
            'Mesa ocupada exitosamente',
          ),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': {
            description: 'Conflicto por mesa no disponible, sobrecupo o reserva próxima',
            content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
          },
        },
      },
    },
    '/sala/mesas/{mesaId}/estado': {
      patch: {
        tags: ['Ciclo Operativo'],
        summary: 'Cambiar estado físico de mesa',
        description: 'Transición controlada entre Libre y Limpieza pendiente.',
        operationId: 'actualizarEstadoMesa',
        parameters: [uuidPathParam('mesaId')],
        requestBody: jsonRequestBody('#/components/schemas/ActualizarEstadoMesaRequestDto'),
        responses: {
          '200': jsonResponse(
            '#/components/schemas/ActualizarEstadoMesaResponseDto',
            'Estado actualizado exitosamente',
          ),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
    },
    '/sala/mesas/{mesaId}/mesero': {
      put: {
        tags: ['Meseros'],
        summary: 'Asignar mesero a mesa',
        operationId: 'asignarMeseroAMesa',
        parameters: [uuidPathParam('mesaId')],
        requestBody: jsonRequestBody('#/components/schemas/AsignarMeseroRequestDto'),
        responses: {
          '200': jsonResponse('#/components/schemas/AsignacionDto', 'Mesero asignado exitosamente'),
          '400': badRequestRef,
          '404': notFoundRef,
        },
      },
    },
    '/sala/asignaciones': {
      get: {
        tags: ['Meseros'],
        summary: 'Listar asignaciones de mesero',
        operationId: 'listarAsignaciones',
        parameters: [
          {
            name: 'meseroId',
            in: 'query',
            required: false,
            schema: uuidProperty,
          },
          {
            name: 'activo',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: true },
          },
        ],
        responses: {
          '200': jsonArrayResponse('#/components/schemas/AsignacionDto', 'Listado de asignaciones'),
        },
      },
    },
    '/sala/reservas': {
      get: {
        tags: ['Reservas'],
        summary: 'Listar reservas',
        operationId: 'listarReservas',
        parameters: [
          {
            name: 'fecha',
            in: 'query',
            required: false,
            schema: datePatternProperty,
          },
          {
            name: 'mesaId',
            in: 'query',
            required: false,
            schema: uuidProperty,
          },
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: Object.values(EstadoReserva) },
          },
        ],
        responses: {
          '200': jsonArrayResponse('#/components/schemas/ReservaDto', 'Listado de reservas'),
        },
      },
      post: {
        tags: ['Reservas'],
        summary: 'Crear reserva',
        operationId: 'crearReserva',
        requestBody: jsonRequestBody('#/components/schemas/CrearReservaRequestDto'),
        responses: {
          '201': jsonResponse(
            '#/components/schemas/CrearReservaResponseDto',
            'Reserva creada exitosamente',
          ),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': {
            description: 'Reserva solapada con otra reserva existente',
            content: jsonContent({
              $ref: '#/components/schemas/ApiErrorResponse',
              example: {
                statusCode: 409,
                code: 'RESERVA_SOLAPADA',
                message: 'La mesa ya cuenta con una reserva en ese rango de horario',
              },
            }),
          },
        },
      },
    },
    '/sala/reservas/disponibilidad': {
      get: {
        tags: ['Reservas'],
        summary: 'Consultar disponibilidad para reserva',
        operationId: 'consultarDisponibilidad',
        parameters: [
          {
            name: 'fecha',
            in: 'query',
            required: true,
            schema: datePatternProperty,
          },
          {
            name: 'horaInicio',
            in: 'query',
            required: true,
            schema: timePatternProperty,
          },
          {
            name: 'duracion',
            in: 'query',
            required: true,
            schema: { type: 'integer', minimum: 15, maximum: 480 },
          },
          {
            name: 'personas',
            in: 'query',
            required: true,
            schema: positiveIntProperty,
          },
        ],
        responses: {
          '200': jsonArrayResponse(
            '#/components/schemas/MesaDto',
            'Mesas disponibles que cumplen los criterios',
          ),
          '400': badRequestRef,
        },
      },
    },
    '/sala/reservas/{reservaId}': {
      patch: {
        tags: ['Reservas'],
        summary: 'Modificar reserva',
        operationId: 'actualizarReserva',
        parameters: [uuidPathParam('reservaId')],
        requestBody: jsonRequestBody('#/components/schemas/ActualizarReservaRequestDto'),
        responses: {
          '200': jsonResponse('#/components/schemas/ReservaDto', 'Reserva modificada exitosamente'),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
    },
    '/sala/reservas/{reservaId}/cancelar': {
      post: {
        tags: ['Reservas'],
        summary: 'Cancelar reserva',
        operationId: 'cancelarReserva',
        parameters: [uuidPathParam('reservaId')],
        responses: {
          '200': jsonResponse('#/components/schemas/ReservaDto', 'Reserva cancelada exitosamente'),
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
    },
    '/sala/reservas/{reservaId}/no-show': {
      post: {
        tags: ['Reservas'],
        summary: 'Marcar no-show en reserva',
        operationId: 'marcarNoShowReserva',
        parameters: [uuidPathParam('reservaId')],
        responses: {
          '200': jsonResponse('#/components/schemas/ReservaDto', 'Reserva marcada como No-show'),
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
    },
    '/sala/mesas/uniones': {
      get: {
        tags: ['Uniones'],
        summary: 'Listar uniones de mesas',
        operationId: 'listarUniones',
        parameters: [
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: Object.values(EstadoUnion),
              default: EstadoUnion.ACTIVA,
            },
          },
        ],
        responses: {
          '200': jsonArrayResponse('#/components/schemas/UnionDto', 'Listado de uniones'),
        },
      },
      post: {
        tags: ['Uniones'],
        summary: 'Crear unión atómica de mesas',
        operationId: 'crearUnion',
        requestBody: jsonRequestBody('#/components/schemas/CrearUnionRequestDto'),
        responses: {
          '201': jsonResponse(
            '#/components/schemas/CrearUnionResponseDto',
            'Unión creada exitosamente',
          ),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': {
            description:
              'Conflicto por mesa no disponible, zona incompatible, sobrecupo o reserva próxima',
            content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
          },
        },
      },
    },
    '/sala/mesas/uniones/{unionId}/liberar': {
      post: {
        tags: ['Uniones'],
        summary: 'Liberar / disolver unión de mesas',
        operationId: 'liberarUnion',
        parameters: [uuidPathParam('unionId')],
        responses: {
          '200': jsonResponse(
            '#/components/schemas/LiberarUnionResponseDto',
            'Unión disuelta exitosamente',
          ),
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
    },
    '/sala/espera': {
      get: {
        tags: ['Lista de Espera'],
        summary: 'Listar comensales en espera',
        operationId: 'listarEspera',
        parameters: [
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: Object.values(EstadoEspera) },
          },
        ],
        responses: {
          '200': jsonArrayResponse(
            '#/components/schemas/EsperaDto',
            'Listado de espera ordenado por hora de llegada',
          ),
        },
      },
      post: {
        tags: ['Lista de Espera'],
        summary: 'Registrar comensal en lista de espera',
        operationId: 'crearEspera',
        requestBody: jsonRequestBody('#/components/schemas/CrearEsperaRequestDto'),
        responses: {
          '201': jsonResponse(
            '#/components/schemas/EsperaDto',
            'Registro en espera creado exitosamente',
          ),
          '400': badRequestRef,
        },
      },
    },
    '/sala/espera/{esperaId}/estado': {
      patch: {
        tags: ['Lista de Espera'],
        summary: 'Actualizar estado de comensal en espera',
        operationId: 'actualizarEstadoEspera',
        parameters: [uuidPathParam('esperaId')],
        requestBody: jsonRequestBody('#/components/schemas/ActualizarEstadoEsperaRequestDto'),
        responses: {
          '200': jsonResponse('#/components/schemas/EsperaDto', 'Estado actualizado exitosamente'),
          '400': badRequestRef,
          '404': notFoundRef,
          '409': conflictRef,
        },
      },
    },
    '/health': {
      get: {
        tags: ['Operación'],
        summary: 'Verificar salud del microservicio',
        operationId: 'verificarSalud',
        responses: {
          '200': jsonResponse('#/components/schemas/HealthDto', 'Servicio operando correctamente'),
          '503': {
            description:
              'Alguna dependencia crítica (Base de Datos o RabbitMQ) se encuentra inactiva',
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT validado y propagado por el API Gateway',
      },
      CorrelationId: {
        type: 'apiKey',
        in: 'header',
        name: 'x-correlation-id',
        description: 'Identificador de correlación para observabilidad',
      },
    },
    responses: {
      BadRequest: {
        description: 'Solicitud inválida o payload no conforme',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
      Unauthorized: {
        description: 'Faltan credenciales o identidad no propagada',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
      Forbidden: {
        description: 'El rol autenticado carece de permisos para la acción',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
      NotFound: {
        description: 'El recurso solicitado no existe o se encuentra inactivo',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
      Conflict: {
        description: 'Conflicto de estado, concurrencia o regla de dominio',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
      PayloadTooLarge: {
        description: 'El tamaño de la petición excede el límite máximo de 64 KB',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
      InternalServerError: {
        description: 'Error no controlado del servidor',
        content: jsonContent({ $ref: '#/components/schemas/ApiErrorResponse' }),
      },
    },
    schemas: {
      ApiErrorResponse: {
        type: 'object',
        required: ['statusCode', 'code', 'message'],
        properties: {
          statusCode: { type: 'integer', example: 409 },
          code: { type: 'string', example: 'MESA_NO_DISPONIBLE' },
          message: {
            type: 'string',
            example: 'La mesa se encuentra ocupada o en limpieza',
          },
          details: { type: 'object', additionalProperties: true },
        },
      },
      MesaDto: {
        type: 'object',
        required: [
          'mesaId',
          'numeroMesa',
          'capacidad',
          'zona',
          'estadoFisico',
          'unionId',
          'activo',
        ],
        properties: {
          mesaId: uuidProperty,
          numeroMesa: positiveIntProperty,
          capacidad: positiveIntProperty,
          zona: zoneNameProperty,
          estadoFisico: {
            type: 'string',
            enum: Object.values(EstadoMesa),
          },
          unionId: nullableUuidProperty,
          activo: { type: 'boolean' },
        },
      },
      MesaEnVivoDto: {
        allOf: [
          { $ref: '#/components/schemas/MesaDto' },
          {
            type: 'object',
            required: ['tieneReservaProxima', 'ocupadaDesde', 'meseroId'],
            properties: {
              tieneReservaProxima: { type: 'boolean' },
              ocupadaDesde: nullableDateTimeProperty,
              meseroId: nullableUuidProperty,
            },
          },
        ],
      },
      CrearMesaRequestDto: {
        type: 'object',
        required: ['numeroMesa', 'capacidad', 'zona'],
        additionalProperties: false,
        properties: {
          numeroMesa: positiveIntProperty,
          capacidad: positiveIntProperty,
          zona: zoneNameProperty,
        },
      },
      ActualizarMesaRequestDto: {
        type: 'object',
        additionalProperties: false,
        properties: {
          numeroMesa: positiveIntProperty,
          capacidad: positiveIntProperty,
          zona: zoneNameProperty,
        },
      },
      OcuparMesaRequestDto: {
        type: 'object',
        required: ['comensales', 'meseroId'],
        additionalProperties: false,
        properties: {
          comensales: positiveIntProperty,
          meseroId: uuidProperty,
          reservaId: uuidProperty,
          esperaId: uuidProperty,
          forzarOcupacion: { type: 'boolean' },
          forzarSobrecupo: { type: 'boolean' },
        },
      },
      OcuparMesaResponseDto: {
        type: 'object',
        required: ['mesaId', 'estado', 'sessionId'],
        properties: {
          mesaId: uuidProperty,
          estado: { type: 'string', enum: [EstadoMesa.OCUPADA] },
          sessionId: uuidProperty,
          advertencias: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      ActualizarEstadoMesaRequestDto: {
        type: 'object',
        required: ['estado'],
        additionalProperties: false,
        properties: {
          estado: {
            type: 'string',
            enum: [EstadoMesa.LIMPIEZA_PENDIENTE, EstadoMesa.LIBRE],
          },
        },
      },
      ActualizarEstadoMesaResponseDto: {
        type: 'object',
        required: ['mesaId', 'estado'],
        properties: {
          mesaId: uuidProperty,
          estado: { type: 'string', enum: Object.values(EstadoMesa) },
        },
      },
      AsignarMeseroRequestDto: {
        type: 'object',
        required: ['meseroId'],
        additionalProperties: false,
        properties: {
          meseroId: uuidProperty,
        },
      },
      AsignacionDto: {
        type: 'object',
        required: [
          'asignacionId',
          'mesaId',
          'meseroId',
          'fechaHoraInicio',
          'fechaHoraFin',
          'activo',
        ],
        properties: {
          asignacionId: uuidProperty,
          mesaId: uuidProperty,
          meseroId: uuidProperty,
          fechaHoraInicio: dateTimeProperty,
          fechaHoraFin: nullableDateTimeProperty,
          activo: { type: 'boolean' },
        },
      },
      CrearReservaRequestDto: {
        type: 'object',
        required: ['mesaId', 'fecha', 'horaInicio', 'duracion', 'cantidadPersonas', 'cliente'],
        additionalProperties: false,
        properties: {
          mesaId: uuidProperty,
          fecha: datePatternProperty,
          horaInicio: timePatternProperty,
          duracion: { type: 'integer', minimum: 15, maximum: 480 },
          cantidadPersonas: positiveIntProperty,
          cliente: {
            type: 'object',
            required: ['nombre', 'tel'],
            additionalProperties: false,
            properties: {
              nombre: clientNameProperty,
              tel: phonePatternProperty,
            },
          },
        },
      },
      CrearReservaResponseDto: {
        type: 'object',
        required: ['reservaId', 'mesaId', 'estado'],
        properties: {
          reservaId: uuidProperty,
          mesaId: uuidProperty,
          estado: { type: 'string', enum: [EstadoReserva.CONFIRMADA] },
        },
      },
      ActualizarReservaRequestDto: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mesaId: uuidProperty,
          fecha: datePatternProperty,
          horaInicio: timePatternProperty,
          duracion: { type: 'integer', minimum: 15, maximum: 480 },
          cantidadPersonas: positiveIntProperty,
        },
      },
      ReservaDto: {
        type: 'object',
        required: [
          'reservaId',
          'mesaId',
          'nombreContacto',
          'telefonoContacto',
          'cantidadPersonas',
          'fecha',
          'horaInicio',
          'horaFin',
          'estado',
        ],
        properties: {
          reservaId: uuidProperty,
          mesaId: uuidProperty,
          nombreContacto: clientNameProperty,
          telefonoContacto: phonePatternProperty,
          cantidadPersonas: positiveIntProperty,
          fecha: datePatternProperty,
          horaInicio: timePatternProperty,
          horaFin: timePatternProperty,
          estado: {
            type: 'string',
            enum: Object.values(EstadoReserva),
          },
        },
      },
      CrearUnionRequestDto: {
        type: 'object',
        required: ['mesasIds', 'totalPersonas', 'meseroId'],
        additionalProperties: false,
        properties: {
          mesasIds: {
            type: 'array',
            minItems: 2,
            uniqueItems: true,
            items: uuidProperty,
          },
          totalPersonas: positiveIntProperty,
          meseroId: uuidProperty,
          forzarOcupacion: { type: 'boolean' },
          forzarSobrecupo: { type: 'boolean' },
        },
      },
      CrearUnionResponseDto: {
        type: 'object',
        required: ['unionId', 'mesasIds', 'estado', 'sessionId'],
        properties: {
          unionId: uuidProperty,
          mesasIds: {
            type: 'array',
            items: uuidProperty,
          },
          estado: { type: 'string', enum: [EstadoMesa.OCUPADA] },
          sessionId: uuidProperty,
        },
      },
      LiberarUnionResponseDto: {
        type: 'object',
        required: ['mesasIds', 'estado'],
        properties: {
          mesasIds: {
            type: 'array',
            items: uuidProperty,
          },
          estado: { type: 'string', enum: [EstadoMesa.LIMPIEZA_PENDIENTE] },
        },
      },
      UnionDto: {
        type: 'object',
        required: ['unionId', 'zona', 'mesasIds', 'estado', 'fechaCreacion', 'fechaDisolucion'],
        properties: {
          unionId: uuidProperty,
          zona: zoneNameProperty,
          mesasIds: {
            type: 'array',
            items: uuidProperty,
          },
          estado: {
            type: 'string',
            enum: Object.values(EstadoUnion),
          },
          fechaCreacion: dateTimeProperty,
          fechaDisolucion: nullableDateTimeProperty,
        },
      },
      CrearEsperaRequestDto: {
        type: 'object',
        required: ['nombreCliente', 'telefonoContacto', 'cantidadPersonas'],
        additionalProperties: false,
        properties: {
          nombreCliente: clientNameProperty,
          telefonoContacto: phonePatternProperty,
          cantidadPersonas: positiveIntProperty,
        },
      },
      ActualizarEstadoEsperaRequestDto: {
        type: 'object',
        required: ['estado'],
        additionalProperties: false,
        properties: {
          estado: {
            type: 'string',
            enum: [EstadoEspera.SENTADO, EstadoEspera.CANCELADO, EstadoEspera.EN_ESPERA],
          },
        },
      },
      EsperaDto: {
        type: 'object',
        required: [
          'esperaId',
          'nombreCliente',
          'telefonoContacto',
          'cantidadPersonas',
          'horaLlegada',
          'estado',
          'idMesaAsignada',
        ],
        properties: {
          esperaId: uuidProperty,
          nombreCliente: clientNameProperty,
          telefonoContacto: phonePatternProperty,
          cantidadPersonas: positiveIntProperty,
          horaLlegada: dateTimeProperty,
          estado: {
            type: 'string',
            enum: Object.values(EstadoEspera),
          },
          idMesaAsignada: nullableUuidProperty,
        },
      },
      HealthDto: {
        type: 'object',
        required: ['status', 'db', 'broker'],
        properties: {
          status: { type: 'string', example: 'ok' },
          db: { type: 'string', example: 'up' },
          broker: { type: 'string', example: 'up' },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof openApiSpec;
