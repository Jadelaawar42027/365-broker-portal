/*
 * File: packages/db/drizzle/0019_final_onboarding_steps.sql
 * Purpose: Hand-written data migration (generated from packages/db/src/seed/steps.ts and step-guidance.ts) for the final
 * onboarding steps (SPEC D32): step 10 becomes "Log in to your 365 Yachts email" (no brand signature), the old
 * platform logins step is retired (its row and every broker's history stay), and three new steps take its place:
 * 11 CRM sign in and training (with the read-along transcript of Aj's video, and its video must be watched before it
 * can be ticked), 12 BoatWizard sign in, 13 YachtCloser sign in. Retired steps move to positions above
 * 100 so the new steps can use 11 to 13. The old step's three video slots move to the new steps with any video already
 * in them, and every broker gets a todo row for each new step. Step 10's copy only changes while it still has the exact
 * earlier seeded wording, so admin edits are left alone. On a new, empty database nothing is added here: the seed adds
 * every step. Writes audit_log rows.
 *
 * Functions:
 * - none
 */
WITH retired AS (
  UPDATE onboarding_steps
  SET active = false, position = position + 100, updated_at = now()
  WHERE key = 'platform_logins' AND active
  RETURNING id, position
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.retired', 'onboarding_step', id, jsonb_build_object('active', true, 'position', position - 100), jsonb_build_object('active', false, 'position', position)
FROM retired;
--> statement-breakpoint
WITH moved AS (
  UPDATE onboarding_steps
  SET position = position + 100, updated_at = now()
  WHERE NOT active AND position < 100
  RETURNING id, position
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.position_changed', 'onboarding_step', id, jsonb_build_object('position', position - 100), jsonb_build_object('position', position)
FROM moved;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO onboarding_steps (key, position, stage, title, short_title, summary, intro, kind, needs_approval, instructions_md, accepted_types, max_size_bytes, config, todo_items, callouts, full_text_md)
  SELECT
    'crm_login',
    11,
    'your_tools',
    $g$CRM sign in and training$g$,
    $g$CRM sign in and training$g$,
    $g$Watch Aj's CRM training, then sign in to GoHighLevel. Takes about 20 minutes.$g$,
    $g$GoHighLevel is your CRM. You'll spend most of your time in two places: Conversations and Opportunities. Watch Aj's training, read along if you like, then sign in.$g$,
    'confirm',
    false,
    $g$1. Watch the CRM training video.
2. Sign in to GoHighLevel with the login details you received.
3. Tick the box once you're signed in.$g$,
    ARRAY[]::text[],
    10485760,
    $g${"minutes":20,"confirmLabel":"I've watched the CRM training and signed in to GoHighLevel","fullTextLabel":"Read along with the video","fullTextSource":"Transcript","requireVideo":true}$g$::jsonb,
    ARRAY[$g$Watch the CRM training above. Open the transcript below to read along.$g$, $g$Work from Conversations: reply to, call and text every lead assigned to you.$g$, $g$After every contact, update the Broker outcome buttons and add a note.$g$, $g$Install the LeadConnector app to do the same on your phone.$g$, $g$Tick the box once you've watched it and signed in.$g$]::text[],
    $g$[{"kind":"HOUSE RULE","text":"Update the Broker outcome buttons after every contact. Shelly tracks your numbers from them."}]$g$::jsonb,
    $g$## The short version

- **Conversations** is where you'll spend 99% of your time: every lead assigned to you, their messages, and your calls and texts.
- Open a lead to **call** or **text** them. Calls and texts go out from your own 365 number, and when a lead calls back it rings your phone.
- **Broker outcomes** on the right: update them after every contact. This is how Shelly tracks your numbers.
- **Notes**: read the setter's call summary before every call, and add your own note at every step.
- **Opportunities** shows your pipeline. It's optional: the outcome buttons and notes are what matter.
- **LeadConnector** is the phone app version of the CRM, with the same features.

## What you'll see when you log in

All right guys, this is a quick overview of the CRM. First of all, this is what you'll be seeing. I'm logged in as Charlie right now; he's another one of our brokers. For you there's a much simpler view of everything, and realistically there are only two places you'll spend most of your time: **Conversations** and **Opportunities**.

## Conversations

Start with Conversations. This is where you'll be 99% of the time. Here you can see all your unread messages. If a lead sends you an inbound message, an inbound call or anything of the sort, it shows up here and you can reply to them. If they called you, it rings your phone, so you can get on a call directly and see the history there.

**All** shows every client, whether or not they sent you a message: a list of all the leads assigned to you. Go through them on a daily basis, follow up with everybody on your list, and carry on.

## Calling a lead

In the Conversations tab, on the left-hand side, choose any of the leads. There are three main things you can do. First, you can call. (I'll also show you how to do all of this on the phone later.)

Hit the call button. You'll be able to call on WhatsApp or just call normally. WhatsApp isn't enabled yet, so for now you'll just have regular calls. You have your own number assigned to you in the CRM, so calls automatically go out with your caller ID. And if the lead calls you back, it rings your personal phone and you can pick up.

## Texting and emailing a lead

The other thing you can do is send text messages. Type your message, then look at **From**: when I hit that button you'll see I'm sending from Charlie's number, because I'm logged into Charlie's account. Once you're logged into the CRM, it will show your number there.

You can also choose between **SMS** and **email**. If you want to send an email directly from the CRM, you can. We usually recommend sending from your own email because deliverability is better, but you always have the option here. You can ignore WhatsApp and iMessage for now; we'll go over those later.

To summarize so far: go to Conversations, choose a lead, and either hit call or type a message.

## Broker outcomes: how we track your leads

The next thing is super, super important: this is how we actually track these leads. On the right-hand side, under **Broker outcomes**, you choose what happened with the lead:

- **Call performed**: you had the call.
- **No show**: they didn't show up to the call.
- **Showing scheduled** and **Showing performed**.
- **Sale closed**.
- **Ghosted**, or **Lead lost**.

All of this connects to our back end, so Shelly can track your numbers from these buttons. It's almost as important as following up with the leads.

> [!HOUSE RULE]
> Update the Broker outcome buttons after every contact. Shelly tracks your numbers from them.

## Notes

Also on the right-hand side is the **Notes** section. Click it and you'll see all the previous notes on the lead. At the top is the call summary from the setter: when the setter books a call, they write down everything about the lead and send it over to you.

It's also super important that you write notes at every step of the process. For example, on August 27 Charlie added a note, then "Emailed proof of funds document", then on August 31 "Sent an email".

To add one, click the **pencil icon** on the right-hand side, click **Add a note** at the top, type whatever you want, and hit **Save**.

So again: on the right you have the contact fields, where you update the outcome buttons, and the Notes tab at the bottom. Click between them to switch.

## When a lead is booked with you

When a lead is booked with you, you'll get an SMS confirmation, something like: "Hey, a new lead, Jay Johnson, was just booked with you." He'll show up in your CRM: click **All** and the lead is right there. Click **Notes** to see all the setter's notes and when he's booked for.

For example, this lead was booked for 10:30 AM, and that also shows up on your calendar. So you know: I have to call this lead at 10:30. Here are his notes. Let me send him some listings beforehand.

## Opportunities

The other tab that's pretty important is **Opportunities**. Here you can see your leads at every step of the process. For example, Charlie has Brent and Jay Johnson in his early pipeline stages. You can move them through the pipeline: if Brent is becoming a hot lead, drag him onto **Hot lead**, or onto **Showing booked**, or wherever he is.

This part is for you, and it isn't required. If you want to keep it simple, ignore everything else: spend your time in the Conversations tab, see all your leads, follow up with all of them by text and call, and update the outcome buttons and notes. That's all you really have to do.

## The LeadConnector phone app

Now I'll show you the same thing on the phone. I'll leave a message under this video on how to set up your accounts, because you've both received the access emails. The app is called **LeadConnector**: it's the phone version of the CRM, with all the same features. On my phone I can't log in as Charlie, so this is my main account, but it's the exact same features.

At the bottom, **Conversations** is the second button. Here you'll see all the leads assigned to you. Mine shows everybody, but yours is filtered to just your leads.

Say Jade is one of your leads: just tap the lead and it opens their contact. From here you can send an SMS. It says **Using** and then a phone number: that's my number, Aj's number, because I'm the one texting. It automatically uses your number, so you never have to switch numbers unless you mean to message from a different one, like a setter's. Type your message and send it. In the top right, under the three dots, is the **call** button. I won't tap it, because it would start a call, but that's where you call from.

The last thing: to get to the notes, tap the lead's **name**. The first thing you'll see is the **Broker outcome** buttons, so update those to whatever happened: call performed, no show, and so on. Scroll right along the little list and you'll find **Notes**, with all the setter's notes. (Mine are in Spanish because that's where I'm based; yours will be in English.)

It's just like the Conversations tab on your computer, only each part gets its own screen:

1. The lead list is the left-hand column on your computer.
2. Tapping a lead opens the middle column, where you call and text.
3. Tapping their name opens the right-hand column, with the outcome buttons and notes.

## That's it

Very simple and self-explanatory. If you have any questions, feel free to reach out and I'll sort them out. You have access now, so go play around, test things out and see how it goes.$g$
  WHERE EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'start_here')
  ON CONFLICT (key) DO NOTHING
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.created', 'onboarding_step', id, jsonb_build_object('key', 'crm_login', 'position', 11, 'title', $g$CRM sign in and training$g$)
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO onboarding_steps (key, position, stage, title, short_title, summary, intro, kind, needs_approval, instructions_md, accepted_types, max_size_bytes, config, todo_items, callouts, full_text_md)
  SELECT
    'boatwizard_login',
    12,
    'your_tools',
    $g$Sign in to BoatWizard$g$,
    $g$BoatWizard sign in$g$,
    $g$Sign in to BoatWizard, the MLS, and run one practice search. Takes about 10 minutes.$g$,
    $g$BoatWizard / YachtWorld is the MLS: listings, buyer searches and sold comps.$g$,
    'confirm',
    false,
    $g$1. Sign in to BoatWizard with the login details you received.
2. Run one practice search.
3. Tick the box once you've done it.$g$,
    ARRAY[]::text[],
    10485760,
    $g${"minutes":10,"confirmLabel":"I signed in to BoatWizard and ran one practice search"}$g$::jsonb,
    ARRAY[$g$Sign in to BoatWizard with the login details you received.$g$, $g$Run one practice search for a boat a client might want.$g$, $g$Look at a few sold comps to see recent prices.$g$, $g$Tick the box below once you've done it.$g$]::text[],
    $g$[]$g$::jsonb,
    $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

## Days 1–7 (Your first 90 days)

**Get legal, get logged in, get loud** — Paperwork submitted, licensing started, all four platforms accessed. Build your contact list: everyone you know who owns a boat, works on boats, or is wealthy enough to buy one. Target 100 names in the CRM by day seven.$g$
  WHERE EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'start_here')
  ON CONFLICT (key) DO NOTHING
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.created', 'onboarding_step', id, jsonb_build_object('key', 'boatwizard_login', 'position', 12, 'title', $g$Sign in to BoatWizard$g$)
FROM inserted;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO onboarding_steps (key, position, stage, title, short_title, summary, intro, kind, needs_approval, instructions_md, accepted_types, max_size_bytes, config, todo_items, callouts, full_text_md)
  SELECT
    'yachtcloser_login',
    13,
    'your_tools',
    $g$Sign in to YachtCloser$g$,
    $g$YachtCloser sign in$g$,
    $g$Sign in to YachtCloser and review a sample deal file. Takes about 10 minutes.$g$,
    $g$YachtCloser handles contracts, e-signatures, deals and closing statements.$g$,
    'confirm',
    false,
    $g$1. Sign in to YachtCloser with the login details you received.
2. Open a sample deal file and look through it.
3. Tick the box once you've done it.$g$,
    ARRAY[]::text[],
    10485760,
    $g${"minutes":10,"confirmLabel":"I signed in to YachtCloser and reviewed a sample deal file"}$g$::jsonb,
    ARRAY[$g$Sign in to YachtCloser with the login details you received.$g$, $g$Open a sample deal file and look through it.$g$, $g$Tick the box below once you've done it.$g$]::text[],
    $g$[]$g$::jsonb,
    $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

## Week 1 checklist (Module 06)

- Logged into BoatWizard, YachtCloser, and GoHighLevel$g$
  WHERE EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'start_here')
  ON CONFLICT (key) DO NOTHING
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.created', 'onboarding_step', id, jsonb_build_object('key', 'yachtcloser_login', 'position', 13, 'title', $g$Sign in to YachtCloser$g$)
FROM inserted;
--> statement-breakpoint
WITH moved AS (
  UPDATE step_videos
  SET step_id = (SELECT id FROM onboarding_steps WHERE key = 'crm_login'), position = 1, title = $g$CRM sign in and training$g$, updated_at = now()
  WHERE title = $g$GoHighLevel CRM walkthrough$g$
    AND step_id = (SELECT id FROM onboarding_steps WHERE key = 'platform_logins')
    AND EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'crm_login')
    AND NOT EXISTS (SELECT 1 FROM step_videos v JOIN onboarding_steps s ON s.id = v.step_id WHERE s.key = 'crm_login')
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_moved', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', $g$CRM sign in and training$g$, 'fromStep', 'platform_logins', 'fromTitle', $g$GoHighLevel CRM walkthrough$g$)
FROM moved;
--> statement-breakpoint
WITH moved AS (
  UPDATE step_videos
  SET step_id = (SELECT id FROM onboarding_steps WHERE key = 'boatwizard_login'), position = 1, title = $g$BoatWizard walkthrough$g$, updated_at = now()
  WHERE title = $g$BoatWizard walkthrough$g$
    AND step_id = (SELECT id FROM onboarding_steps WHERE key = 'platform_logins')
    AND EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'boatwizard_login')
    AND NOT EXISTS (SELECT 1 FROM step_videos v JOIN onboarding_steps s ON s.id = v.step_id WHERE s.key = 'boatwizard_login')
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_moved', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', $g$BoatWizard walkthrough$g$, 'fromStep', 'platform_logins', 'fromTitle', $g$BoatWizard walkthrough$g$)
FROM moved;
--> statement-breakpoint
WITH moved AS (
  UPDATE step_videos
  SET step_id = (SELECT id FROM onboarding_steps WHERE key = 'yachtcloser_login'), position = 1, title = $g$YachtCloser walkthrough$g$, updated_at = now()
  WHERE title = $g$YachtCloser walkthrough$g$
    AND step_id = (SELECT id FROM onboarding_steps WHERE key = 'platform_logins')
    AND EXISTS (SELECT 1 FROM onboarding_steps WHERE key = 'yachtcloser_login')
    AND NOT EXISTS (SELECT 1 FROM step_videos v JOIN onboarding_steps s ON s.id = v.step_id WHERE s.key = 'yachtcloser_login')
  RETURNING id, step_id
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_moved', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', $g$YachtCloser walkthrough$g$, 'fromStep', 'platform_logins', 'fromTitle', $g$YachtCloser walkthrough$g$)
FROM moved;
--> statement-breakpoint
WITH inserted AS (
  INSERT INTO step_videos (step_id, position, title)
  SELECT s.id, 1, CASE s.key WHEN 'crm_login' THEN $g$CRM sign in and training$g$ WHEN 'boatwizard_login' THEN $g$BoatWizard walkthrough$g$ WHEN 'yachtcloser_login' THEN $g$YachtCloser walkthrough$g$ END
  FROM onboarding_steps s
  WHERE s.key IN ('crm_login', 'boatwizard_login', 'yachtcloser_login')
    AND NOT EXISTS (SELECT 1 FROM step_videos v WHERE v.step_id = s.id)
  RETURNING id, step_id, title
)
INSERT INTO audit_log (action, entity_type, entity_id, after)
SELECT 'step.video_slot_added', 'onboarding_step', step_id, jsonb_build_object('videoId', id, 'title', title)
FROM inserted;
--> statement-breakpoint
INSERT INTO broker_steps (broker_id, step_id)
SELECT b.id, s.id
FROM brokers b
CROSS JOIN onboarding_steps s
WHERE s.key IN ('crm_login', 'boatwizard_login', 'yachtcloser_login')
  AND NOT EXISTS (SELECT 1 FROM broker_steps bs WHERE bs.broker_id = b.id AND bs.step_id = s.id);
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET title = $g$Log in to your 365 Yachts email$g$, updated_at = now()
  WHERE key = 'email_signature' AND title = $g$Activate your 365 email and install the brand signature$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('title', $g$"Activate your 365 email and install the brand signature"$g$::jsonb), jsonb_build_object('title', $g$"Log in to your 365 Yachts email"$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET short_title = $g$Log in to your 365 email$g$, updated_at = now()
  WHERE key = 'email_signature' AND short_title = $g$365 email + brand signature$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('shortTitle', $g$"365 email + brand signature"$g$::jsonb), jsonb_build_object('shortTitle', $g$"Log in to your 365 email"$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET summary = $g$Sign in to the 365 Yachts email we made for you and pick your own password. Takes about 5 minutes.$g$, updated_at = now()
  WHERE key = 'email_signature' AND summary = $g$All client communication runs through your 365 email with the brand signature. Takes about 10 minutes.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('summary', $g$"All client communication runs through your 365 email with the brand signature. Takes about 10 minutes."$g$::jsonb), jsonb_build_object('summary', $g$"Sign in to the 365 Yachts email we made for you and pick your own password. Takes about 5 minutes."$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = $g$All your client email runs through your 365 Yachts address. Your email address and starting password are below.$g$, updated_at = now()
  WHERE key = 'email_signature' AND intro = $g$House rule: anything that counts as a record goes through your 365 Yachts email with the brand signature. Texts and calls are fine, but never use personal email for client business.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$"House rule: anything that counts as a record goes through your 365 Yachts email with the brand signature. Texts and calls are fine, but never use personal email for client business."$g$::jsonb), jsonb_build_object('intro', $g$"All your client email runs through your 365 Yachts address. Your email address and starting password are below."$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET instructions_md = $g$1. Open Gmail and sign in with your 365 email and the starting password below.
2. Pick your own password when Google asks.
3. Tick the box once you're signed in.$g$, updated_at = now()
  WHERE key = 'email_signature' AND instructions_md = $g$1. Sign in to your 365 Yachts email with the details you received.
2. Install the 365 brand signature block with the logo.
3. Send yourself a test email to check the signature looks right.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('instructionsMd', $g$"1. Sign in to your 365 Yachts email with the details you received.\n2. Install the 365 brand signature block with the logo.\n3. Send yourself a test email to check the signature looks right."$g$::jsonb), jsonb_build_object('instructionsMd', $g$"1. Open Gmail and sign in with your 365 email and the starting password below.\n2. Pick your own password when Google asks.\n3. Tick the box once you're signed in."$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || jsonb_build_object('confirmLabel', $g$I've logged in to my 365 Yachts email$g$, 'minutes', 5), updated_at = now()
  WHERE key = 'email_signature' AND config ->> 'confirmLabel' = $g$I've activated my 365 email and installed the brand signature$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, jsonb_build_object('confirmLabel', $g$I've activated my 365 email and installed the brand signature$g$, 'minutes', 10), jsonb_build_object('confirmLabel', $g$I've logged in to my 365 Yachts email$g$, 'minutes', 5)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Open Gmail and sign in with your 365 email and the starting password below.$g$, $g$Google asks you to pick your own password. Choose one only you know.$g$, $g$From now on, use this address for all client email.$g$, $g$Tick the box below once you're signed in.$g$]::text[], updated_at = now()
  WHERE key = 'email_signature' AND todo_items = ARRAY[$g$Sign in to your 365 Yachts email.$g$, $g$Install the 365 brand signature with the logo.$g$, $g$Send yourself a test email to check it.$g$, $g$From now on, use this address for all client email.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Sign in to your 365 Yachts email.","Install the 365 brand signature with the logo.","Send yourself a test email to check it.","From now on, use this address for all client email."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Open Gmail and sign in with your 365 email and the starting password below.","Google asks you to pick your own password. Choose one only you know.","From now on, use this address for all client email.","Tick the box below once you're signed in."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET callouts = $g$[{"kind":"HOUSE RULE","text":"All client email goes through your 365 address. Texts and calls are fine."}]$g$::jsonb, updated_at = now()
  WHERE key = 'email_signature' AND callouts = $g$[{"kind":"HOUSE RULE","text":"All client email goes through your 365 address with the brand signature. Texts and calls are fine."}]$g$::jsonb
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('callouts', $g$[{"kind":"HOUSE RULE","text":"All client email goes through your 365 address with the brand signature. Texts and calls are fine."}]$g$::jsonb), jsonb_build_object('callouts', $g$[{"kind":"HOUSE RULE","text":"All client email goes through your 365 address. Texts and calls are fine."}]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET full_text_md = $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

> [!HOUSE RULE]
> All client communication runs through your 365 Yachts email address. This is a compliance and brand-consistency requirement, not a preference. Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.

## Week 1 checklist (Module 06)

- 365 email active$g$, updated_at = now()
  WHERE key = 'email_signature' AND full_text_md = $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Install the 365 brand signature block with logo |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

> [!HOUSE RULE]
> All client communication runs through your 365 Yachts email address with the brand signature. This is a compliance and brand-consistency requirement, not a preference. Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.

## Week 1 checklist (Module 06)

- 365 email active, brand signature installed$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('fullTextMd', $g$"## Platform credentials you will receive\n\n| Platform | What it is for | First action |\n|---|---|---|\n| 365 Yachts Email | All client communication. No personal email for client business, ever. | Install the 365 brand signature block with logo |\n| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |\n| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |\n| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |\n\n> [!HOUSE RULE]\n> All client communication runs through your 365 Yachts email address with the brand signature. This is a compliance and brand-consistency requirement, not a preference. Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.\n\n## Week 1 checklist (Module 06)\n\n- 365 email active, brand signature installed"$g$::jsonb), jsonb_build_object('fullTextMd', $g$"## Platform credentials you will receive\n\n| Platform | What it is for | First action |\n|---|---|---|\n| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |\n| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |\n| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |\n| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |\n\n> [!HOUSE RULE]\n> All client communication runs through your 365 Yachts email address. This is a compliance and brand-consistency requirement, not a preference. Texts and calls are fine and encouraged — but anything that constitutes a record goes through the corporate account.\n\n## Week 1 checklist (Module 06)\n\n- 365 email active"$g$::jsonb)
FROM updated;
