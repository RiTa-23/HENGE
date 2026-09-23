CREATE TABLE `reading_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`theme_id` text NOT NULL,
	`sentence_no` integer NOT NULL,
	`prompt_text` text NOT NULL,
	`surface` text NOT NULL,
	`reported_kana` text NOT NULL,
	`expected_kana` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`cost` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`applied_at` integer,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reading_reports_status` ON `reading_reports` (`status`,"created_at" desc);