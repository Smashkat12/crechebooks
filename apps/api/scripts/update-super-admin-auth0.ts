#!/usr/bin/env tsx
/**
 * Update Super Admin Auth0 ID Script
 *
 * Updates the SUPER_ADMIN user's auth0Id after creating the user in Auth0.
 * This links the database user to the Auth0 authentication identity.
 *
 * Usage:
 *   npx tsx scripts/update-super-admin-auth0.ts
 *
 * Environment variables required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - SUPER_ADMIN_EMAIL: Email for super admin (default: katlego@elleelephant.co.za)
 *   - SUPER_ADMIN_AUTH0_ID: Auth0 User ID (e.g., auth0|123456789)
 */

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'katlego@elleelephant.co.za';
  const auth0Id = process.env.SUPER_ADMIN_AUTH0_ID;

  console.log('🔄 Updating Super Admin Auth0 ID...\n');

  if (!auth0Id) {
    console.error(
      '❌ ERROR: SUPER_ADMIN_AUTH0_ID environment variable is required',
    );
    console.error('\nUsage:');
    console.error(
      '  SUPER_ADMIN_AUTH0_ID=auth0|123456789 npx tsx scripts/update-super-admin-auth0.ts',
    );
    console.error('\nHow to get Auth0 User ID:');
    console.error('  1. Log in to Auth0 Dashboard');
    console.error('  2. Navigate to User Management → Users');
    console.error('  3. Find your super admin user');
    console.error(
      '  4. Copy the User ID (looks like: auth0|123456789 or google-oauth2|123456789)\n',
    );
    process.exit(1);
  }

  console.log(`Email: ${email}`);
  console.log(`New Auth0 ID: ${auth0Id}\n`);

  try {
    // Find existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      console.error(`❌ ERROR: User with email ${email} not found`);
      console.error(
        '\nRun create-super-admin.ts first to create the user:\n',
      );
      console.error('  npx tsx scripts/create-super-admin.ts\n');
      process.exit(1);
    }

    console.log('📋 Current User Details:');
    console.log(`   ID: ${existingUser.id}`);
    console.log(`   Email: ${existingUser.email}`);
    console.log(`   Name: ${existingUser.name}`);
    console.log(`   Role: ${existingUser.role}`);
    console.log(`   Current Auth0 ID: ${existingUser.auth0Id}\n`);

    if (existingUser.role !== UserRole.SUPER_ADMIN) {
      console.warn('⚠️  WARNING: User is not a SUPER_ADMIN');
      console.warn(`   Current role: ${existingUser.role}`);
      console.warn(
        '   This script will update the Auth0 ID but not change the role.\n',
      );
    }

    // Update Auth0 ID
    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        auth0Id,
      },
    });

    console.log('✅ Super Admin Auth0 ID updated successfully!\n');
    console.log('Updated User Details:');
    console.log(`   ID: ${updatedUser.id}`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Name: ${updatedUser.name}`);
    console.log(`   Role: ${updatedUser.role}`);
    console.log(`   Auth0 ID: ${updatedUser.auth0Id}`);
    console.log(`   Updated At: ${updatedUser.updatedAt}\n`);

    console.log('📋 Next Steps:');
    console.log(
      '   1. Verify the Auth0 user exists with this ID in Auth0 Dashboard',
    );
    console.log('   2. Test login at your application URL');
    console.log(
      '   3. After login, verify you can access /api/v1/admin/* endpoints',
    );
    console.log('   4. Check the admin dashboard shows platform-wide data\n');
  } catch (error) {
    console.error('❌ Error updating super admin Auth0 ID:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
