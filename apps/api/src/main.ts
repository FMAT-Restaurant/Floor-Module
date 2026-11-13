try {
  process.loadEnvFile?.();
} catch {
  // .env es opcional en entornos donde las variables se inyectan por contenedor/CI
}

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';
import { resolverCorsOrigin } from './gateways/sala.gateway';

const PUERTO_POR_DEFECTO = 8085;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configurarApp(app);

  // DT-05: CORS seguro con orígenes específicos o reflexión explícita con '*'
  app.enableCors({ origin: resolverCorsOrigin(process.env.CORS_ORIGIN), credentials: true });

  const puerto = Number(process.env.PORT) || PUERTO_POR_DEFECTO;
  await app.listen(puerto, '0.0.0.0');
  new Logger('Bootstrap').log(`Floor-Module API escuchando en http://0.0.0.0:${puerto}`);
}

void bootstrap();
