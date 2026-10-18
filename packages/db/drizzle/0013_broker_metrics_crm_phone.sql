/*
 * File: packages/db/drizzle/0013_broker_metrics_crm_phone.sql
 * Purpose: Hand-written migration for account provisioning (phase H2). Redefines the broker_metrics view with the
 * broker's CRM phone (crm_phone, entered by an admin) as one new column at the end, so existing readers and the
 * metrics_reader grant keep working. Every other column is unchanged from 0008.
 *
 * Functions:
 * - none
 */
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
  c.self_generated_pct,
  b.crm_phone
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
