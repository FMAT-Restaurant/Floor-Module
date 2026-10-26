import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoMesa, type AsignacionDto, type MesaDto } from '@floor/shared';
import { AppModule } from '../../app.module';
import { configurarApp, PREFIJO_GLOBAL } from '../../app.setup';
import { firmarJwtHs256, JWT_ISSUER } from '../../common/guards/identity.guard';
import { CORRELATION_ID_HEADER } from '../../common/interceptors/correlation.interceptor';
import { RabbitMqPublisher } from '../../events/rabbitmq.publisher';
import { PrismaService } from '../../prisma/prisma.service';
import { AsignacionesService } from '../mesas/asignaciones.service';
import { MesaEstadoService } from '../mesas/mesa-estado.service';
import { MesasService } from '../mesas/mesas.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'b1000000-0000-4000-8000-000000000001';
const ADMIN_ID = 'e1000000-0000-4000-8000-000000000001';

const MESA_MOCK: MesaDto = {
  mesaId: MESA_ID,
  numeroMesa: 1,
  capacidad: 4,
  zona: 'Principal',
  estadoFisico: EstadoMesa.LIBRE,
  unionId: null,
  activo: true,
};

const ASIGNACION_MOCK: AsignacionDto = {
  asignacionId: 'f1000000-0000-4000-8000-000000000001',
  mesaId: MESA_ID,
  meseroId: MESERO_ID,
  fechaHoraInicio: '2026-10-24T18:00:00.000Z',
  fechaHoraFin: null,
  activo: true,
};

describe('Integración HTTP BE-011: IdentityGuard, RolesGuard, CorrelationInterceptor y /health', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  const prismaMock = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  const publisherMock = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
  };

  const mesasServiceMock = {
    listar: jest.fn().mockResolvedValue([MESA_MOCK]),
    listarEnVivo: jest
      .fn()
      .mockResolvedValue([
        { ...MESA_MOCK, tieneReservaProxima: false, ocupadaDesde: null, meseroId: null },
      ]),
    obtener: jest.fn().mockResolvedValue(MESA_MOCK),
    crear: jest.fn().mockResolvedValue(MESA_MOCK),
    actualizar: jest.fn().mockResolvedValue(MESA_MOCK),
    darDeBaja: jest.fn().mockResolvedValue(undefined),
  };

  const mesaEstadoServiceMock = {
    actualizarEstado: jest.fn().mockResolvedValue({ mesaId: MESA_ID, estado: EstadoMesa.LIBRE }),
  };

  const asignacionesServiceMock = {
    asignar: jest.fn().mockResolvedValue(ASIGNACION_MOCK),
    listar: jest.fn().mockResolvedValue([ASIGNACION_MOCK]),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(RabbitMqPublisher)
      .useValue(publisherMock)
      .overrideProvider(MesasService)
      .useValue(mesasServiceMock)
      .overrideProvider(MesaEstadoService)
      .useValue(mesaEstadoServiceMock)
      .overrideProvider(AsignacionesService)
      .useValue(asignacionesServiceMock)
      .compile();

    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    publisherMock.isConnected.mockReturnValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health y /api/v1/floor/health (SPEC §5.7, INT-001)', () => {
    it('expone GET /health y GET /api/v1/floor/health sin requerir autenticación y reporta PostgreSQL y RabbitMQ up', async () => {
      const resDirecto = await fetch(`${baseUrl}/health`);
      const bodyDirecto = await resDirecto.json();

      expect(resDirecto.status).toBe(200);
      expect(bodyDirecto).toEqual({
        status: 'ok',
        db: 'up',
        broker: 'up',
      });
      expect(resDirecto.headers.get(CORRELATION_ID_HEADER)).toEqual(expect.any(String));

      const resPerimetral = await fetch(`${baseUrl}/api/v1/floor/health`);
      const bodyPerimetral = await resPerimetral.json();

      expect(resPerimetral.status).toBe(200);
      expect(bodyPerimetral).toEqual({
        status: 'ok',
        db: 'up',
        broker: 'up',
      });
    });

    it('reporta estado degraded con HTTP 503 cuando PostgreSQL o el canal AMQP fallan', async () => {
      prismaMock.$queryRaw.mockRejectedValueOnce(new Error('Postgres offline'));
      publisherMock.isConnected.mockReturnValueOnce(false);

      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toEqual({
        status: 'degraded',
        db: 'down',
        broker: 'down',
      });
    });
  });

  describe('IdentityGuard y Autenticación (Kong + Fallback JWT HS256)', () => {
    it('rechaza con 401 NO_AUTENTICADO si no hay cabeceras de Kong ni token Bearer', async () => {
      const res = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toMatchObject({
        statusCode: 401,
        code: 'NO_AUTENTICADO',
      });
      expect(res.headers.get(CORRELATION_ID_HEADER)).toEqual(expect.any(String));
    });

    it('autentica con cabeceras de Kong cuando X-Password-Temporary no es true', async () => {
      const res = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        headers: {
          'X-User-Id': MESERO_ID,
          'X-Staff-Id': 'M000104',
          'X-User-Roles': 'MESERO',
          'X-User-Permissions': 'mesas:read',
          'X-Password-Temporary': 'false',
        },
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual([MESA_MOCK]);
    });

    it('rechaza con 403 PASSWORD_CHANGE_REQUIRED cuando X-Password-Temporary es true o JWT tiene mustChangePassword: true', async () => {
      const resKong = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        headers: {
          'X-User-Id': MESERO_ID,
          'X-Staff-Id': 'M000104',
          'X-User-Roles': 'MESERO',
          'X-Password-Temporary': 'true',
        },
      });

      expect(resKong.status).toBe(403);
      await expect(resKong.json()).resolves.toMatchObject({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });

      const tokenProvisional = firmarJwtHs256({
        sub: MESERO_ID,
        roles: ['MESERO'],
        iss: JWT_ISSUER,
        mustChangePassword: true,
      });

      const resJwt = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        headers: {
          Authorization: `Bearer ${tokenProvisional}`,
        },
      });

      expect(resJwt.status).toBe(403);
      await expect(resJwt.json()).resolves.toMatchObject({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    });

    it('autentica por fallback local usando JWT HS256 con iss urn:fmat:restaurant:auth', async () => {
      const token = firmarJwtHs256({
        sub: MESERO_ID,
        staffId: 'M000104',
        roles: ['MESERO'],
        iss: JWT_ISSUER,
      });

      const res = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/estado-en-vivo`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
    });

    it('rechaza con 401 cuando el JWT tiene un emisor distinto a urn:fmat:restaurant:auth', async () => {
      const token = firmarJwtHs256({
        sub: MESERO_ID,
        roles: ['MESERO'],
        iss: 'urn:fmat:otro:servicio',
      });

      const res = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('RolesGuard y Matriz de Autorización (SPEC §1.1)', () => {
    it('rechaza con 403 NO_AUTORIZADO cuando MESERO intenta crear, editar o dar de baja una mesa', async () => {
      const headersMesero = {
        'content-type': 'application/json',
        'X-User-Id': MESERO_ID,
        'X-User-Roles': 'MESERO',
      };

      const resPost = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        method: 'POST',
        headers: headersMesero,
        body: JSON.stringify({ numeroMesa: 10, capacidad: 4, zona: 'Terraza' }),
      });
      const resPatch = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}`, {
        method: 'PATCH',
        headers: headersMesero,
        body: JSON.stringify({ capacidad: 6 }),
      });
      const resDelete = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}`, {
        method: 'DELETE',
        headers: headersMesero,
      });

      expect(resPost.status).toBe(403);
      expect(await resPost.json()).toMatchObject({
        statusCode: 403,
        code: 'NO_AUTORIZADO',
      });
      expect(resPatch.status).toBe(403);
      expect(resDelete.status).toBe(403);
    });

    it('permite a ADMINISTRADOR ejecutar el CRUD de mesas (POST, PATCH, DELETE)', async () => {
      const headersAdmin = {
        'content-type': 'application/json',
        'X-User-Id': ADMIN_ID,
        'X-Staff-Id': 'ADMIN',
        'X-User-Roles': 'ADMINISTRADOR',
      };

      const resPost = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        method: 'POST',
        headers: headersAdmin,
        body: JSON.stringify({ numeroMesa: 10, capacidad: 4, zona: 'Terraza' }),
      });
      const resPatch = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}`, {
        method: 'PATCH',
        headers: headersAdmin,
        body: JSON.stringify({ capacidad: 6 }),
      });
      const resDelete = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}`, {
        method: 'DELETE',
        headers: headersAdmin,
      });

      expect(resPost.status).toBe(201);
      expect(resPatch.status).toBe(200);
      expect(resDelete.status).toBe(204);
    });

    it('rechaza con 403 a MESERO en PUT /mesas/:mesaId/mesero pero autoriza a HOST y ROL_CAPITAN', async () => {
      const body = JSON.stringify({ meseroId: MESERO_ID });

      const resMesero = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}/mesero`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'X-User-Id': MESERO_ID,
          'X-User-Roles': 'MESERO',
        },
        body,
      });
      const resCapitan = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}/mesero`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'X-User-Id': ADMIN_ID,
          'X-User-Roles': 'ROL_CAPITAN',
        },
        body,
      });

      expect(resMesero.status).toBe(403);
      expect(resCapitan.status).toBe(200);
    });

    it('permite a MESERO consultar mesa por ID, cambiar estado físico y listar asignaciones', async () => {
      const headersMesero = {
        'content-type': 'application/json',
        'X-User-Id': MESERO_ID,
        'X-User-Roles': 'MESERO',
      };

      const resDetalle = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}`, {
        headers: headersMesero,
      });
      const resEstado = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas/${MESA_ID}/estado`, {
        method: 'PATCH',
        headers: headersMesero,
        body: JSON.stringify({ estado: 'Libre' }),
      });
      const resAsignaciones = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/asignaciones`, {
        headers: headersMesero,
      });

      expect(resDetalle.status).toBe(200);
      expect(resEstado.status).toBe(200);
      expect(resAsignaciones.status).toBe(200);
    });
  });

  describe('CorrelationInterceptor y Trazabilidad JSON', () => {
    it('propaga x-correlation-id enviado por el cliente en cabeceras de respuesta y logs JSON', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const correlationId = 'corr-id-personalizado-999';

      const res = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
        headers: {
          'X-User-Id': ADMIN_ID,
          'X-User-Roles': 'ADMINISTRADOR',
          [CORRELATION_ID_HEADER]: correlationId,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(correlationId);

      const logsJson = logSpy.mock.calls
        .map((call) => call[0])
        .filter((msg): msg is string => typeof msg === 'string' && msg.includes(correlationId));
      expect(logsJson.length).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(logsJson[0])).toMatchObject({
        correlationId,
        method: 'GET',
        userId: ADMIN_ID,
      });

      logSpy.mockRestore();
    });
  });
});
