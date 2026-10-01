CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "embedding_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(3072) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
