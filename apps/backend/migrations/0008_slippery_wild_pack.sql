CREATE TABLE `constraint_vocabularies` (
	`theme_id` text PRIMARY KEY NOT NULL,
	`words_json` text NOT NULL,
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade
);
