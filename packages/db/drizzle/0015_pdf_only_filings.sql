/*
 * File: packages/db/drizzle/0015_pdf_only_filings.sql
 * Purpose: Hand-written data migration that makes the DBPR filing confirmation PDF only (one or two PDFs). The W-9
 * keeps PDF, JPG and PNG. Each change only runs while the step still has the seeded value it replaces, so anything an admin
 * has edited is left alone. It also brings License and bond back to "1 to 5 files" (with its instruction line) on
 * databases that ran an earlier draft of 0014 asking for at least 2. Writes audit_log rows.
 *
 * Functions:
 * - none
 */
WITH updated AS (
  UPDATE onboarding_steps
  SET accepted_types = ARRAY['application/pdf']::text[], updated_at = now()
  WHERE key = 'dbpr_filing' AND accepted_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.accepted_types_changed', 'onboarding_step', id, jsonb_build_object('acceptedTypes', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png')), jsonb_build_object('acceptedTypes', jsonb_build_array('application/pdf'))
FROM updated;
--> statement-breakpoint
WITH limits(key, field, old_value, new_value) AS (
  VALUES ('dbpr_filing', 'maxFiles', 3, 2), ('license_bond', 'minFiles', 2, 1)
),
updated AS (
  UPDATE onboarding_steps AS s
  SET config = jsonb_set(s.config, ARRAY[limits.field], to_jsonb(limits.new_value)), updated_at = now()
  FROM limits
  WHERE s.key = limits.key AND (s.config ->> limits.field)::int = limits.old_value
  RETURNING s.id, limits.field, limits.old_value, limits.new_value
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.limits_changed', 'onboarding_step', id, jsonb_build_object(field, old_value), jsonb_build_object(field, new_value)
FROM updated;
--> statement-breakpoint
WITH copy(key, old_text, new_text) AS (
  VALUES
    (
      'dbpr_filing',
      E'1. New license: register on the DBPR online portal and complete the application, fingerprints, surety bond and fee. You get a temporary 90-day license while background checks run.\n2. Transfer: request a license transfer through DBPR to associate your license with 365 Yachts Inc., and tell your Sales Executive the day you submit.\n3. Upload the confirmation here — a screenshot or PDF is fine.',
      E'1. New license: register on the DBPR online portal and complete the application, fingerprints, surety bond and fee. You get a temporary 90-day license while background checks run.\n2. Transfer: request a license transfer through DBPR to associate your license with 365 Yachts Inc., and tell your Sales Executive the day you submit.\n3. Upload the confirmation here as a PDF. On the DBPR page, use Print, then Save as PDF.'
    ),
    (
      'license_bond',
      E'1. Find your license (temporary or permanent) and your surety bond.\n2. Make sure your name and license number are readable on both.\n3. Upload both here as separate files (at least 2, up to 5).',
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
