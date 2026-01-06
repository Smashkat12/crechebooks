/**
 * Parent Factory - Test Data Creation
 * TASK-TEST-001: Centralized test fixtures
 */
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { Parent, PreferredContact } from '@prisma/client';
import { generateUniqueId } from '../utils';

export interface ParentFactoryOptions {
  tenantId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredContact?: PreferredContact;
  isActive?: boolean;
}

/**
 * Create a test parent with sensible defaults
 */
export async function createParent(
  prisma: PrismaService,
  opts: ParentFactoryOptions,
): Promise<Parent> {
  const uniqueId = generateUniqueId();

  return prisma.parent.create({
    data: {
      tenantId: opts.tenantId,
      firstName: opts.firstName ?? `Parent${uniqueId.slice(0, 5)}`,
      lastName: opts.lastName ?? 'Test',
      email: opts.email ?? `parent-${uniqueId}@test.crechebooks.co.za`,
      phone: opts.phone ?? '+27 11 123 4567',
      whatsapp: opts.whatsapp ?? '+27 11 123 4567',
      preferredContact: opts.preferredContact ?? 'EMAIL',
      isActive: opts.isActive ?? true,
    },
  });
}

/**
 * Create multiple test parents
 */
export async function createParents(
  prisma: PrismaService,
  count: number,
  opts: Omit<ParentFactoryOptions, 'email'>,
): Promise<Parent[]> {
  const parents: Parent[] = [];

  for (let i = 0; i < count; i++) {
    const uniqueId = generateUniqueId();
    const parent = await createParent(prisma, {
      ...opts,
      firstName: opts.firstName ? `${opts.firstName}${i + 1}` : undefined,
      email: `parent-${uniqueId}@test.crechebooks.co.za`,
    });
    parents.push(parent);
  }

  return parents;
}
