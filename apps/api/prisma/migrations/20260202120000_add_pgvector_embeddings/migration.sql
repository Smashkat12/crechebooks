-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector_embeddings table for AI memory persistence
-- Stores embeddings for transaction categorization, payment matching, and semantic search
CREATE TABLE "vector_embeddings" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vector_embeddings_tenant_collection_content_key"
        UNIQUE ("tenant_id", "collection", "content_id")
);

-- Indexes for efficient querying
CREATE INDEX "vector_embeddings_tenant_id_idx" ON "vector_embeddings"("tenant_id");
CREATE INDEX "vector_embeddings_collection_idx" ON "vector_embeddings"("tenant_id", "collection");
CREATE INDEX "vector_embeddings_content_type_idx" ON "vector_embeddings"("tenant_id", "content_type");
CREATE INDEX "vector_embeddings_content_hash_idx" ON "vector_embeddings"("content_hash");

-- HNSW index for fast approximate nearest neighbor search
-- m=16, ef_construction=64 provides good recall/speed tradeoff
CREATE INDEX "vector_embeddings_embedding_idx" ON "vector_embeddings"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Add foreign key to tenant (with ON DELETE CASCADE for tenant cleanup)
ALTER TABLE "vector_embeddings"
    ADD CONSTRAINT "vector_embeddings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
