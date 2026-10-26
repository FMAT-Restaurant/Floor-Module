import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { EstadoMesa, type AsignacionDto, type MesaDto } from '@floor/shared';
import { AppModule } from '../../src/app.module';
import { configurarApp, PREFIJO_GLOBAL } from '../../src/app.setup';
import { firmarJwtHs256, JWT_ISSUER } from '../../src/common/guards/identity.guard';
import { CORRELATION_ID_HEADER } from '../../src/common/interceptors/correlation.interceptor';
import { RabbitMqPublisher } from '../../src/events/rabbitmq.publisher';
import { AsignacionesService } from '../../src/modules/mesas/asignaciones.service';
import { MesaEstadoService } from '../../src/modules/mesas/mesa-estado.service';
import { MesasService } from '../../src/modules/mesas/mesas.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const MESA_ID = 'a1000000-0000-4000-8000-000000000001';
const MESERO_ID = 'b1000000-0000-4000-8000-000000000001';

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

describe('BE-011 · Integración Seguridad, Correlación y Health Check', () => {
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

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(RabbitMqPublisher)
      .useValue(publisherMock)
      .overrideProvider(MesasService)
      .useValue({
        listar: jest.fn().mockResolvedValue([MESA_MOCK]),
        listarEnVivo: jest.fn().mockResolvedValue([]),
        obtener: jest.fn().mockResolvedValue(MESA_MOCK),
        crear: jest.fn().mockResolvedValue(MESA_MOCK),
        actualizar: jest.fn().mockResolvedValue(MESA_MOCK),
        darDeBaja: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(MesaEstadoService)
      .useValue({
        actualizarEstado: jest
          .fn()
          .mockResolvedValue({ mesaId: MESA_ID, estado: EstadoMesa.LIBRE }),
      })
      .overrideProvider(AsignacionesService)
      .useValue({
        asignar: jest.fn().mockResolvedValue(ASIGNACION_MOCK),
        listar: jest.fn().mockResolvedValue([ASIGNACION_MOCK]),
      })
      .compile();

    app = modulo.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configurarApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health y GET /api/v1/floor/health responden 200 con estado de Prisma y RabbitMQ y 503 cuando caen', async () => {
    const resDirecto = await fetch(`${baseUrl}/health`);
    expect(resDirecto.status).toBe(200);
    await expect(resDirecto.json()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      broker: 'up',
    });

    const resPerimetral = await fetch(`${baseUrl}/api/v1/floor/health`);
    expect(resPerimetral.status).toBe(200);
    await expect(resPerimetral.json()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      broker: 'up',
    });

    publisherMock.isConnected.mockReturnValueOnce(false);
    const resDegraded = await fetch(`${baseUrl}/api/v1/floor/health`);
    expect(resDegraded.status).toBe(503);
    await expect(resDegraded.json()).resolves.toEqual({
      status: 'degraded',
      db: 'up',
      broker: 'down',
    });
  });

  it('rechaza con 403 PASSWORD_CHANGE_REQUIRED cuando x-password-temporary es true o mustChangePassword es true', async () => {
    const resHeader = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
      headers: {
        'x-user-id': MESERO_ID,
        'x-user-roles': 'MESERO',
        'x-password-temporary': 'true',
      },
    });
    expect(resHeader.status).toBe(403);
    await expect(resHeader.json()).resolves.toMatchObject({
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
    });

    const tokenTemp = firmarJwtHs256({
      sub: MESERO_ID,
      roles: ['MESERO'],
      iss: JWT_ISSUER,
      mustChangePassword: true,
    });
    const resJwt = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
      headers: {
        Authorization: `Bearer ${tokenTemp}`,
      },
    });
    expect(resJwt.status).toBe(403);
    await expect(resJwt.json()).resolves.toMatchObject({
      statusCode: 403,
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  });

  it('protege endpoints con IdentityGuard (401) y RolesGuard (403) y propaga x-correlation-id', async () => {
    const sinAuth = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`);
    expect(sinAuth.status).toBe(401);

    const tokenMesero = firmarJwtHs256({
      sub: MESERO_ID,
      roles: ['MESERO'],
      iss: JWT_ISSUER,
    });

    const prohibido = await fetch(`${baseUrl}/${PREFIJO_GLOBAL}/mesas`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${tokenMesero}`,
        [CORRELATION_ID_HEADER]: 'corr-test-123',
      },
      body: JSON.stringify({ numeroMesa: 1, capacidad: 4, zona: 'Principal' }),
    });
    expect(prohibido.status).toBe(403);
    expect(prohibido.headers.get(CORRELATION_ID_HEADER)).toBe('corr-test-123');
  });
});
