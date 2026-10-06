import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { cookieOriginMiddleware } from './security/cookie-origin.middleware';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '16mb' });

  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ];

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : defaultOrigins;

  const isOriginAllowed = (origin: string | undefined): boolean => {
    if (!origin) return true; // Non-browser / server-to-server
    if (allowedOrigins.includes(origin)) return true;
    if (process.env.NODE_ENV !== 'production') {
      // In dev and test environments, allow any localhost or 127.0.0.1 port
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return true;
      }
    }
    return false;
  };

  app.enableCors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // CSRF Defense-in-depth: For cookie-authenticated mutating requests, validate Origin header against allowlist
  app.use(cookieOriginMiddleware(isOriginAllowed));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // OpenAPI Documentation per ADR-007
  const config = new DocumentBuilder()
    .setTitle('Kashyap Adhikari Family Tree API')
    .setDescription('Official REST API specification for Kashyap Adhikari Family Tree Platform')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Kashyap Platform API running on port ${port} (Swagger docs at /api/docs)`);
}
bootstrap();
