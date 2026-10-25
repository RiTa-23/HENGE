ALTER TABLE `prompts` ADD `reported_at` integer;--> statement-breakpoint
-- drizzle-kit は ADD COLUMN の外部キーから ON DELETE を落とすので手で足している（無いと報告者を退会させられない）
ALTER TABLE `prompts` ADD `reported_by` text REFERENCES user(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `prompts` ADD `report_reason` text;--> statement-breakpoint
CREATE INDEX `prompts_reported` ON `prompts` ("reported_at" desc) WHERE "reported_at" IS NOT NULL;