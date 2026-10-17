import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';

const PUERTO_POR_DEFECTO = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configurarApp(app);

  // Enable CORS for frontend client
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const puerto = Number(process.env.PORT) || PUERTO_POR_DEFECTO;
  await app.listen(puerto);
  new Logger('Bootstrap').log(`Floor-Module API escuchando en http://localhost:${puerto}`);
}

void bootstrap();
