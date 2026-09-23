-- social_queue gains a `format` column: which Instagram surface a row is for.
-- Run once in the Supabase SQL editor (project bmauebaqoucjpiapnora).
--
--   'feed'  a normal post — a single card, or a carousel whose slides live in source_ref.slides
--   'story' a 1080x1920 story card, published with media_type=STORIES and no caption
--
-- Every existing row is a feed post, which is what the default gives them. The backend also reads
-- `row.format || 'feed'`, so it keeps working against a database where this has not been run yet —
-- but the story lane needs the column, because the feed and story caps are counted separately.

ALTER TABLE social_queue
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'feed';

ALTER TABLE social_queue
  DROP CONSTRAINT IF EXISTS social_queue_format_check;

ALTER TABLE social_queue
  ADD CONSTRAINT social_queue_format_check CHECK (format IN ('feed', 'story'));

-- The publisher's daily-cap count is (platform, format, status, published_at).
CREATE INDEX IF NOT EXISTS social_queue_platform_format_published_idx
  ON social_queue (platform, format, status, published_at DESC);
