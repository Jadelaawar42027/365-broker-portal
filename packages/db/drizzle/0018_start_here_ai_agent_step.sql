/*
 * File: packages/db/drizzle/0018_start_here_ai_agent_step.sql
 * Purpose: Hand-written data migration (generated from packages/db/src/seed/steps.ts, step-guidance.ts and
 * license-paths.ts) that gives Aj's "Part 2: Introducing Your Personal AI Agent" video its own onboarding step: a new
 * step 1 "ai_agent" in the Start here stage, every later step moves up one number, the Part 2 video slot (with any
 * video already in it) moves from step 0 to the new step, step 0's copy goes back to one video, and step copy that
 * names step numbers is renumbered. Every broker gets a todo row for the new step. On a new, empty database nothing
 * happens here: the seed adds every step. Copy changes only run while the
 * step still has the exact earlier seeded wording, so admin edits are left alone. Writes audit_log rows.
 *
 * Functions:
 * - none
 */
UPDATE onboarding_steps
SET position = position + 1000
WHERE position >= 1 AND NOT EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'ai_agent');
--> statement-breakpoint
WITH moved AS (
  UPDATE onboarding_steps
  SET position = position - 999, updated_at = now()
  WHERE position >= 1000
  RETURNING id, position
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.position_changed', 'onboarding_step', id, jsonb_build_object('position', position - 1), jsonb_build_object('position', position)
FROM moved;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO onboarding_steps (key, position, stage, title, short_title, summary, intro, kind, needs_approval, instructions_md, accepted_types, max_size_bytes, config, todo_items, callouts, full_text_md)
  SELECT
    'ai_agent',
    1,
    'start_here',
    $g$Introducing your personal AI agent$g$,
    $g$Start here: your personal AI agent$g$,
    $g$Watch Aj introduce your personal AI agent. Takes about 5 minutes.$g$,
    $g$Part 2 of Start here: Aj introduces your personal AI agent.$g$,
    'confirm',
    false,
    $g$1. Watch Part 2: Aj introduces your personal AI agent.
2. Tick the box to say you've watched it.$g$,
    ARRAY[]::text[],
    10485760,
    $g${"minutes":5,"confirmLabel":"I've watched the AI agent video"}$g$::jsonb,
    ARRAY[$g$Watch the video above: Aj introduces your personal AI agent.$g$, $g$Stuck? Tap Message Shelly on WhatsApp on any step.$g$, $g$Tick the box below once you've watched it.$g$]::text[],
    '[]'::jsonb,
    ''
  WHERE EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'start_here')
  ON CONFLICT (key) DO NOTHING
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.created', 'onboarding_step', id, jsonb_build_object('key', 'ai_agent', 'position', 1, 'title', $g$Introducing your personal AI agent$g$)
FROM inserted;
--> statement-breakpoint
WITH moved AS (
  UPDATE step_videos
  SET step_id = (SELECT id FROM onboarding_steps WHERE key = 'ai_agent'), position = 1, updated_at = now()
  WHERE title = $g$Part 2: Introducing Your Personal AI Agent$g$
    AND step_id = (SELECT id FROM onboarding_steps WHERE key = 'start_here')
    AND NOT EXISTS (SELECT 1 FROM step_videos v JOIN onboarding_steps s ON s.id = v.step_id WHERE s.key = 'ai_agent')
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_moved', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', $g$Part 2: Introducing Your Personal AI Agent$g$, 'fromStep', 'start_here')
FROM moved;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO step_videos (step_id, position, title)
  SELECT s.id, 1, $g$Part 2: Introducing Your Personal AI Agent$g$
  FROM onboarding_steps s
  WHERE s.key = 'ai_agent'
    AND NOT EXISTS (SELECT 1 FROM step_videos v WHERE v.step_id = s.id)
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_slot_added', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', $g$Part 2: Introducing Your Personal AI Agent$g$)
FROM inserted;
--> statement-breakpoint
INSERT INTO broker_steps (broker_id, step_id)
SELECT b.id, s.id
FROM brokers b
CROSS JOIN onboarding_steps s
WHERE s.key = 'ai_agent'
  AND NOT EXISTS (SELECT 1 FROM broker_steps bs WHERE bs.broker_id = b.id AND bs.step_id = s.id);
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET summary = $g$Watch Aj's short walkthrough of the portal before you begin. Takes about 10 minutes.$g$, updated_at = now()
  WHERE key = 'start_here' AND summary = $g$Watch two short videos from Aj before you begin: the portal walkthrough and your personal AI agent. Takes about 10 minutes.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('summary', $g$Watch two short videos from Aj before you begin: the portal walkthrough and your personal AI agent. Takes about 10 minutes.$g$), jsonb_build_object('summary', $g$Watch Aj's short walkthrough of the portal before you begin. Takes about 10 minutes.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = $g$Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after.$g$, updated_at = now()
  WHERE key = 'start_here' AND intro = $g$Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after. Then Aj introduces your personal AI agent.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after. Then Aj introduces your personal AI agent.$g$), jsonb_build_object('intro', $g$Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET instructions_md = $g$1. Watch Part 1: Aj walks you through the platform.
2. Tick the box to say you've watched it.$g$, updated_at = now()
  WHERE key = 'start_here' AND instructions_md = $g$1. Watch Part 1: Aj walks you through the platform.
2. Watch Part 2: Aj introduces your personal AI agent.
3. Tick the box to say you've watched both.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('instructionsMd', $g$1. Watch Part 1: Aj walks you through the platform.
2. Watch Part 2: Aj introduces your personal AI agent.
3. Tick the box to say you've watched both.$g$), jsonb_build_object('instructionsMd', $g$1. Watch Part 1: Aj walks you through the platform.
2. Tick the box to say you've watched it.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Watch the video above: Aj walks you through the platform.$g$, $g$Your checklist always shows the next step to do.$g$, $g$Open a step, follow What to do, then send it in.$g$, $g$Stuck? Tap Message Shelly on WhatsApp on any step.$g$, $g$Tick the box below once you've watched it.$g$]::text[], updated_at = now()
  WHERE key = 'start_here' AND todo_items = ARRAY[$g$Watch both videos above: Aj walks you through the platform, then introduces your personal AI agent.$g$, $g$Your checklist always shows the next step to do.$g$, $g$Open a step, follow What to do, then send it in.$g$, $g$Stuck? Tap Message Shelly on WhatsApp on any step.$g$, $g$Tick the box below once you've watched both.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Watch both videos above: Aj walks you through the platform, then introduces your personal AI agent.","Your checklist always shows the next step to do.","Open a step, follow What to do, then send it in.","Stuck? Tap Message Shelly on WhatsApp on any step.","Tick the box below once you've watched both."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Watch the video above: Aj walks you through the platform.","Your checklist always shows the next step to do.","Open a step, follow What to do, then send it in.","Stuck? Tap Message Shelly on WhatsApp on any step.","Tick the box below once you've watched it."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 8 and 9 will show you exactly what to do.$g$, updated_at = now()
  WHERE key = 'license_situation' AND intro = $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 7 and 8 will show you exactly what to do.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 7 and 8 will show you exactly what to do.$g$), jsonb_build_object('intro', $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 8 and 9 will show you exactly what to do.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = array_replace(todo_items, $g$Your answer sets what you see in steps 7 and 8.$g$, $g$Your answer sets what you see in steps 8 and 9.$g$), updated_at = now()
  WHERE key = 'license_situation' AND $g$Your answer sets what you see in steps 7 and 8.$g$ = ANY (todo_items)
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItem', $g$Your answer sets what you see in steps 7 and 8.$g$), jsonb_build_object('todoItem', $g$Your answer sets what you see in steps 8 and 9.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = replace(
        replace(config::text, $g$You'll need the copy in step 8.$g$, $g$You'll need the copy in step 9.$g$),
        $g$You'll upload your license and bond copy in step 8.$g$, $g$You'll upload your license and bond copy in step 9.$g$
      )::jsonb,
      updated_at = now()
  WHERE key = 'dbpr_filing'
    AND (config::text LIKE $g$%You'll need the copy in step 8.%$g$ OR config::text LIKE $g$%You'll upload your license and bond copy in step 8.%$g$)
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, jsonb_build_object('paths', 'licensing guide points to step 8 for the license and bond copies'), jsonb_build_object('paths', 'licensing guide points to step 9 for the license and bond copies')
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = replace(
        replace(
          replace(config::text, $g$It can take a little while after step 7, so$g$, $g$It can take a little while after step 8, so$g$),
          $g$before you mailed the original in step 7.$g$, $g$before you mailed the original in step 8.$g$
        ),
        $g$Finish step 7 with Shelly first.$g$, $g$Finish step 8 with Shelly first.$g$
      )::jsonb,
      updated_at = now()
  WHERE key = 'license_bond'
    AND (
      config::text LIKE $g$%It can take a little while after step 7, so%$g$
      OR config::text LIKE $g$%before you mailed the original in step 7.%$g$
      OR config::text LIKE $g$%Finish step 7 with Shelly first.%$g$
    )
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, jsonb_build_object('paths', 'licensing guides point back to step 7 for the DBPR filing'), jsonb_build_object('paths', 'licensing guides point back to step 8 for the DBPR filing')
FROM updated;
