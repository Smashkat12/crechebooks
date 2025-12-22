import { Injectable, Logger } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import {
  NotFoundException,
  ConflictException,
  DatabaseException,
} from '../../shared/exceptions';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new user
   * @throws ConflictException if auth0Id or email already exists
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for other database errors
   */
  async create(dto: CreateUserDto): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: dto,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create user: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'User with this auth0Id or email already exists',
            { auth0Id: dto.auth0Id, email: dto.email },
          );
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      throw new DatabaseException(
        'create',
        'Failed to create user',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find user by ID
   * @returns User or null if not found
   * @throws DatabaseException for database errors
   */
  async findById(id: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find user by id: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findById',
        'Failed to find user',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find user by Auth0 ID
   * @returns User or null if not found
   * @throws DatabaseException for database errors
   */
  async findByAuth0Id(auth0Id: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { auth0Id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find user by auth0Id: ${auth0Id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByAuth0Id',
        'Failed to find user',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find user by tenant ID and email (composite unique constraint)
   * @returns User or null if not found
   * @throws DatabaseException for database errors
   */
  async findByTenantAndEmail(
    tenantId: string,
    email: string,
  ): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId,
            email,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find user by tenantId and email: ${tenantId}, ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenantAndEmail',
        'Failed to find user',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find all users belonging to a tenant
   * @returns Array of users (empty array if none found)
   * @throws DatabaseException for database errors
   */
  async findByTenant(tenantId: string): Promise<User[]> {
    try {
      return await this.prisma.user.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find users by tenantId: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'findByTenant',
        'Failed to find users',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update user
   * @throws NotFoundException if user doesn't exist
   * @throws ConflictException if email already in use
   * @throws DatabaseException for other database errors
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    try {
      // First verify user exists
      const existingUser = await this.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User', id);
      }

      return await this.prisma.user.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update user ${id}: ${JSON.stringify(dto)}`,
        error instanceof Error ? error.stack : String(error),
      );

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Email already in use by another user in this tenant',
            { email: dto.email },
          );
        }
      }
      throw new DatabaseException(
        'update',
        'Failed to update user',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update user's last login timestamp
   * @throws NotFoundException if user doesn't exist
   * @throws DatabaseException for other database errors
   */
  async updateLastLogin(id: string): Promise<User> {
    try {
      // First verify user exists
      const existingUser = await this.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User', id);
      }

      return await this.prisma.user.update({
        where: { id },
        data: { lastLoginAt: new Date() },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update last login for user: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateLastLogin',
        'Failed to update last login',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Deactivate user (soft delete)
   * @throws NotFoundException if user doesn't exist
   * @throws DatabaseException for other database errors
   */
  async deactivate(id: string): Promise<User> {
    try {
      // First verify user exists
      const existingUser = await this.findById(id);
      if (!existingUser) {
        throw new NotFoundException('User', id);
      }

      return await this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to deactivate user: ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'deactivate',
        'Failed to deactivate user',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
