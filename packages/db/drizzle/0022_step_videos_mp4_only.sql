/*
 * File: packages/db/drizzle/0022_step_videos_mp4_only.sql
 * Purpose: Hand-written data migration for SPEC D34: onboarding step videos are uploaded MP4s only, so any step video
 * slot still holding a YouTube, Loom or Vimeo link is emptied (the slot and its title stay, and brokers see it as
 * "On its way" until an MP4 is uploaded). Lesson videos in training are not touched. Writes one audit_log row per
 * cleared slot, and changes nothing when run again.
 *
 * Functions:
 * - none
 */
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.video_cleared', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'source', 'embed', 'provider', provider, 'embedUrl', embed_url), jsonb_build_object('reason', 'Step videos are MP4 uploads only')
FROM step_videos
WHERE source = 'embed';
--> statement-breakpoint
UPDATE step_videos
SET source = NULL, provider = NULL, embed_url = NULL, updated_at = now()
WHERE source = 'embed';
