CREATE TABLE `fingering_picks` (
	`user_id` text NOT NULL,
	`theme_id` text NOT NULL,
	`post_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `theme_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `fingering_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fingering_picks_post` ON `fingering_picks` (`post_id`);--> statement-breakpoint
CREATE TABLE `fingering_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`theme_id` text NOT NULL,
	`user_id` text NOT NULL,
	`fingering_json` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fingering_posts_theme_fingering` ON `fingering_posts` (`theme_id`,`fingering_json`);--> statement-breakpoint
CREATE INDEX `fingering_posts_user_theme` ON `fingering_posts` (`user_id`,`theme_id`);