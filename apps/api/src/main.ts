import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const configService = app.get(ConfigService<Configuration>);
  const port = configService.get('port', { infer: true }) || 3000;

  // Global validation pipe - strict validation, no fallbacks
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: false,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Global prefix for API
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CrecheBooks API')
    .setDescription(
      'AI-powered bookkeeping system for South African creches and pre-schools',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Auth0 JWT token',
      },
      'JWT-auth',
    )
    .addTag('Authentication', 'OAuth2 authentication endpoints')
    .addTag('Health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`CrecheBooks API running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
  logger.log(`Health check: http://localhost:${port}/health`);
  logger.log(`Auth login: http://localhost:${port}/api/v1/auth/login`);
}

void bootstrap();
