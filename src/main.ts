import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Configuration } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService<Configuration>);
  const port = configService.get('port', { infer: true }) || 3000;

  // Enable CORS for development
  app.enableCors();

  // Global prefix for API
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  await app.listen(port);
  console.log(`🚀 CrecheBooks API running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
}

void bootstrap();
