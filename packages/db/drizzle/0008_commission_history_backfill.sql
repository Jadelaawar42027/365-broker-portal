/*
 * File: packages/db/drizzle/0008_commission_history_backfill.sql
 * Purpose: Hand-written migration for the commission history (SPEC D29). Gives every broker who has splits or an old
 * commission tier a first commission_history row: the two split columns become its percentages and any old
 * commission_tier text becomes its note. Existing columns are left in place and unchanged. Then redefines the
 * broker_metrics view with the current split (the latest history row) as two new columns at the end, so existing
 * readers and the metrics_reader grant keep working. Safe to run twice: brokers that already have history are skipped.
 *
 * Functions:
 * - none
 */
INSERT INTO commission_history (broker_id, in_house_pct, self_generated_pct, effective_from, changed_by, note)
SELECT
  b.id,
  b.in_house_split,
  b.self_generated_split,
  b.joined_at,
  NULL,
  CASE WHEN b.commission_tier IS NOT NULL AND btrim(b.commission_tier) <> '' THEN 'Previous commission tier: ' || btrim(b.commission_tier) END
FROM brokers b
WHERE (b.in_house_split IS NOT NULL OR b.self_generated_split IS NOT NULL OR (b.commission_tier IS NOT NULL AND btrim(b.commission_tier) <> ''))
  AND NOT EXISTS (SELECT 1 FROM commission_history h WHERE h.broker_id = b.id);
--> statement-breakpoint
CREATE OR REPLACE VIEW "broker_metrics" AS
SELECT
  b.id AS broker_id,
  u.name,
  u.email,
  b.level,
  b.status,
  (b.status = 'active') AS is_active,
  b.joined_at,
  b.onboarded_at,
  b.left_at,
  (b.onboarded_at - b.joined_at) AS days_to_onboard,
  (COALESCE(b.left_at, (now() AT TIME ZONE 'America/New_York')::date) - b.joined_at) AS tenure_days,
  COALESCE(s.steps_total, 0)::int AS steps_total,
  COALESCE(s.steps_approved, 0)::int AS steps_approved,
  COALESCE(s.steps_waiting_review, 0)::int AS steps_waiting_review,
  GREATEST(s.last_step_activity_at, f.last_upload_at) AS last_activity_at,
  c.in_house_pct,
  c.self_generated_pct
FROM brokers b
JOIN users u ON u.id = b.user_id
LEFT JOIN LATERAL (
  SELECT
    count(*) AS steps_total,
    count(*) FILTER (WHERE bs.status = 'approved') AS steps_approved,
    count(*) FILTER (WHERE bs.status = 'submitted') AS steps_waiting_review,
    GREATEST(max(bs.submitted_at), max(bs.reviewed_at)) AS last_step_activity_at
  FROM broker_steps bs
  JOIN onboarding_steps os ON os.id = bs.step_id AND os.active
  WHERE bs.broker_id = b.id
) s ON true
LEFT JOIN LATERAL (
  SELECT max(fl.created_at) AS last_upload_at
  FROM files fl
  JOIN broker_steps bs2 ON bs2.id = fl.broker_step_id
  WHERE bs2.broker_id = b.id
) f ON true
LEFT JOIN LATERAL (
  SELECT h.in_house_pct, h.self_generated_pct
  FROM commission_history h
  WHERE h.broker_id = b.id
  ORDER BY h.effective_from DESC, h.created_at DESC
  LIMIT 1
) c ON true;
