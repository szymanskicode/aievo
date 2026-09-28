ALTER TABLE "provider_credential" ALTER COLUMN "encrypted_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_credential" ALTER COLUMN "key_hint" DROP NOT NULL;