import { EstadoMesa } from '@floor/shared';
import {
  DEFAULT_MESERO_ID,
  extraerMeseroDeRequest,
} from '../../common/decorators/usuario-actual.decorator';
import { ocuparMesaDtoSchema } from './dto/ocupar-mesa.dto';
import { MesaEstadoController } from './mesa-estado.controller';
import type { MesaEstadoService } from './mesa-estado.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'd1000000-0000-4000-8000-000000000009';
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

  it('POST :mesaId/ocupar delega en el servicio inyectando el meseroId del decorador de usuario/auth', async () => {
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
  });

  it('ocuparMesaDtoSchema valida comensales obligatorio y banderas forzar opcionales', () => {
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 4 }).success).toBe(true);
    expect(
      ocuparMesaDtoSchema.safeParse({
        comensales: 6,
        forzarOcupacion: true,
        forzarSobrecupo: true,
      }).success,
    ).toBe(true);
    expect(ocuparMesaDtoSchema.safeParse({}).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 0 }).success).toBe(false);
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, forzarSobrecupo: 'si' }).success).toBe(
      false,
    );
    expect(ocuparMesaDtoSchema.safeParse({ comensales: 2, desconocida: true }).success).toBe(false);
  });

  it('extraerMeseroDeRequest obtiene meseroId desde req.user, X-User-Id o JWT Bearer', () => {
    expect(extraerMeseroDeRequest({ user: { sub: MESERO_ID } })).toBe(MESERO_ID);
    expect(extraerMeseroDeRequest({ headers: { 'x-user-id': MESERO_ID } })).toBe(MESERO_ID);

    const payloadBase64 = Buffer.from(JSON.stringify({ sub: MESERO_ID })).toString('base64url');
    expect(
      extraerMeseroDeRequest({
        headers: { authorization: `Bearer header.${payloadBase64}.sig` },
      }),
    ).toBe(MESERO_ID);
    expect(DEFAULT_MESERO_ID).toBeDefined();
  });
});
