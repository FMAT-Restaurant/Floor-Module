import { EstadoEspera, EstadoMesa, EstadoReserva, EstadoUnion } from '../enums';

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
            schema: { type: 'string', minLength: 1, maxLength: 50 },
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
          '200': {
            description: 'Listado de mesas obtenido exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MesaDto' },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Mesas'],
        summary: 'Crear mesa',
        description: 'Registra una nueva mesa física en el plano.',
        operationId: 'crearMesa',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CrearMesaRequestDto' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Mesa creada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MesaDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '409': {
            description: 'Número de mesa duplicado',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                example: {
                  statusCode: 409,
                  code: 'NUMERO_MESA_DUPLICADO',
                  message: 'Ya existe una mesa activa con ese número',
                },
              },
            },
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
          '200': {
            description: 'Estado en vivo de mesas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MesaEnVivoDto' },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/sala/mesas/{mesaId}': {
      get: {
        tags: ['Mesas'],
        summary: 'Consultar detalle de mesa',
        operationId: 'obtenerMesaPorId',
        parameters: [
          {
            name: 'mesaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Mesa encontrada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MesaDto' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Mesas'],
        summary: 'Actualizar mesa',
        operationId: 'actualizarMesa',
        parameters: [
          {
            name: 'mesaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActualizarMesaRequestDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mesa actualizada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MesaDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
      delete: {
        tags: ['Mesas'],
        summary: 'Desactivar mesa',
        operationId: 'desactivarMesa',
        parameters: [
          {
            name: 'mesaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Mesa desactivada exitosamente' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description: 'Conflicto: mesa ocupada o unida a otra',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
              },
            },
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
        parameters: [
          {
            name: 'mesaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OcuparMesaRequestDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mesa ocupada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OcuparMesaResponseDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description: 'Conflicto por mesa no disponible, sobrecupo o reserva próxima',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
              },
            },
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
        parameters: [
          {
            name: 'mesaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActualizarEstadoMesaRequestDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Estado actualizado exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ActualizarEstadoMesaResponseDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/sala/mesas/{mesaId}/mesero': {
      put: {
        tags: ['Meseros'],
        summary: 'Asignar mesero a mesa',
        operationId: 'asignarMeseroAMesa',
        parameters: [
          {
            name: 'mesaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AsignarMeseroRequestDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mesero asignado exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AsignacionDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
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
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'activo',
            in: 'query',
            required: false,
            schema: { type: 'boolean', default: true },
          },
        ],
        responses: {
          '200': {
            description: 'Listado de asignaciones',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AsignacionDto' },
                },
              },
            },
          },
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
            schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
          {
            name: 'mesaId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'estado',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: Object.values(EstadoReserva) },
          },
        ],
        responses: {
          '200': {
            description: 'Listado de reservas',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ReservaDto' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Reservas'],
        summary: 'Crear reserva',
        operationId: 'crearReserva',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CrearReservaRequestDto' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Reserva creada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CrearReservaResponseDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description: 'Reserva solapada con otra reserva existente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                example: {
                  statusCode: 409,
                  code: 'RESERVA_SOLAPADA',
                  message: 'La mesa ya cuenta con una reserva en ese rango de horario',
                },
              },
            },
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
            schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
          {
            name: 'horaInicio',
            in: 'query',
            required: true,
            schema: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' },
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
            schema: { type: 'integer', minimum: 1 },
          },
        ],
        responses: {
          '200': {
            description: 'Mesas disponibles que cumplen los criterios',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MesaDto' },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/sala/reservas/{reservaId}': {
      patch: {
        tags: ['Reservas'],
        summary: 'Modificar reserva',
        operationId: 'actualizarReserva',
        parameters: [
          {
            name: 'reservaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActualizarReservaRequestDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Reserva modificada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReservaDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/sala/reservas/{reservaId}/cancelar': {
      post: {
        tags: ['Reservas'],
        summary: 'Cancelar reserva',
        operationId: 'cancelarReserva',
        parameters: [
          {
            name: 'reservaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Reserva cancelada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReservaDto' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/sala/reservas/{reservaId}/no-show': {
      post: {
        tags: ['Reservas'],
        summary: 'Marcar no-show en reserva',
        operationId: 'marcarNoShowReserva',
        parameters: [
          {
            name: 'reservaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Reserva marcada como No-show',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReservaDto' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
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
          '200': {
            description: 'Listado de uniones',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/UnionDto' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Uniones'],
        summary: 'Crear unión atómica de mesas',
        operationId: 'crearUnion',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CrearUnionRequestDto' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Unión creada exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CrearUnionResponseDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': {
            description:
              'Conflicto por mesa no disponible, zona incompatible, sobrecupo o reserva próxima',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/sala/mesas/uniones/{unionId}/liberar': {
      post: {
        tags: ['Uniones'],
        summary: 'Liberar / disolver unión de mesas',
        operationId: 'liberarUnion',
        parameters: [
          {
            name: 'unionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Unión disuelta exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LiberarUnionResponseDto' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
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
          '200': {
            description: 'Listado de espera ordenado por hora de llegada',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/EsperaDto' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Lista de Espera'],
        summary: 'Registrar comensal en lista de espera',
        operationId: 'crearEspera',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CrearEsperaRequestDto' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Registro en espera creado exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EsperaDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/sala/espera/{esperaId}/estado': {
      patch: {
        tags: ['Lista de Espera'],
        summary: 'Actualizar estado de comensal en espera',
        operationId: 'actualizarEstadoEspera',
        parameters: [
          {
            name: 'esperaId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ActualizarEstadoEsperaRequestDto' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Estado actualizado exitosamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EsperaDto' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { $ref: '#/components/responses/Conflict' },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Operación'],
        summary: 'Verificar salud del microservicio',
        operationId: 'verificarSalud',
        responses: {
          '200': {
            description: 'Servicio operando correctamente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthDto' },
              },
            },
          },
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
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      Unauthorized: {
        description: 'Faltan credenciales o identidad no propagada',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      Forbidden: {
        description: 'El rol autenticado carece de permisos para la acción',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      NotFound: {
        description: 'El recurso solicitado no existe o se encuentra inactivo',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      Conflict: {
        description: 'Conflicto de estado, concurrencia o regla de dominio',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      PayloadTooLarge: {
        description: 'El tamaño de la petición excede el límite máximo de 64 KB',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      InternalServerError: {
        description: 'Error no controlado del servidor',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
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
          mesaId: { type: 'string', format: 'uuid' },
          numeroMesa: { type: 'integer', minimum: 1 },
          capacidad: { type: 'integer', minimum: 1 },
          zona: { type: 'string', minLength: 1, maxLength: 50 },
          estadoFisico: {
            type: 'string',
            enum: Object.values(EstadoMesa),
          },
          unionId: { type: 'string', format: 'uuid', nullable: true },
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
              ocupadaDesde: {
                type: 'string',
                format: 'date-time',
                nullable: true,
              },
              meseroId: { type: 'string', format: 'uuid', nullable: true },
            },
          },
        ],
      },
      CrearMesaRequestDto: {
        type: 'object',
        required: ['numeroMesa', 'capacidad', 'zona'],
        additionalProperties: false,
        properties: {
          numeroMesa: { type: 'integer', minimum: 1 },
          capacidad: { type: 'integer', minimum: 1 },
          zona: { type: 'string', minLength: 1, maxLength: 50 },
        },
      },
      ActualizarMesaRequestDto: {
        type: 'object',
        additionalProperties: false,
        properties: {
          numeroMesa: { type: 'integer', minimum: 1 },
          capacidad: { type: 'integer', minimum: 1 },
          zona: { type: 'string', minLength: 1, maxLength: 50 },
        },
      },
      OcuparMesaRequestDto: {
        type: 'object',
        required: ['comensales', 'meseroId'],
        additionalProperties: false,
        properties: {
          comensales: { type: 'integer', minimum: 1 },
          meseroId: { type: 'string', format: 'uuid' },
          reservaId: { type: 'string', format: 'uuid' },
          esperaId: { type: 'string', format: 'uuid' },
          forzarOcupacion: { type: 'boolean' },
          forzarSobrecupo: { type: 'boolean' },
        },
      },
      OcuparMesaResponseDto: {
        type: 'object',
        required: ['mesaId', 'estado', 'sessionId'],
        properties: {
          mesaId: { type: 'string', format: 'uuid' },
          estado: { type: 'string', enum: [EstadoMesa.OCUPADA] },
          sessionId: { type: 'string', format: 'uuid' },
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
          mesaId: { type: 'string', format: 'uuid' },
          estado: { type: 'string', enum: Object.values(EstadoMesa) },
        },
      },
      AsignarMeseroRequestDto: {
        type: 'object',
        required: ['meseroId'],
        additionalProperties: false,
        properties: {
          meseroId: { type: 'string', format: 'uuid' },
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
          asignacionId: { type: 'string', format: 'uuid' },
          mesaId: { type: 'string', format: 'uuid' },
          meseroId: { type: 'string', format: 'uuid' },
          fechaHoraInicio: { type: 'string', format: 'date-time' },
          fechaHoraFin: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
          activo: { type: 'boolean' },
        },
      },
      CrearReservaRequestDto: {
        type: 'object',
        required: ['mesaId', 'fecha', 'horaInicio', 'duracion', 'cantidadPersonas', 'cliente'],
        additionalProperties: false,
        properties: {
          mesaId: { type: 'string', format: 'uuid' },
          fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          horaInicio: {
            type: 'string',
            pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
          },
          duracion: { type: 'integer', minimum: 15, maximum: 480 },
          cantidadPersonas: { type: 'integer', minimum: 1 },
          cliente: {
            type: 'object',
            required: ['nombre', 'tel'],
            additionalProperties: false,
            properties: {
              nombre: { type: 'string', minLength: 1, maxLength: 100 },
              tel: {
                type: 'string',
                pattern: '^[0-9 +()-]{7,20}$',
              },
            },
          },
        },
      },
      CrearReservaResponseDto: {
        type: 'object',
        required: ['reservaId', 'mesaId', 'estado'],
        properties: {
          reservaId: { type: 'string', format: 'uuid' },
          mesaId: { type: 'string', format: 'uuid' },
          estado: { type: 'string', enum: [EstadoReserva.CONFIRMADA] },
        },
      },
      ActualizarReservaRequestDto: {
        type: 'object',
        additionalProperties: false,
        properties: {
          mesaId: { type: 'string', format: 'uuid' },
          fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          horaInicio: {
            type: 'string',
            pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
          },
          duracion: { type: 'integer', minimum: 15, maximum: 480 },
          cantidadPersonas: { type: 'integer', minimum: 1 },
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
          reservaId: { type: 'string', format: 'uuid' },
          mesaId: { type: 'string', format: 'uuid' },
          nombreContacto: { type: 'string', minLength: 1, maxLength: 100 },
          telefonoContacto: { type: 'string', pattern: '^[0-9 +()-]{7,20}$' },
          cantidadPersonas: { type: 'integer', minimum: 1 },
          fecha: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          horaInicio: {
            type: 'string',
            pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
          },
          horaFin: {
            type: 'string',
            pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$',
          },
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
            items: { type: 'string', format: 'uuid' },
          },
          totalPersonas: { type: 'integer', minimum: 1 },
          meseroId: { type: 'string', format: 'uuid' },
          forzarOcupacion: { type: 'boolean' },
          forzarSobrecupo: { type: 'boolean' },
        },
      },
      CrearUnionResponseDto: {
        type: 'object',
        required: ['unionId', 'mesasIds', 'estado', 'sessionId'],
        properties: {
          unionId: { type: 'string', format: 'uuid' },
          mesasIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
          },
          estado: { type: 'string', enum: [EstadoMesa.OCUPADA] },
          sessionId: { type: 'string', format: 'uuid' },
        },
      },
      LiberarUnionResponseDto: {
        type: 'object',
        required: ['mesasIds', 'estado'],
        properties: {
          mesasIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
          },
          estado: { type: 'string', enum: [EstadoMesa.LIMPIEZA_PENDIENTE] },
        },
      },
      UnionDto: {
        type: 'object',
        required: ['unionId', 'zona', 'mesasIds', 'estado', 'fechaCreacion', 'fechaDisolucion'],
        properties: {
          unionId: { type: 'string', format: 'uuid' },
          zona: { type: 'string', minLength: 1, maxLength: 50 },
          mesasIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
          },
          estado: {
            type: 'string',
            enum: Object.values(EstadoUnion),
          },
          fechaCreacion: { type: 'string', format: 'date-time' },
          fechaDisolucion: {
            type: 'string',
            format: 'date-time',
            nullable: true,
          },
        },
      },
      CrearEsperaRequestDto: {
        type: 'object',
        required: ['nombreCliente', 'telefonoContacto', 'cantidadPersonas'],
        additionalProperties: false,
        properties: {
          nombreCliente: { type: 'string', minLength: 1, maxLength: 100 },
          telefonoContacto: {
            type: 'string',
            pattern: '^[0-9 +()-]{7,20}$',
          },
          cantidadPersonas: { type: 'integer', minimum: 1 },
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
          esperaId: { type: 'string', format: 'uuid' },
          nombreCliente: { type: 'string', minLength: 1, maxLength: 100 },
          telefonoContacto: {
            type: 'string',
            pattern: '^[0-9 +()-]{7,20}$',
          },
          cantidadPersonas: { type: 'integer', minimum: 1 },
          horaLlegada: { type: 'string', format: 'date-time' },
          estado: {
            type: 'string',
            enum: Object.values(EstadoEspera),
          },
          idMesaAsignada: {
            type: 'string',
            format: 'uuid',
            nullable: true,
          },
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
