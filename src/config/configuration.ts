export interface Configuration {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
  };
  timezone: string;
  vat: {
    rate: number;
    registrationThresholdCents: number;
  };
}

export default (): Configuration => {
  const port = parseInt(process.env.PORT || '3000', 10);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return {
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
      url: databaseUrl,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    timezone: 'Africa/Johannesburg',
    vat: {
      rate: 0.15,
      registrationThresholdCents: 100000000, // R1,000,000 in cents
    },
  };
};
