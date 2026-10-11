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
} from './common';

export { apiErrorResponseSchema, type ApiErrorResponseDto } from './api-error';

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
} from './mesas';

export {
  actualizarEstadoMesaResponseSchema,
  actualizarEstadoMesaSchema,
  ocuparMesaResponseSchema,
  ocuparMesaSchema,
  type ActualizarEstadoMesaRequestDto,
  type ActualizarEstadoMesaResponseDto,
  type OcuparMesaRequestDto,
  type OcuparMesaResponseDto,
} from './ciclo-operativo';

export {
  asignacionDtoSchema,
  asignarMeseroSchema,
  listarAsignacionesQuerySchema,
  type AsignacionDto,
  type AsignarMeseroRequestDto,
  type ListarAsignacionesQueryDto,
} from './meseros';

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
} from './reservas';

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
} from './uniones';

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
} from './espera';

export { healthDtoSchema, type HealthDto } from './operacion';

export {
  gatewayAuthHeadersSchema,
  roleSchema,
  type GatewayAuthHeadersDto,
  type RoleDto,
} from './auth';
