/*
 * File: packages/db/drizzle/0014_step_input_limits.sql
 * Purpose: Hand-written data migration that gives the seeded steps their input limits: how many files each upload
 * step takes (photo ID 1-2, headshot exactly 1 of at least 600 px, W-9 1-2, DBPR 1-3, license and bond 1-5) and the
 * bio's 100 to 250 word range. Limits already set on a step are kept. The last "What to do" line of photo ID, headshot
 * and license and bond is reworded to match, only while it still has the exact seeded wording. Writes audit_log rows.
 *
 * Functions:
 * - none
 */
WITH limits(key, extra) AS (
  VALUES
    ('photo_id', '{"minFiles":1,"maxFiles":2}'::jsonb),
    ('headshot', '{"minFiles":1,"maxFiles":1,"minImagePx":600}'::jsonb),
    ('w9', '{"minFiles":1,"maxFiles":2}'::jsonb),
    ('dbpr_filing', '{"minFiles":1,"maxFiles":3}'::jsonb),
    ('license_bond', '{"minFiles":1,"maxFiles":5}'::jsonb),
    ('bio', '{"minWords":100,"maxWords":250}'::jsonb)
),
updated AS (
  UPDATE onboarding_steps AS s
  SET config = limits.extra || s.config, updated_at = now()
  FROM limits
  WHERE s.key = limits.key AND NOT (s.config ?| ARRAY(SELECT jsonb_object_keys(limits.extra)))
  RETURNING s.id, limits.extra
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.limits_added', 'onboarding_step', id, '{}'::jsonb, extra
FROM updated;
--> statement-breakpoint
WITH copy(key, old_text, new_text) AS (
  VALUES
    (
      'photo_id',
      E'1. Use your driver''s license or passport.\n2. Lay it flat in good light so all four corners and every word are readable.\n3. Upload it here — a clear phone photo is fine.',
      E'1. Use your driver''s license or passport.\n2. Lay it flat in good light so all four corners and every word are readable.\n3. Upload it here — a clear phone photo is fine. For a driver''s license, add the front and the back (2 files at most).'
    ),
    (
      'headshot',
      E'1. Stand in front of a plain, light background.\n2. Frame it from the shoulders up, facing the camera, in good daylight.\n3. No sunglasses, hats or filters — then upload it here.',
      E'1. Stand in front of a plain, light background.\n2. Frame it from the shoulders up, facing the camera, in good daylight.\n3. No sunglasses, hats or filters — then upload one photo here, at least 600 × 600 pixels.'
    ),
    (
      'license_bond',
      E'1. Find your license (temporary or permanent) and your surety bond.\n2. Make sure your name and license number are readable on both.\n3. Upload both here — you can add up to 5 files.',
      E'1. Find your license (temporary or permanent) and your surety bond.\n2. Make sure your name and license number are readable on both.\n3. Upload both here — one file with both is fine, or up to 5 separate files.'
    )
),
updated AS (
  UPDATE onboarding_steps AS s
  SET instructions_md = copy.new_text, updated_at = now()
  FROM copy
  WHERE s.key = copy.key AND s.instructions_md = copy.old_text
  RETURNING s.id, copy.old_text, copy.new_text
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('instructionsMd', old_text), jsonb_build_object('instructionsMd', new_text)
FROM updated;
