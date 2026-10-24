import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { EstadoMesa } from '@floor/shared';
import {
  CurrentUser,
  DEFAULT_MESERO_ID,
  extraerMeseroDeRequest,
  MeseroActual,
  resolverMeseroId,
  UsuarioActual,
} from '../../common/decorators/usuario-actual.decorator';
import { MesaEstadoController } from './mesa-estado.controller';
import type { MesaEstadoService } from './mesa-estado.service';
import { OcuparMesaDto, ocuparMesaDtoSchema } from './ocupar-mesa.dto';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'd1000000-0000-4000-8000-000000000009';
const RESERVA_ID = 'b1000000-0000-4000-8000-000000000002';
const ESPERA_ID = 'c1000000-0000-4000-8000-000000000003';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440099';

describe('MesaEstadoController', () => {
  it('PATCH :mesaId/estado delega en el servicio con el mesaId de la ruta y el cuerpo validado', async () => {
    const respuesta = { mesaId: MESA_ID, estado: EstadoMesa.LIBRE };
    const servicio = {
      actualizarEstado: jest.fn().mockResolvedValue(respuesta),
    } as unknown as jest.Mocked<MesaEstadoService>;
    const controlador = new MesaEstadoController(servicio);

    const resultado = await controlador.actualizarEstado(
      { mesaId: MESA_ID },
      { estado: EstadoMesa.LIBRE },
    );

    expect(resultado).toBe(respuesta);
    expect(servicio.actualizarEstado).toHaveBeenCalledWith(MESA_ID, { estado: EstadoMesa.LIBRE });
  });

  it('POST :mesaId/ocupar delega en el servicio inyectando el meseroId del decorador de usuario/auth (objeto o string param)', async () => {
    const respuesta = { mesaId: MESA_ID, estado: EstadoMesa.OCUPADA, sessionId: SESSION_ID };
    const servicio = {
      ocupar: jest.fn().mockResolvedValue(respuesta),
    } as unknown as jest.Mocked<MesaEstadoService>;
    const controlador = new MesaEstadoController(servicio);

    const cuerpo = { comensales: 4, forzarOcupacion: true, forzarSobrecupo: false };
    const resultado = await controlador.ocupar(
      { mesaId: MESA_ID },
      cuerpo,
      { id: MESERO_ID },
      'corr-001',
    );

    expect(resultado).toBe(respuesta);
    expect(servicio.ocupar).toHaveBeenCalledWith(MESA_ID, cuerpo, MESERO_ID, 'corr-001');

    // También soporta param como string directo
    await controlador.ocupar(MESA_ID, cuerpo, MESERO_ID, 'corr-002');
    expect(servicio.ocupar).toHaveBeenCalledWith(MESA_ID, cuerpo, MESERO_ID, 'corr-002');
  });

  it('ocuparMesaDtoSchema valida comensales obligatorio, banderas forzar opcionales y campos UUID', () => {
    const dtoInstancia = new OcuparMesaDto();
    dtoInstancia.comensales = 4;
    expect(dtoInstancia.comensales).toBe(4);

    expect(ocuparMesaDtoSchema.safeParse(null).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse('invalido').success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse([1, 2]).success).toBe(false);

    expect(ocuparMesaDtoSchema.safeParse({ comensales: 4 }).success).toBe(true);
    const parseCompleto = ocuparMesaDtoSchema.safeParse({
      comensales: 6,
      forzarOcupacion: true,
      forzarSobrecupo: true,
      meseroId: MESERO_ID,
      reservaId: RESERVA_ID,
      esperaId: ESPERA_ID,
    });
    expect(parseCompleto.success).toBe(true);
    if (parseCompleto.success) {
      expect(parseCompleto.data).toEqual({
        comensales: 6,
        forzarOcupacion: true,
        forzarSobrecupo: true,
        meseroId: MESERO_ID,
        reservaId: RESERVA_ID,
        esperaId: ESPERA_ID,
      });
    }

    expect(ocuparMesaDtoSchema.safeParse({}).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 0 }).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, forzarOcupacion: 'no' }).success).toBe(
      false,
    );
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, forzarSobrecupo: 'si' }).success).toBe(
      false,
    );
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, meseroId: 'no-es-uuid' }).success).toBe(
      false,
    );
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, reservaId: 123 }).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, esperaId: 'abc' }).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, desconocida: true }).success).toBe(false);
  });

  it('extraerMeseroDeRequest, resolverMeseroId y UsuarioActual cubren todas las fuentes de identidad', () => {
    expect(extraerMeseroDeRequest(null)).toBeUndefined();
    expect(extraerMeseroDeRequest('invalido')).toBeUndefined();
    expect(extraerMeseroDeRequest({})).toBeUndefined();

    expect(extraerMeseroDeRequest({ user: MESERO_ID })).toBe(MESERO_ID);
    expect(extraerMeseroDeRequest({ user: '   ' })).toBeUndefined();
    expect(extraerMeseroDeRequest({ user: { meseroId: MESERO_ID } })).toBe(MESERO_ID);
    expect(extraerMeseroDeRequest({ user: { id: MESERO_ID } })).toBe(MESERO_ID);
    expect(extraerMeseroDeRequest({ user: { sub: MESERO_ID } })).toBe(MESERO_ID);
    expect(extraerMeseroDeRequest({ user: { userId: MESERO_ID } })).toBe(MESERO_ID);

    expect(extraerMeseroDeRequest({ headers: { 'x-user-id': MESERO_ID } })).toBe(MESERO_ID);
    expect(extraerMeseroDeRequest({ headers: { 'x-mesero-id': MESERO_ID } })).toBe(MESERO_ID);

    const payloadSub = Buffer.from(JSON.stringify({ sub: MESERO_ID })).toString('base64url');
    expect(
      extraerMeseroDeRequest({
        headers: { authorization: `Bearer header.${payloadSub}.sig` },
      }),
    ).toBe(MESERO_ID);

    const payloadUserId = Buffer.from(JSON.stringify({ userId: MESERO_ID })).toString('base64url');
    expect(
      extraerMeseroDeRequest({
        headers: { authorization: `Bearer header.${payloadUserId}.sig` },
      }),
    ).toBe(MESERO_ID);

    const payloadId = Buffer.from(JSON.stringify({ id: MESERO_ID })).toString('base64url');
    expect(
      extraerMeseroDeRequest({
        headers: { authorization: `Bearer header.${payloadId}.sig` },
      }),
    ).toBe(MESERO_ID);

    const payloadVacio = Buffer.from(JSON.stringify({})).toString('base64url');
    expect(
      extraerMeseroDeRequest({
        headers: { authorization: `Bearer header.${payloadVacio}.sig` },
      }),
    ).toBeUndefined();

    expect(
      extraerMeseroDeRequest({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      }),
    ).toBeUndefined();

    expect(
      extraerMeseroDeRequest({
        headers: { authorization: 'Bearer tokenSinPuntos' },
      }),
    ).toBeUndefined();

    expect(
      extraerMeseroDeRequest({
        headers: { authorization: 'Bearer header.%%%invalido%%%.sig', 'x-user-id': '   ' },
        body: { meseroId: MESERO_ID },
      }),
    ).toBe(MESERO_ID);

    expect(resolverMeseroId(undefined, MESERO_ID)).toBe(MESERO_ID);
    expect(resolverMeseroId(null, undefined)).toBe(DEFAULT_MESERO_ID);
    expect(CurrentUser).toBe(UsuarioActual);
    expect(MeseroActual).toBe(UsuarioActual);

    // Probar la fábrica del param decorator UsuarioActual
    class ControladorPrueba {
      probar(@UsuarioActual() _usuario?: string) {}
    }
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ControladorPrueba,
      'probar',
    ) as Record<string, { factory: (data: unknown, ctx: ExecutionContext) => string | undefined }>;
    const entrada = Object.values(metadata)[0];
    const ctxMock = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: MESERO_ID } }),
      }),
    } as unknown as ExecutionContext;
    expect(entrada?.factory(undefined, ctxMock)).toBe(MESERO_ID);
  });
});
