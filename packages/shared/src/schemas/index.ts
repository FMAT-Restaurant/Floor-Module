export {
  booleanQuerySchema,
  duracionMinutosQuerySchema,
  duracionMinutosSchema,
  fechaSchema,
  horaSchema,
  isoDateTimeSchema,
  nombreClienteSchema,
  nonEmptyStringSchema,
  positiveIntQuerySchema,
  positiveIntSchema,
  telefonoSchema,
  uuidSchema,
  zonaSchema,
} from './common.js';

export { apiErrorResponseSchema, type ApiErrorResponseDto } from './api-error.js';

export {
  actualizarMesaSchema,
  crearMesaSchema,
  listarMesasQuerySchema,
  mesaDtoSchema,
  mesaEnVivoDtoSchema,
  mesaParamSchema,
  type ActualizarMesaRequestDto,
  type CrearMesaRequestDto,
  type ListarMesasQueryDto,
  type MesaDto,
  type MesaEnVivoDto,
  type MesaParamDto,
} from './mesas.js';

export {
  actualizarEstadoMesaResponseSchema,
  actualizarEstadoMesaSchema,
  ocuparMesaResponseSchema,
  ocuparMesaSchema,
  type ActualizarEstadoMesaRequestDto,
  type ActualizarEstadoMesaResponseDto,
  type OcuparMesaRequestDto,
  type OcuparMesaResponseDto,
} from './ciclo-operativo.js';

export {
  asignacionDtoSchema,
  asignarMeseroSchema,
  listarAsignacionesQuerySchema,
  type AsignacionDto,
  type AsignarMeseroRequestDto,
  type ListarAsignacionesQueryDto,
} from './meseros.js';

export {
  actualizarReservaSchema,
  clienteReservaSchema,
  consultarDisponibilidadQuerySchema,
  crearReservaResponseSchema,
  crearReservaSchema,
  listarReservasQuerySchema,
  reservaDtoSchema,
  reservaParamSchema,
  type ActualizarReservaRequestDto,
  type ClienteReservaDto,
  type ConsultarDisponibilidadQueryDto,
  type CrearReservaRequestDto,
  type CrearReservaResponseDto,
  type ListarReservasQueryDto,
  type ReservaDto,
  type ReservaParamDto,
} from './reservas.js';

export {
  crearUnionResponseSchema,
  crearUnionSchema,
  liberarUnionResponseSchema,
  listarUnionesQuerySchema,
  unionDtoSchema,
  unionParamSchema,
  type CrearUnionRequestDto,
  type CrearUnionResponseDto,
  type LiberarUnionResponseDto,
  type ListarUnionesQueryDto,
  type UnionDto,
  type UnionParamDto,
} from './uniones.js';

export {
  actualizarEstadoEsperaSchema,
  crearEsperaSchema,
  esperaDtoSchema,
  esperaParamSchema,
  listarEsperaQuerySchema,
  type ActualizarEstadoEsperaRequestDto,
  type CrearEsperaRequestDto,
  type EsperaDto,
  type EsperaParamDto,
  type ListarEsperaQueryDto,
} from './espera.js';

export { healthDtoSchema, type HealthDto } from './operacion.js';

export {
  gatewayAuthHeadersSchema,
  roleSchema,
  type GatewayAuthHeadersDto,
  type RoleDto,
} from './auth.js';
