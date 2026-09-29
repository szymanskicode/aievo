CREATE TYPE "public"."git_provider" AS ENUM('github');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'preparing', 'running', 'committing', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "git_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "git_provider" DEFAULT 'github' NOT NULL,
	"label" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"token_hint" varchar(4),
	"github_login" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_credential_id_workspaceId_unique" UNIQUE("id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"branch" text,
	"pr_url" text,
	"pr_number" integer,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"agent_key" text NOT NULL,
	"agent_version" text NOT NULL,
	"iteration" integer DEFAULT 1 NOT NULL,
	"status" "step_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb NOT NULL,
	"result" text NOT NULL,
	"is_error" boolean DEFAULT false NOT NULL,
	"duration_ms" integer NOT NULL,
	"exit_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "repo_owner" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "repo_name" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "git_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "git_credential" ADD CONSTRAINT "git_credential_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call" ADD CONSTRAINT "tool_call_step_id_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."step"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_credential_workspace_id_index" ON "git_credential" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "run_task_id_created_at_index" ON "run" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "step_run_id_created_at_index" ON "step" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "tool_call_step_id_created_at_index" ON "tool_call" USING btree ("step_id","created_at");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_git_credential_id_workspace_id_git_credential_id_workspace_id_fk" FOREIGN KEY ("git_credential_id","workspace_id") REFERENCES "public"."git_credential"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_repo_owner_name_check" CHECK (("project"."repo_owner" IS NULL) = ("project"."repo_name" IS NULL));