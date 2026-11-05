/*
 * File: packages/db/drizzle/0017_start_here_ai_agent.sql
 * Purpose: Hand-written data migration (generated from packages/db/src/seed/steps.ts and step-guidance.ts) for step 0
 * "Start here": Aj now presents both videos. The walkthrough slot becomes "Part 1: Aj walks you through the platform",
 * a second slot "Part 2: Introducing Your Personal AI Agent" is added, and the summary, intro, instructions and What
 * to do bullets mention both. Every change only runs while the step still has the exact earlier seeded value, so
 * admin edits are left alone. Writes audit_log rows.
 *
 * Functions:
 * - none
 */
WITH updated AS (
  UPDATE onboarding_steps
  SET summary = $g$Watch two short videos from Aj before you begin: the portal walkthrough and your personal AI agent. Takes about 10 minutes.$g$, updated_at = now()
  WHERE key = 'start_here' AND summary = $g$Watch a short walkthrough of the portal before you begin. Takes about 10 minutes.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('summary', $g$Watch a short walkthrough of the portal before you begin. Takes about 10 minutes.$g$), jsonb_build_object('summary', $g$Watch two short videos from Aj before you begin: the portal walkthrough and your personal AI agent. Takes about 10 minutes.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = $g$Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after. Then Aj introduces your personal AI agent.$g$, updated_at = now()
  WHERE key = 'start_here' AND intro = $g$Shelly shows you around the portal: your checklist, sending each step, getting help, and what happens after.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$Shelly shows you around the portal: your checklist, sending each step, getting help, and what happens after.$g$), jsonb_build_object('intro', $g$Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after. Then Aj introduces your personal AI agent.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET instructions_md = $g$1. Watch Part 1: Aj walks you through the platform.
2. Watch Part 2: Aj introduces your personal AI agent.
3. Tick the box to say you've watched both.$g$, updated_at = now()
  WHERE key = 'start_here' AND instructions_md = $g$1. Watch the walkthrough video.
2. Tick the box to say you've watched it.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('instructionsMd', $g$1. Watch the walkthrough video.
2. Tick the box to say you've watched it.$g$), jsonb_build_object('instructionsMd', $g$1. Watch Part 1: Aj walks you through the platform.
2. Watch Part 2: Aj introduces your personal AI agent.
3. Tick the box to say you've watched both.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Watch both videos above: Aj walks you through the platform, then introduces your personal AI agent.$g$, $g$Your checklist always shows the next step to do.$g$, $g$Open a step, follow What to do, then send it in.$g$, $g$Stuck? Tap Message Shelly on WhatsApp on any step.$g$, $g$Tick the box below once you've watched both.$g$]::text[], updated_at = now()
  WHERE key = 'start_here' AND todo_items = ARRAY[$g$Watch the walkthrough video above.$g$, $g$Your checklist always shows the next step to do.$g$, $g$Open a step, follow What to do, then send it in.$g$, $g$Stuck? Tap Message Shelly on WhatsApp on any step.$g$, $g$Tick the box below once you've watched it.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Watch the walkthrough video above.","Your checklist always shows the next step to do.","Open a step, follow What to do, then send it in.","Stuck? Tap Message Shelly on WhatsApp on any step.","Tick the box below once you've watched it."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Watch both videos above: Aj walks you through the platform, then introduces your personal AI agent.","Your checklist always shows the next step to do.","Open a step, follow What to do, then send it in.","Stuck? Tap Message Shelly on WhatsApp on any step.","Tick the box below once you've watched both."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE step_videos
  SET title = $g$Part 1: Aj walks you through the platform$g$, updated_at = now()
  WHERE title = $g$How to use the 365 portal$g$ AND step_id IN (SELECT id FROM onboarding_steps WHERE key = 'start_here')
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.video_renamed', 'onboarding_step', step_id, jsonb_build_object('title', $g$How to use the 365 portal$g$), jsonb_build_object('videoId', id, 'title', $g$Part 1: Aj walks you through the platform$g$)
FROM updated;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO step_videos (step_id, position, title)
  SELECT s.id, COALESCE((SELECT max(v.position) FROM step_videos v WHERE v.step_id = s.id), 0) + 1, $g$Part 2: Introducing Your Personal AI Agent$g$
  FROM onboarding_steps s
  WHERE s.key = 'start_here'
    AND NOT EXISTS (SELECT 1 FROM step_videos v WHERE v.step_id = s.id AND v.title = $g$Part 2: Introducing Your Personal AI Agent$g$)
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_slot_added', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', $g$Part 2: Introducing Your Personal AI Agent$g$)
FROM inserted;
