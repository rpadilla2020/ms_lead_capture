import { NestFactory }           from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule }      from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // FIX #6 — rawBody: true expone req.rawBody para la verificación HMAC del webhook
    // Sin esto, req.rawBody es undefined y la firma siempre falla silenciosamente
    new FastifyAdapter({
      logger:    false,
      bodyLimit: 1_048_576,
      // Fastify necesita addContentTypeParser para exponer rawBody
    }),
  );

  // FIX #6 — registrar content-type parser que preserve el rawBody
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: any, body: Buffer, done: (err: Error | null, payload?: any) => void) => {
      try {
        req.rawBody = body;
        const json  = JSON.parse(body.toString('utf8'));
        done(null, json);
      } catch (err) {
        done(err);
      }
    },
  );

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
