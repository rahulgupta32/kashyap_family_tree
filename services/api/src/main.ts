import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
      ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser clients (no origin header)
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // CSRF Defense-in-depth: For cookie-authenticated mutating requests, validate Origin header against allowlist
  app.use((req: any, res: any, next: any) => {
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (mutatingMethods.includes(req.method)) {
      const cookieHeader = req.headers.cookie;
      const hasCookieAuth = cookieHeader && cookieHeader.includes('refreshToken=');
      if (hasCookieAuth) {
        const origin = req.headers.origin;
        if (!origin || !allowedOrigins.includes(origin)) {
          return res.status(403).json({
            success: false,
            errorCode: 'AUTH_1010',
            message: 'Forbidden: Request origin is untrusted or missing for cookie-authenticated mutation.',
            timestamp: new Date().toISOString(),
            path: req.originalUrl,
          });
        }
      }
    }
    next();
  });

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
