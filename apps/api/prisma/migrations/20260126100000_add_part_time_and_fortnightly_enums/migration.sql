-- AlterEnum: Add PART_TIME to EmploymentType
ALTER TYPE "EmploymentType" ADD VALUE IF NOT EXISTS 'PART_TIME';

-- AlterEnum: Add FORTNIGHTLY to PayFrequency
ALTER TYPE "PayFrequency" ADD VALUE IF NOT EXISTS 'FORTNIGHTLY';
