import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as fs from 'fs';
import * as path from 'path';


// it is workinggggg
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS
  app.enableCors();

  // =========================================================================
  // SWAGGER / OPENAPI DOCUMENTATION
  // =========================================================================
  const config = new DocumentBuilder()
    .setTitle('Jameya Marketplace API')
//     .setDescription(
//       `## 🏦 Collaborative Savings Groups Marketplace

// A production-ready REST API for managing **Jameyas** (collaborative savings groups),
// seat reservations, and payments.

// ### Key Features
// - **2-Phase Seat Reservation** — Reserve with TTL, confirm after payment
// - **Concurrency Safe** — Redis distributed locks + PostgreSQL row locks
// - **Idempotent** — Duplicate requests safely return cached responses
// - **Marketplace Ranking** — Featured, trending, personalized recommendations
// - **Payment Integration** — Stripe (simulated in dev mode)

// ### Critical Business Rule
// > Users are **NEVER** charged unless a seat is successfully reserved.

// ### Reservation Flow
// 1. \`POST /api/reservations\` → Creates temporary hold (TTL = 3 min)
// 2. User pays via Stripe (client-side)
// 3. \`POST /api/payments/webhook\` → Confirms seat after payment success
// 4. Background worker releases expired reservations every 30s

// ### Authentication
// This demo API does not require authentication. In production, add JWT Bearer tokens.
//       `,
//     )
    .setVersion('1.0.0')
    .setContact(
      'Jameya Marketplace Team',
      'https://github.com/jameya-marketplace',
      'team@jameya.io',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3000', 'Local Development')
    .addServer('https://api.jameya.io', 'Production (placeholder)')
    .addTag('marketplace', 'Browse and discover Jameyas with personalized ranking')
    .addTag('jameyas', 'Create and manage Jameya savings groups')
    .addTag('seats', 'View and manage seats within Jameyas')
    .addTag('reservations', 'Reserve seats with 2-phase confirmation flow')
    .addTag('payments', 'Process payments and handle Stripe webhooks')
    .addTag('users', 'User management, KYC verification, and risk profiling')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Export static swagger.json for offline viewing
  const swaggerOutputPath = path.join(process.cwd(), 'swagger.json');
  fs.writeFileSync(swaggerOutputPath, JSON.stringify(document, null, 2));
  logger.log(`📄 Swagger JSON exported to ${swaggerOutputPath}`);

  // Serve Swagger UI
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Jameya Marketplace API Docs',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { font-size: 2.2em; }
      .swagger-ui .info .description p { font-size: 14px; line-height: 1.6; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 Jameya Marketplace running on http://localhost:${port}`);
  logger.log(`📚 Swagger UI at http://localhost:${port}/api/docs`);
  logger.log(`📄 Swagger JSON at http://localhost:${port}/api/docs-json`);
}

bootstrap();
