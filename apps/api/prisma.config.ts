import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Load environment variables
import 'dotenv/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),

  // Datasource URL for Prisma Migrate and db push
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
