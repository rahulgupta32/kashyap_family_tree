import { MediaStorageService } from '../media/media-storage.service';
import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { DatabaseService } from '../database/database.service';

@ApiTags('System Health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService, private readonly storage: MediaStorageService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Application process is alive' })
  getLiveness() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Application and dependencies ready' })
  @ApiResponse({ status: 503, description: 'Service unavailable / database disconnected' })
  async getReadiness(@Res() res: Response) {
    const [dbHealth, mediaStorage] = await Promise.all([this.db.checkHealth(), this.storage.checkHealth()]);

    const isReady = dbHealth.status === 'up' && mediaStorage === 'up';
    const statusCode = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json({
      status: isReady ? 'ok' : 'degraded',
      database: dbHealth.status,
      mediaStorage,
      databaseType: dbHealth.isMemoryDb ? 'in-memory-pg-mem' : 'real-postgresql',
      dbLatencyMs: dbHealth.latencyMs,
      error: dbHealth.error,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
}
