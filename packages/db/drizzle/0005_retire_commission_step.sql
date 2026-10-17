/*
 * File: packages/db/drizzle/0005_retire_commission_step.sql
 * Purpose: Hand-written migration that retires onboarding step 11 (commission_tier): commission splits are now set when
 * a broker is invited (SPEC D27). The step row and every broker's history stay; the step is only marked inactive, so
 * checklists, counts and the broker_metrics view stop including it. Records the change in audit_log.
 *
 * Functions:
 * - none
 */
WITH retired AS (
  UPDATE onboarding_steps
  SET active = false, updated_at = now()
  WHERE key = 'commission_tier' AND active
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.retired', 'onboarding_step', id, jsonb_build_object('active', true), jsonb_build_object('active', false)
FROM retired;
