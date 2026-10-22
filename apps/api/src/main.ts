import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';

const PUERTO_POR_DEFECTO = process.env.NODE_ENV === 'production' ? 8085 : 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configurarApp(app);

  // DT-05: CORS seguro con orígenes específicos
  const origenes = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];
  app.enableCors({ origin: origenes, credentials: true });

  const puerto = Number(process.env.PORT) || PUERTO_POR_DEFECTO;
  await app.listen(puerto);
  new Logger('Bootstrap').log(`Floor-Module API escuchando en http://localhost:${puerto}`);
}

void bootstrap();
