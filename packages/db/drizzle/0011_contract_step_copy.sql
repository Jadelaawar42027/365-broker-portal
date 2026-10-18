/*
 * File: packages/db/drizzle/0011_contract_step_copy.sql
 * Purpose: Hand-written data migration for contract signing (SPEC D31) and the lesson 2 bonus line. Each update only
 * runs while the row still has the exact earlier seeded wording, so anything an admin has edited is left alone:
 * step 2's title, copy and checklist become "Review and sign your agreements"; its What to do bullets become the
 * signing bullets; and lesson 2's bonus line matches contract section 2.8 ("90 days after"). Writes audit_log rows.
 *
 * Functions:
 * - none
 */
WITH updated AS (
  UPDATE onboarding_steps
  SET
    title = 'Review and sign your agreements',
    short_title = 'Broker Agreement & NDA',
    summary = 'Read your Broker Agreement and NDA, already filled in with your details, and sign both here. Takes about 10 minutes.',
    intro = 'Your Broker Agreement sets out how you work with 365 Yachts and your commission splits; the NDA protects our clients and systems. Both are filled in for you, and one signature signs both.',
    instructions_md = E'1. Open and read both documents.\n2. Enter your mailing address and license number, and check your phone and email.\n3. Sign once. Your signature goes on both documents.',
    config = '{"minutes":10,"reviewChecklist":["Both documents signed by the broker","Commission splits match the profile","Countersigned by 365 Yachts"]}'::jsonb,
    template_file_key = NULL,
    updated_at = now()
  WHERE key = 'contract_nda' AND title = 'Sign your Employment Contract & NDA'
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('title', 'Sign your Employment Contract & NDA'), jsonb_build_object('title', 'Review and sign your agreements')
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET
    todo_items = ARRAY[
      'Open both documents below and read them in full.',
      'Check your name, phone, email and commission splits.',
      'Enter your mailing address and, if you have one, your Florida license number.',
      'Sign once. Your signature goes on both, and you get signed copies by email.'
    ],
    updated_at = now()
  WHERE key = 'contract_nda'
    AND todo_items = ARRAY[
      'Download the contract and the NDA below.',
      'Read both in full.',
      'Sign and date every place marked for you.',
      'Upload the signed pages here, as a PDF scan or clear photos.'
    ]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', 'signing bullets (SPEC D31)')
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE lessons
  SET
    todo_items = array_replace(
      todo_items,
      'Bonuses and incentives can open within 90 days of your signed contract, once you''ve closed at least two deals.',
      'Bonuses and incentives open 90 days after your contract is signed, once you''ve closed at least two deals.'
    ),
    updated_at = now()
  WHERE todo_items @> ARRAY['Bonuses and incentives can open within 90 days of your signed contract, once you''ve closed at least two deals.']
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'training.lesson_updated', 'lesson', id, jsonb_build_object('bonusLine', 'matches contract section 2.8')
FROM updated;
