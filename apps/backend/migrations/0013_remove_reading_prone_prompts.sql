-- 読みが文脈で割れる語を含み、誤読しているおそれがあるお題を消す。データだけの変更でスキーマは変わらない。
-- 生成時の却下（reading-prone.ts）は新しいお題にしか効かないので、既存の分はここで消す。連番は詰め直さない（db/prompts.ts の deletePrompt と同じ）
DELETE FROM `prompts` WHERE `id` = '75caef22-b08f-4583-8272-2ad52dab9425' AND `text` = '博多の朝は市場が活気がある';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '022a78c3-3098-4e7b-98b4-0f22624d10d6' AND `text` = 'カレーは辛いけど美味しい';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '49da1a7f-0725-452b-9ade-8b4aec64f852' AND `text` = 'カレーは辛いです';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '1160b93e-1e22-40bc-a8c7-76742773b781' AND `text` = 'カレーは辛くて美味しい';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '44aaa35d-4610-4389-b1b6-c6e619d41e60' AND `text` = '屋台の下で話す人々がいる';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '6a287db7-e8a8-40ae-ba5d-2d5501cf298b' AND `text` = 'おもしろいことには江戸には八百屋がたくさんあって、野菜が安く手に入る。毎日のように市場に通って、新鮮なものを買うのが楽しみだった。お茶を飲むときには、お茶碗にそっと注ぐのが好きだった。お菓子を食べるときは、一つ一つ味わって食べるのが好きだった。江戸の生活は、ほんわかとしていた。';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '87fbaff8-a10d-401e-8113-0c8d71afeada' AND `text` = 'お父さんが子供を抱いている';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '6f37667a-084a-4cf5-bcf9-295e0e9e87fc' AND `text` = '理財は葉桜の下で考える';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = '5b48a08e-dbba-4be1-b3e0-0109eacfe609' AND `text` = '座礁した船に風穴が開いていた';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = 'a7ce69e0-7303-40e0-af1e-96eeb25cabab' AND `text` = '残塁が少ないので風穴が開く';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = 'a9ff212f-997d-4eff-9f7d-aa4c0d4fe117' AND `text` = '審査に通ったホルモンは名乗った';
