/*
 * File: packages/db/drizzle/0003_broker_training_metrics_view.sql
 * Purpose: Hand-written, additive migration that creates the broker_training_metrics view: per broker, how many live
 * Volume One chapters they have passed, their average best and first-attempt quiz scores, how many attempts they have
 * made and when they last did any training. A separate view so broker_metrics stays unchanged; metrics_reader may read it.
 *
 * Functions:
 * - none
 */
CREATE VIEW "broker_training_metrics" AS
WITH live_chapters AS (
  SELECT id FROM chapters WHERE status = 'live' AND volume = 1
),
per_chapter AS (
  SELECT
    a.broker_id,
    a.chapter_id,
    max(a.score_pct) AS best_score,
    bool_or(a.passed) AS passed,
    count(*) AS tries,
    (array_agg(a.score_pct ORDER BY a.attempt_number))[1] AS first_score,
    max(a.submitted_at) AS last_submitted_at
  FROM quiz_attempts a
  JOIN live_chapters lc ON lc.id = a.chapter_id
  WHERE a.status = 'submitted'
  GROUP BY a.broker_id, a.chapter_id
)
SELECT
  b.id AS broker_id,
  (SELECT count(*) FROM live_chapters)::int AS chapters_total,
  (count(pc.chapter_id) FILTER (WHERE pc.passed))::int AS chapters_passed,
  round(avg(pc.best_score))::int AS avg_best_score,
  round(avg(pc.first_score))::int AS avg_first_attempt_score,
  COALESCE(sum(pc.tries), 0)::int AS quiz_attempts,
  GREATEST(max(pc.last_submitted_at), (SELECT max(lp.updated_at) FROM lesson_progress lp WHERE lp.broker_id = b.id)) AS last_training_at
FROM brokers b
LEFT JOIN per_chapter pc ON pc.broker_id = b.id
GROUP BY b.id;
--> statement-breakpoint
GRANT SELECT ON broker_training_metrics TO metrics_reader;
