import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Load environment variables in development only
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv/config');
  } catch {
    // Dotenv not available, using system env vars
  }
}

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),

  // Datasource URL for Prisma Migrate and db push
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
