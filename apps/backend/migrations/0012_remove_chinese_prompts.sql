-- モデルが混ぜた中国語の表記のお題を消す。データだけの変更でスキーマは変わらない。
-- 読みも誤っていた（機場→はたば、站→たん）。連番は詰め直さない（db/prompts.ts の deletePrompt と同じ）
DELETE FROM `prompts` WHERE `id` = '0000eeb1-bd45-4efb-8d62-7aa06e2bff8c' AND `text` = '福岡国際機場';--> statement-breakpoint
DELETE FROM `prompts` WHERE `id` = 'bc96511f-5cbf-47c6-8df0-e671f561dd1a' AND `text` = '博多站';
