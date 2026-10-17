/*
 * File: packages/db/drizzle/0001_broker_metrics_view.sql
 * Purpose: Hand-written migration that creates the broker_metrics view (one row of metrics per broker, computed
 * live so it never goes stale) and the metrics_reader role, a NOLOGIN group that may only SELECT from that view
 * (SPEC D18). "Today" is Florida time so tenure matches what admins see.
 *
 * Functions:
 * - none
 */
CREATE VIEW "broker_metrics" AS
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
  GREATEST(s.last_step_activity_at, f.last_upload_at) AS last_activity_at
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
) f ON true;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metrics_reader') THEN
    CREATE ROLE metrics_reader NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO metrics_reader;
--> statement-breakpoint
GRANT SELECT ON broker_metrics TO metrics_reader;
