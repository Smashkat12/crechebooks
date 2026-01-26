/**
 * Persistence Configuration
 * TASK-STUB-011: Persistence and SONA Cold Start Bootstrap
 *
 * @module agents/sdk/persistence-config
 * @description Railway-aware persistence configuration for ruvector storage.
 * Detects Railway environment and persistent volume availability.
 * Provides all storage paths for IntelligenceEngine, VectorDB, and SONA.
 * Degrades gracefully when persistent volume is unavailable.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface PersistenceConfigValues {
  /** Base data directory for all ruvector storage */
  dataDir: string;
  /** Path for IntelligenceEngine redb database */
  intelligenceDbPath: string;
  /** Path for VectorDB collections */
  collectionsDir: string;
  /** Path for SONA trajectory storage */
  sonaDir: string;
  /** Path for backup/export files */
  backupDir: string;
  /** Whether persistent volume is available */
  isPersistent: boolean;
  /** Whether SONA bootstrap is enabled */
  bootstrapEnabled: boolean;
}

@Injectable()
export class PersistenceConfig {
  private readonly logger = new Logger(PersistenceConfig.name);
  private config: PersistenceConfigValues | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get persistence configuration, lazily resolved.
   * Checks for Railway persistent volume availability.
   */
  getConfig(): PersistenceConfigValues {
    if (this.config) return this.config;

    const dataDir = this.configService.get<string>(
      'RUVECTOR_DATA_DIR',
      './data/ruvector',
    );

    const isPersistent = this.checkPersistentVolume(dataDir);

    this.config = {
      dataDir,
      intelligenceDbPath: path.join(dataDir, 'intelligence.db'),
      collectionsDir: path.join(dataDir, 'collections'),
      sonaDir: path.join(dataDir, 'sona'),
      backupDir: path.join(dataDir, 'backups'),
      isPersistent,
      bootstrapEnabled:
        this.configService.get<string>(
          'SONA_BOOTSTRAP_ENABLED',
          'true',
        ) === 'true',
    };

    if (!isPersistent) {
      this.logger.warn(
        `RUVECTOR_DATA_DIR "${dataDir}" is not persistent. ` +
          'Data will be lost on server restart. ' +
          'Configure a Railway persistent volume at /data/ruvector for production.',
      );
    }

    // Ensure directories exist
    this.ensureDirectories(this.config);

    return this.config;
  }

  /**
   * Check if the data directory is on a persistent volume.
   * On Railway, persistent volumes are mounted under /data.
   * In development, any writable directory is considered "persistent".
   */
  private checkPersistentVolume(dataDir: string): boolean {
    const isRailway = !!this.configService.get<string>('RAILWAY_ENVIRONMENT');

    if (isRailway) {
      // On Railway, persistent volumes are mounted under /data
      return dataDir.startsWith('/data');
    }

    // In development, check if directory is writable
    try {
      fs.accessSync(path.dirname(dataDir), fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure all required directories exist.
   * Creates them recursively if missing.
   */
  private ensureDirectories(config: PersistenceConfigValues): void {
    const dirs = [
      config.dataDir,
      config.collectionsDir,
      config.sonaDir,
      config.backupDir,
    ];

    for (const dir of dirs) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to create directory ${dir}: ${msg}`);
      }
    }
  }
}
