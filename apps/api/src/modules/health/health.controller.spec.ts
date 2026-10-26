import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { RabbitMqPublisher } from '../../events/rabbitmq.publisher';
import { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthModule } from './health.module';

describe('HealthController & HealthModule (BE-011, SPEC §5.7, RNF-006)', () => {
  it('retorna HTTP 200 y { status: "ok", db: "up", broker: "up" } cuando PostgreSQL y RabbitMQ están activos', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as jest.Mocked<PrismaService>;
    const publisher = {
      isConnected: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<RabbitMqPublisher>;
    const resMock = { status: jest.fn().mockReturnThis() } as unknown as Response;

    const controlador = new HealthController(prisma, publisher);
    const resultado = await controlador.verificar(resMock);

    expect(resultado).toEqual({
      status: 'ok',
      db: 'up',
      broker: 'up',
    });
    expect(resMock.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(publisher.isConnected).toHaveBeenCalledTimes(1);
  });

  it('reporta HTTP 503, db: "down" y status: "degraded" si falla la consulta a PostgreSQL', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('DB connection error')),
    } as unknown as jest.Mocked<PrismaService>;
    const publisher = {
      isConnected: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<RabbitMqPublisher>;
    const resMock = { status: jest.fn().mockReturnThis() } as unknown as Response;

    const controlador = new HealthController(prisma, publisher);
    const resultado = await controlador.check(resMock);

    expect(resultado).toEqual({
      status: 'degraded',
      db: 'down',
      broker: 'up',
    });
    expect(resMock.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('reporta HTTP 503, broker: "down" y status: "degraded" si el canal AMQP de RabbitMQ está inactivo o lanza error', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as jest.Mocked<PrismaService>;
    const publisherDesconectado = {
      isConnected: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<RabbitMqPublisher>;
    const publisherConExcepcion = {
      isConnected: jest.fn().mockImplementation(() => {
        throw new Error('AMQP state error');
      }),
    } as unknown as jest.Mocked<RabbitMqPublisher>;
    const resDesconectadoMock = { status: jest.fn().mockReturnThis() } as unknown as Response;
    const resExcepcionMock = { status: jest.fn().mockReturnThis() } as unknown as Response;

    const resDesconectado = await new HealthController(prisma, publisherDesconectado).check(
      resDesconectadoMock,
    );
    const resExcepcion = await new HealthController(prisma, publisherConExcepcion).check(
      resExcepcionMock,
    );

    expect(resDesconectado).toEqual({
      status: 'degraded',
      db: 'up',
      broker: 'down',
    });
    expect(resDesconectadoMock.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(resExcepcion).toEqual({
      status: 'degraded',
      db: 'up',
      broker: 'down',
    });
    expect(resExcepcionMock.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('compila HealthModule e inyecta HealthController con dependencias simuladas', async () => {
    const modulo = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) })
      .overrideProvider(RabbitMqPublisher)
      .useValue({ isConnected: jest.fn().mockReturnValue(true) })
      .compile();

    const controlador = modulo.get(HealthController);
    await expect(controlador.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      broker: 'up',
    });
  });
});
