CREATE TABLE `rankings` (
	`theme_id` text NOT NULL,
	`form` text NOT NULL,
	`user_id` text NOT NULL,
	`score` integer NOT NULL,
	`hits` integer NOT NULL,
	`misses` integer NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`theme_id`, `form`, `user_id`),
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rankings_theme_form_score` ON `rankings` (`theme_id`,`form`,"score" desc);