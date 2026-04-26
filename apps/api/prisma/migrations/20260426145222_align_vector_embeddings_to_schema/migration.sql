-- Migration: align_vector_embeddings_to_schema
-- Generated: 20260426145222
--
-- This migration aligns the live staging `vector_embeddings` table with
-- apps/api/prisma/schema.prisma.
--
-- INTENTIONAL PERMANENT DRIFT: `vector_embeddings_embedding_idx` (HNSW,
-- ivfflat/hnsw, m=16, ef_construction=64) is NOT touched by this migration
-- and is NOT declared in schema.prisma. Prisma cannot declare HNSW indexes
-- on Unsupported() columns without `previewFeatures = ["postgresqlExtensions"]`,
-- which is out of scope. The index is required for pgvector cosine-search
-- performance and must remain in the DB. `prisma migrate diff` will continue
-- to report it as drift — this is expected and intentional.
-- DO NOT add a DROP INDEX for this index in any future migration unless
-- the HNSW strategy is explicitly revisited.

-- 1. Restructure column types and primary key atomically
ALTER TABLE "vector_embeddings"
  DROP CONSTRAINT "vector_embeddings_pkey",
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "id" SET DATA TYPE TEXT,
  ALTER COLUMN "collection" SET DATA TYPE VARCHAR(50),
  ALTER COLUMN "content_id" SET DATA TYPE VARCHAR(100),
  ALTER COLUMN "content_type" SET DATA TYPE VARCHAR(30),
  ALTER COLUMN "content_hash" SET DATA TYPE VARCHAR(64),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ADD CONSTRAINT "vector_embeddings_pkey" PRIMARY KEY ("id");

-- 2. Rename indexes to match Prisma-generated names
ALTER INDEX "vector_embeddings_tenant_collection_content_key"
  RENAME TO "vector_embeddings_tenant_id_collection_content_id_key";

ALTER INDEX "vector_embeddings_collection_idx"
  RENAME TO "vector_embeddings_tenant_id_collection_idx";

ALTER INDEX "vector_embeddings_content_type_idx"
  RENAME TO "vector_embeddings_tenant_id_content_type_idx";
