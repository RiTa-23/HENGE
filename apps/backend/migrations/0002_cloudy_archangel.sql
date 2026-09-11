DROP INDEX `prompts_theme_seq`;--> statement-breakpoint
ALTER TABLE `prompts` ADD `form` text DEFAULT 'sentence' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_theme_form_seq` ON `prompts` (`theme_id`,`form`,`sequence_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_theme_progress` (
	`user_id` text NOT NULL,
	`theme_id` text NOT NULL,
	`form` text DEFAULT 'sentence' NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `theme_id`, `form`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- **手で直した行。** drizzle-kit は旧テーブルから "form" を SELECT する文を出すが、
-- 旧 user_theme_progress にその列は無い（この移行で足す列）。そのまま流すと
-- `no such column: form` でマイグレーションが落ち、デプロイごと止まる。
-- 既存の進捗はすべて短文なので、リテラルで 'sentence' を入れる。
INSERT INTO `__new_user_theme_progress`("user_id", "theme_id", "form", "play_count", "updated_at") SELECT "user_id", "theme_id", 'sentence', "play_count", "updated_at" FROM `user_theme_progress`;--> statement-breakpoint
DROP TABLE `user_theme_progress`;--> statement-breakpoint
ALTER TABLE `__new_user_theme_progress` RENAME TO `user_theme_progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `themes` ADD `word_generation_status` text DEFAULT 'ok' NOT NULL;