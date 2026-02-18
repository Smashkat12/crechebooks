-- Add START_DATE step to OnboardingStep enum (after FEE_AGREEMENT, before MEDIA_CONSENT)
ALTER TYPE "OnboardingStep" ADD VALUE 'START_DATE' AFTER 'FEE_AGREEMENT';
