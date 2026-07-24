import { NestFactory }           from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule }      from './app.module';
import * as fs from 'fs';

async function bootstrap() {
  // Mismo patrón que ms_notifications/ncc4-ami: HTTPS_KEY=foo.bar → certs en
  // /etc/httpd/cert/foo.bar.com.{key,crt} + ca.crt. Sin HTTPS_KEY, HTTP plano
  // (dev local).
  const httpsOptions = process.env.HTTPS_KEY
    ? {
        key:  fs.readFileSync(`/etc/httpd/cert/${process.env.HTTPS_KEY}.com.key`),
        cert: fs.readFileSync(`/etc/httpd/cert/${process.env.HTTPS_KEY}.com.crt`),
        ca:   fs.readFileSync('/etc/httpd/cert/ca.crt'),
      }
    : undefined;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger:    false,
      bodyLimit: 1_048_576,
      https:     httpsOptions,
    }),
    // rawBody: true expone req.rawBody nativamente (Nest lo llena sin pisar
    // el content-type parser JSON por defecto de Fastify) — necesario para
    // la verificación HMAC del webhook de Meta.
    { rawBody: true },
  );

  const fastifyInstance = app.getHttpAdapter().getInstance();

  app.setGlobalPrefix('api/lead-capture');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:            true,
      forbidNonWhitelisted: false,
      transform:            true,
    }),
  );

  // CORS restringido — en producción configurar ALLOWED_ORIGINS en .env
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  });

  // FIX #15 — health check endpoint
  fastifyInstance.get('/health', async (_req: any, reply: any) => {
    reply.code(200).send({ status: 'ok', service: 'ms_lead_capture', ts: new Date().toISOString() });
  });

  const port = Number(process.env.PORT ?? 3005);
  await app.listen(port, '0.0.0.0');
  console.log(`ms_lead_capture running on port ${port}`);
}

bootstrap();
