import { cicloHandlers } from './ciclo';
import { esperaHandlers } from './espera';
import { mesasHandlers } from './mesas';
import { meserosHandlers } from './meseros';
import { operacionHandlers } from './operacion';
import { reservasHandlers } from './reservas';
import { unionesHandlers } from './uniones';
import { wsHandlers } from './ws';

export const handlers = [
  ...unionesHandlers,
  ...mesasHandlers,
  ...cicloHandlers,
  ...meserosHandlers,
  ...reservasHandlers,
  ...esperaHandlers,
  ...operacionHandlers,
  ...wsHandlers,
];

export {
  cicloHandlers,
  esperaHandlers,
  mesasHandlers,
  meserosHandlers,
  operacionHandlers,
  reservasHandlers,
  unionesHandlers,
  wsHandlers,
};
