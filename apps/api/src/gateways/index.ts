export { GatewaysModule } from './gateways.module';
export {
  esSalaTematicaValida,
  resolverCorsOrigin,
  resolverSalasSolicitadas,
  SALA_WS_EVENTS,
  SALA_WS_NAMESPACE,
  SALA_WS_ROOMS,
  SALAS_TEMATICAS_PERMITIDAS,
  SalaWebSocketGateway,
  type JoinSalaAck,
  type JoinSalaPayload,
  type SalaTematica,
} from './sala.gateway';
export {
  DEFAULT_JWT_SECRET,
  extraerTokenHandshake,
  firmarTokenJwtHs256,
  verificarTokenJwtHs256,
  type WsJwtPayload,
} from './ws-jwt.util';
