import { describe, expect, it } from 'vitest';
import {
  asignacionDtoSchema,
  esperaDtoSchema,
  gatewayAuthHeadersSchema,
  mesaDtoSchema,
  mesaEnVivoDtoSchema,
  reservaDtoSchema,
  roleSchema,
  unionDtoSchema,
} from '../schemas/index.js';
import {
  createGatewayAuthHeaders,
  FIXTURE_AUTH_USERS,
  fixtureAsignaciones,
  fixtureEsperaMesaDisponiblePayload,
  fixtureListaEspera,
  fixtureMesaEstadoActualizadoPayload,
  fixtureMesas,
  fixtureMesasEnVivo,
  fixtureMeserosCatalogo,
  fixtureReservaProximaAlertaPayload,
  fixtureReservas,
  fixtureUniones,
} from './index.js';

describe('Shared Fixtures Contract Conformance', () => {
  it('all fixtureMesas conform to mesaDtoSchema', () => {
    expect(fixtureMesas.length).toBeGreaterThan(0);
    fixtureMesas.forEach((mesa) => {
      const parsed = mesaDtoSchema.safeParse(mesa);
      expect(parsed.success).toBe(true);
    });
  });

  it('all fixtureMesasEnVivo conform to mesaEnVivoDtoSchema', () => {
    expect(fixtureMesasEnVivo.length).toBeGreaterThan(0);
    fixtureMesasEnVivo.forEach((mesa) => {
      const parsed = mesaEnVivoDtoSchema.safeParse(mesa);
      expect(parsed.success).toBe(true);
    });
  });

  it('all fixtureReservas conform to reservaDtoSchema', () => {
    expect(fixtureReservas.length).toBeGreaterThan(0);
    fixtureReservas.forEach((reserva) => {
      const parsed = reservaDtoSchema.safeParse(reserva);
      expect(parsed.success).toBe(true);
    });
  });

  it('all fixtureUniones conform to unionDtoSchema', () => {
    expect(fixtureUniones.length).toBeGreaterThan(0);
    fixtureUniones.forEach((union) => {
      const parsed = unionDtoSchema.safeParse(union);
      expect(parsed.success).toBe(true);
    });
  });

  it('all fixtureListaEspera conform to esperaDtoSchema', () => {
    expect(fixtureListaEspera.length).toBeGreaterThan(0);
    fixtureListaEspera.forEach((espera) => {
      const parsed = esperaDtoSchema.safeParse(espera);
      expect(parsed.success).toBe(true);
    });
  });

  it('all fixtureAsignaciones conform to asignacionDtoSchema', () => {
    expect(fixtureAsignaciones.length).toBeGreaterThan(0);
    fixtureAsignaciones.forEach((asignacion) => {
      const parsed = asignacionDtoSchema.safeParse(asignacion);
      expect(parsed.success).toBe(true);
    });
  });

  it('catalog of meseros contains valid identifiers and names', () => {
    expect(fixtureMeserosCatalogo.length).toBeGreaterThan(0);
    fixtureMeserosCatalogo.forEach((mesero) => {
      expect(mesero.meseroId).toBeDefined();
      expect(mesero.nombre.length).toBeGreaterThan(0);
      expect(mesero.activo).toBe(true);
    });
  });

  it('fixture payloads for events have expected fields and structure', () => {
    expect(fixtureMesaEstadoActualizadoPayload.mesaId).toBeDefined();
    expect(fixtureMesaEstadoActualizadoPayload.estado).toBeDefined();
    expect(fixtureReservaProximaAlertaPayload.reservaId).toBeDefined();
    expect(fixtureEsperaMesaDisponiblePayload.mesaId).toBeDefined();
    expect(fixtureEsperaMesaDisponiblePayload.cliente.nombre).toBeDefined();
  });

  it('all FIXTURE_AUTH_USERS have valid UUIDs, staff IDs, roles and can generate valid gateway headers', () => {
    const users = Object.values(FIXTURE_AUTH_USERS);
    expect(users.length).toBeGreaterThanOrEqual(4);

    users.forEach((user) => {
      // Validate roles
      const roleParsed = roleSchema.safeParse(user.roles);
      expect(roleParsed.success).toBe(true);

      // Validate gateway headers without temporary password
      const headers = createGatewayAuthHeaders(user);
      const headersParsed = gatewayAuthHeadersSchema.safeParse(headers);
      expect(headersParsed.success).toBe(true);

      // Validate gateway headers with temporary password
      const tempHeaders = createGatewayAuthHeaders(user, { passwordTemporary: true });
      const tempParsed = gatewayAuthHeadersSchema.safeParse(tempHeaders);
      expect(tempParsed.success).toBe(true);
      expect(tempHeaders['x-password-temporary']).toBe('true');
    });
  });
});
