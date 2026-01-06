/**
 * Child Factory - Test Data Creation
 * TASK-TEST-001: Centralized test fixtures
 */
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { Child } from '@prisma/client';
import { generateUniqueId } from '../utils';

export interface ChildFactoryOptions {
  tenantId: string;
  parentId: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
  isActive?: boolean;
}

/**
 * Create a test child with sensible defaults
 */
export async function createChild(
  prisma: PrismaService,
  opts: ChildFactoryOptions,
): Promise<Child> {
  const uniqueId = generateUniqueId();

  return prisma.child.create({
    data: {
      tenantId: opts.tenantId,
      parentId: opts.parentId,
      firstName: opts.firstName ?? `Child${uniqueId.slice(0, 5)}`,
      lastName: opts.lastName ?? 'Test',
      dateOfBirth: opts.dateOfBirth ?? new Date('2020-01-15'),
      isActive: opts.isActive ?? true,
    },
  });
}

/**
 * Create multiple test children for a parent
 */
export async function createChildren(
  prisma: PrismaService,
  count: number,
  opts: ChildFactoryOptions,
): Promise<Child[]> {
  const children: Child[] = [];

  for (let i = 0; i < count; i++) {
    const child = await createChild(prisma, {
      ...opts,
      firstName: opts.firstName ? `${opts.firstName}${i + 1}` : undefined,
    });
    children.push(child);
  }

  return children;
}
