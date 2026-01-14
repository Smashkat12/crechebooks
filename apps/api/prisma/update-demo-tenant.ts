/**
 * Script to update the demo tenant with Elle Elephant details
 * Run with: npx tsx prisma/update-demo-tenant.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function updateDemoTenant() {
  console.log('🔄 Updating demo tenant with Elle Elephant details...');

  try {
    // Find existing tenant(s)
    const tenants = await prisma.tenant.findMany();
    console.log(`Found ${tenants.length} tenant(s)`);

    if (tenants.length === 0) {
      console.log('No tenants found. Creating new tenant...');
      const newTenant = await prisma.tenant.create({
        data: {
          name: 'Elle Elephant',
          email: 'katlego@elleelephant.co.za',
          addressLine1: '3215 H Swala',
          city: 'Mabopane',
          province: 'Gauteng',
          postalCode: '0190',
          phone: '+27739356753',
          subscriptionStatus: 'TRIAL',
        },
      });
      console.log(`✅ Created tenant: ${newTenant.name} (${newTenant.id})`);
      return;
    }

    // Update the first (demo) tenant
    const demoTenant = tenants[0];
    console.log(`Updating tenant: ${demoTenant.name} (${demoTenant.id})`);

    const updated = await prisma.tenant.update({
      where: { id: demoTenant.id },
      data: {
        name: 'Elle Elephant',
        email: 'katlego@elleelephant.co.za',
        addressLine1: '3215 H Swala',
        city: 'Mabopane',
        province: 'Gauteng',
        postalCode: '0190',
        phone: '+27739356753',
      },
    });

    console.log(`✅ Updated tenant successfully:`);
    console.log(`   Name: ${updated.name}`);
    console.log(`   Email: ${updated.email}`);
    console.log(`   Phone: ${updated.phone}`);
    console.log(`   Address: ${updated.addressLine1}, ${updated.city}, ${updated.postalCode}`);
  } catch (error) {
    console.error('❌ Error updating tenant:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

updateDemoTenant()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
