// Quick script to create a test user in production database
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  // Check if user exists
  const existing = await prisma.user.findFirst({
    where: { email: 'test@elleelephant.co.za' }
  });

  if (existing) {
    console.log('Test user already exists:');
    console.log({
      email: existing.email,
      firstName: existing.firstName,
      lastName: existing.lastName,
      role: existing.role
    });

    // Also show tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: existing.tenantId }
    });

    if (tenant) {
      console.log('Tenant:', tenant.name);
    }
    return;
  }

  // Create tenant first
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Creche',
      email: 'test@elleelephant.co.za',
      phone: '+27123456789'
    }
  });

  // Hash password: "Test1234"
  const hashedPassword = await bcrypt.hash('Test1234', 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: 'test@elleelephant.co.za',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'ADMIN',
      tenantId: tenant.id
    }
  });

  console.log('Test user created successfully:');
  console.log({
    email: user.email,
    password: 'Test1234',
    tenant: tenant.name
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
