#!/usr/bin/env tsx
/**
 * Create Super Admin User Script
 *
 * Creates a SUPER_ADMIN user account for CrecheBooks platform administration.
 * This user has access to all admin endpoints including contact forms and demo requests.
 *
 * Usage:
 *   npx tsx scripts/create-super-admin.ts
 *
 * Environment variables required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - SUPER_ADMIN_EMAIL: Email for super admin (default: katlego@elleelephant.co.za)
 *   - SUPER_ADMIN_NAME: Name for super admin (default: Katlego Tsotetsi)
 *   - SUPER_ADMIN_AUTH0_ID: Auth0 ID (default: super-admin-local-dev)
 */

import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'katlego@elleelephant.co.za';
  const name = process.env.SUPER_ADMIN_NAME || 'Katlego Tsotetsi';
  const auth0Id = process.env.SUPER_ADMIN_AUTH0_ID || `super-admin-${randomUUID()}`;

  console.log('🚀 Creating CrecheBooks Super Admin User...\n');
  console.log(`Email: ${email}`);
  console.log(`Name: ${name}`);
  console.log(`Auth0 ID: ${auth0Id}`);
  console.log(`Role: SUPER_ADMIN\n`);

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { auth0Id },
        ],
      },
    });

    if (existingUser) {
      console.log('⚠️  User already exists with this email or Auth0 ID:');
      console.log(`   ID: ${existingUser.id}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Tenant ID: ${existingUser.tenantId || 'None (platform admin)'}\n`);

      if (existingUser.role !== UserRole.SUPER_ADMIN) {
        console.log('❓ Would you like to upgrade this user to SUPER_ADMIN? (This script does not modify existing users)');
        console.log('   Run this SQL manually if needed:');
        console.log(`   UPDATE users SET role = 'SUPER_ADMIN', tenant_id = NULL WHERE id = '${existingUser.id}';\n`);
      } else {
        console.log('✅ User is already a SUPER_ADMIN.\n');
      }

      process.exit(0);
    }

    // Create new super admin user
    const superAdmin = await prisma.user.create({
      data: {
        email,
        name,
        auth0Id,
        role: UserRole.SUPER_ADMIN,
        tenantId: null, // Super admins don't belong to a tenant
        isActive: true,
      },
    });

    console.log('✅ Super Admin user created successfully!\n');
    console.log('User Details:');
    console.log(`   ID: ${superAdmin.id}`);
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Name: ${superAdmin.name}`);
    console.log(`   Role: ${superAdmin.role}`);
    console.log(`   Auth0 ID: ${superAdmin.auth0Id}`);
    console.log(`   Created At: ${superAdmin.createdAt}\n`);

    console.log('📋 Next Steps:');
    console.log('   1. Configure Auth0 to use this auth0Id for the super admin user');
    console.log('   2. Log in with this account to access /api/admin/* endpoints');
    console.log('   3. The super admin can view all contact submissions and demo requests\n');

  } catch (error) {
    console.error('❌ Error creating super admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
