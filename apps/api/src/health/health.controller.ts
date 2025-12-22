import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
    };
  }
}
