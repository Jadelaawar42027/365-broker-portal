/*
 * File: packages/db/drizzle/0016_licensing_guides.sql
 * Purpose: Hand-written data migration (generated from packages/db/src/seed/license-paths.ts and step-guidance.ts) for
 * the clearer licensing steps: step 6 gets three answers that don't overlap and "not sure" emails the admins; steps 7
 * and 8 get a numbered guide per step 6 answer (config.paths); the DBPR step links to the Yacht and Ship forms page and
 * its full text gets real links; and the What to do bullets of photo ID, headshot and steps 6 to 8 match the new
 * upload rules. Every change only runs while the step still has the exact earlier seeded value, so admin edits are
 * left alone. Writes audit_log rows.
 *
 * Functions:
 * - none
 */
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || jsonb_build_object('choices', $g$[{"value":"new","label":"I don't have a Florida yacht & ship license yet. I'll apply for a new salesperson license (most new brokers pick this)"},{"value":"transfer","label":"I already have a Florida yacht & ship license with another brokerage, and I'll move it to 365"},{"value":"not_licensed_yet","label":"I'm not sure what I have or what I need. I'd like help first"}]$g$::jsonb), updated_at = now()
  WHERE key = 'license_situation' AND config -> 'choices' = $g$[{"value":"new","label":"New to Florida brokerage — I'll apply for a new license"},{"value":"transfer","label":"I hold a Florida yacht & ship license and will transfer it to 365"},{"value":"not_licensed_yet","label":"Not licensed yet — I need help getting started"}]$g$::jsonb
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('choices', $g$[{"value":"new","label":"New to Florida brokerage — I'll apply for a new license"},{"value":"transfer","label":"I hold a Florida yacht & ship license and will transfer it to 365"},{"value":"not_licensed_yet","label":"Not licensed yet — I need help getting started"}]$g$::jsonb), jsonb_build_object('choices', $g$[{"value":"new","label":"I don't have a Florida yacht & ship license yet. I'll apply for a new salesperson license (most new brokers pick this)"},{"value":"transfer","label":"I already have a Florida yacht & ship license with another brokerage, and I'll move it to 365"},{"value":"not_licensed_yet","label":"I'm not sure what I have or what I need. I'd like help first"}]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || jsonb_build_object('alertChoices', $g$["not_licensed_yet"]$g$::jsonb), updated_at = now()
  WHERE key = 'license_situation' AND NOT config ? 'alertChoices'
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, '{}'::jsonb, jsonb_build_object('alertChoices', $g$["not_licensed_yet"]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = CASE WHEN intro = $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand.$g$ THEN $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 7 and 8 will show you exactly what to do.$g$ ELSE intro END,
      instructions_md = CASE WHEN instructions_md = $g$1. Pick the option that describes you today.
2. Not sure? Pick "Not licensed yet" and we'll help you work it out.$g$ THEN $g$1. Pick the option that describes you today.
2. Not sure? Pick the last option and we'll message you to work it out together.$g$ ELSE instructions_md END,
      updated_at = now()
  WHERE key = 'license_situation' AND (intro = $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand.$g$ OR instructions_md = $g$1. Pick the option that describes you today.
2. Not sure? Pick "Not licensed yet" and we'll help you work it out.$g$)
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand.$g$), jsonb_build_object('intro', $g$Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 7 and 8 will show you exactly what to do.$g$)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || jsonb_build_object('paths', $g${"fromStep":"license_situation","options":[{"value":"new","heading":"Applying for a new salesperson license","bodyMd":"Most new brokers are here. It takes about an hour of your own time spread over a few days, plus the bond and the DBPR fee. Do these in order.\n\n1. **Message Shelly first.** Ask her for 365 Yachts Inc.'s employing broker details: company name, address and DBPR license number. You'll copy them onto the application in step 5.\n2. **Buy a $10,000 surety bond.** A bond is a guarantee you buy from a bond company. It is not money you hand to DBPR. Search online for \"Florida yacht salesperson bond\", or ask any insurance agent. Tell them it's for a **Florida yacht and ship salesperson license (Chapter 326)**. You pay a small part of the $10,000, depending on your credit. As a new licensee you get a **paper original with a raised seal**. Keep it safe: you'll mail it to DBPR.\n3. **Scan the bond to PDF before you mail it.** You'll need the copy in step 8. iPhone: open the Notes app, tap the camera icon, then Scan Documents. Android: open Google Drive, tap +, then Scan.\n4. **Get your fingerprints taken (Livescan).** Pick a location from the [FDLE list of Livescan providers](https://www.fdle.state.fl.us/criminal-history-records/registered-livescan-submitters) and bring your photo ID. Tell them it's for a **Chapter 326 yacht and ship license** and give them **ORI number FL921900Z** (the DBPR Yacht and Ship section). A wrong ORI means DBPR never gets your results. Keep the receipt. Fingerprints must be less than 6 months old when DBPR receives your application.\n5. **Fill in the application: DBPR Form YS 6000-1.** Download it from the [DBPR Yacht and Ship forms page](https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/). Choose **Salesperson**: a broker license needs a salesperson license plus sales experience first. Enter 365 Yachts Inc. as your employing broker, using the details from Shelly. Sign and date it.\n6. **Pay the fee.** DBPR lists **$551** (application plus fingerprint processing). Amounts change, so check the form or the [licensing page](https://www2.myfloridalicense.com/yacht-and-ships/licensing/) for the current fee and how to pay.\n7. **Send DBPR your application, the original bond and the fee**, to the address on the form. Not sure about anything? Call the Yacht and Ship Brokers' Section on **850-487-2987**.\n8. **Message Shelly the day you send it.**\n9. **Upload your proof below.** Scan your signed application and your fingerprint receipt into one PDF and upload it. iPhone: open the Notes app, tap the camera icon, then Scan Documents. Android: open Google Drive, tap +, then Scan.\n\n**What happens next:** DBPR issues a **temporary 90-day license** while the FBI background check runs, then your permanent two-year license. You'll upload your license and bond copy in step 8."},{"value":"transfer","heading":"Moving your license to 365","bodyMd":"You already hold a Florida yacht & ship license with another brokerage. Moving it to 365 is paperwork only. Do these in order.\n\n1. **Message Shelly first.** Ask her for 365 Yachts Inc.'s employing broker details: company name, address and DBPR license number. If you hold a **broker** license rather than a salesperson license, tell her: the paperwork is different.\n2. **Tell your current brokerage you're leaving.** By law your license is held by your employing broker, and when you leave they must send it back to DBPR. Ask them to do that now.\n3. **Fill in the Yacht and Ship Broker Change Form.** Download it from the [DBPR Yacht and Ship forms page](https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/). Mark it as a **change of employing broker** and enter 365 Yachts Inc.'s details from Shelly. Sign and date it.\n4. **Include the change fee.** DBPR's FAQ lists **$100** for changing brokerage. Check the form for the current amount and how to pay.\n5. **Send DBPR the form and the fee** as the form explains. Do it straight away: DBPR expects a change of employer within 30 days. Questions? Call **850-487-2987**.\n6. **Call your bond company.** Tell them you've moved to 365 Yachts and ask whether your bond needs updating.\n7. **Message Shelly the day you send it.** Until DBPR shows your license with 365 Yachts, check with Shelly before you work on any deal.\n8. **Upload your proof below.** Scan your signed change form (and the payment receipt, if you have one) into a PDF and upload it. iPhone: open the Notes app, tap the camera icon, then Scan Documents. Android: open Google Drive, tap +, then Scan."},{"value":"not_licensed_yet","heading":"Not sure yet: let's find out","bodyMd":"No problem. We've let the team know, and Shelly will message you to work it out together. Meanwhile, carry on with your other steps.\n\n1. **Check whether you already have a license.** Go to [MyFloridaLicense.com](https://www.myfloridalicense.com/), choose **Verify a License**, and search your name.\n2. **Found an active yacht and ship salesperson or broker license?** You're moving a license: follow \"Moving your license to 365\" below.\n3. **Found nothing?** You need a new license: follow \"Applying for a new salesperson license\" below.\n4. **Only have a real estate license?** That doesn't count. Selling used boats over 32 feet needs a separate yacht and ship license, so you need a new one.\n5. **Still unsure?** Wait for Shelly's message, or tap Message Shelly on WhatsApp now."}]}$g$::jsonb), updated_at = now()
  WHERE key = 'dbpr_filing' AND NOT config ? 'paths'
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, '{}'::jsonb, jsonb_build_object('paths', 'licensing guides for each step 6 answer')
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || jsonb_build_object('paths', $g${"fromStep":"license_situation","options":[{"value":"new","heading":"Applying for a new salesperson license: your copies","bodyMd":"Do this once DBPR has issued your license. The temporary 90-day license is fine. It can take a little while after step 7, so this step will wait for you.\n\n1. **Get a copy of your license.** If DBPR sent it to you, scan it to PDF. If it went to 365 Yachts, message Shelly: she can upload it for you. Or go to [MyFloridaLicense.com](https://www.myfloridalicense.com/), choose **Verify a License**, search your name, open your license, then use **Print** and **Save as PDF**.\n2. **Find the bond copy you scanned** before you mailed the original in step 7. No copy? Ask your bond company to email you one.\n3. **Check both.** Your name and license number must be easy to read.\n4. **Upload them below.** One PDF with both is fine, or separate files. Clear phone photos work too.\n5. **When your permanent license arrives**, message Shelly so she can update your file."},{"value":"transfer","heading":"Moving your license to 365: your copies","bodyMd":"Do this once DBPR shows your license under 365 Yachts.\n\n1. **Check DBPR has moved your license.** Go to [MyFloridaLicense.com](https://www.myfloridalicense.com/), choose **Verify a License**, and search your name. The employer should say 365 Yachts. Not yet? Wait a few days and check again, or message Shelly.\n2. **Save that page as a PDF:** use **Print**, then **Save as PDF**. That's your license copy.\n3. **Get a copy of your current bond.** Ask your bond company to email one if you don't have it.\n4. **Upload both below.** One PDF with both is fine, or separate files."},{"value":"not_licensed_yet","heading":"Not sure yet: let's find out","bodyMd":"Finish step 7 with Shelly first. Once you know whether you're getting a new license or moving one, open the matching guide below and follow it."}]}$g$::jsonb), updated_at = now()
  WHERE key = 'license_bond' AND NOT config ? 'paths'
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, '{}'::jsonb, jsonb_build_object('paths', 'licensing guides for each step 6 answer')
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || jsonb_build_object('links', $g$[{"label":"DBPR Yacht and Ship forms","url":"https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/"}]$g$::jsonb), updated_at = now()
  WHERE key = 'dbpr_filing' AND config -> 'links' = $g$[{"label":"DBPR online services","url":"https://www.myfloridalicense.com/"}]$g$::jsonb
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, jsonb_build_object('links', $g$[{"label":"DBPR online services","url":"https://www.myfloridalicense.com/"}]$g$::jsonb), jsonb_build_object('links', $g$[{"label":"DBPR Yacht and Ship forms","url":"https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/"}]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Use your driver's license or passport.$g$, $g$Lay it flat in good light, with all four corners showing.$g$, $g$Check that every word is readable.$g$, $g$Upload it here. A phone photo is fine. For a driver's license, add the front and the back.$g$]::text[], updated_at = now()
  WHERE key = 'photo_id' AND todo_items = ARRAY[$g$Use your driver's license or passport.$g$, $g$Lay it flat in good light, with all four corners showing.$g$, $g$Check that every word is readable.$g$, $g$Upload it here. A phone photo is fine.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Use your driver's license or passport.","Lay it flat in good light, with all four corners showing.","Check that every word is readable.","Upload it here. A phone photo is fine."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Use your driver's license or passport.","Lay it flat in good light, with all four corners showing.","Check that every word is readable.","Upload it here. A phone photo is fine. For a driver's license, add the front and the back."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Stand against a plain, light background.$g$, $g$Shoulders up, facing the camera, in daylight.$g$, $g$No sunglasses, hats or filters.$g$, $g$Upload one photo, at least 600 × 600 pixels.$g$]::text[], updated_at = now()
  WHERE key = 'headshot' AND todo_items = ARRAY[$g$Stand against a plain, light background.$g$, $g$Shoulders up, facing the camera, in daylight.$g$, $g$No sunglasses, hats or filters.$g$, $g$Upload it here.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Stand against a plain, light background.","Shoulders up, facing the camera, in daylight.","No sunglasses, hats or filters.","Upload it here."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Stand against a plain, light background.","Shoulders up, facing the camera, in daylight.","No sunglasses, hats or filters.","Upload one photo, at least 600 × 600 pixels."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Never held a Florida yacht & ship license? Pick the first option.$g$, $g$Licensed with another Florida brokerage? Pick the second.$g$, $g$Not sure? Pick the third and we'll message you.$g$, $g$A Florida real estate license doesn't count.$g$, $g$Your answer sets what you see in steps 7 and 8.$g$]::text[], updated_at = now()
  WHERE key = 'license_situation' AND todo_items = ARRAY[$g$Florida needs a license to sell any used boat over 32 feet.$g$, $g$New to Florida brokerage? Pick the new license option.$g$, $g$Already hold a Florida yacht and ship license? Pick transfer.$g$, $g$Not sure? Pick "Not licensed yet" and we'll help.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Florida needs a license to sell any used boat over 32 feet.","New to Florida brokerage? Pick the new license option.","Already hold a Florida yacht and ship license? Pick transfer.","Not sure? Pick \"Not licensed yet\" and we'll help."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Never held a Florida yacht & ship license? Pick the first option.","Licensed with another Florida brokerage? Pick the second.","Not sure? Pick the third and we'll message you.","A Florida real estate license doesn't count.","Your answer sets what you see in steps 7 and 8."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Open your step-by-step guide above and follow it in order.$g$, $g$Message Shelly before you start, for 365's employing broker details.$g$, $g$Scan your paperwork to PDF before you mail anything.$g$, $g$Upload your proof below as a PDF.$g$]::text[], updated_at = now()
  WHERE key = 'dbpr_filing' AND todo_items = ARRAY[$g$New license: apply on the DBPR portal, with fingerprints, bond and fee.$g$, $g$You get a temporary 90-day license while checks run.$g$, $g$Transfer: request it through DBPR to 365 Yachts Inc.$g$, $g$Tell your Sales Executive the day you submit.$g$, $g$Upload the confirmation here.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["New license: apply on the DBPR portal, with fingerprints, bond and fee.","You get a temporary 90-day license while checks run.","Transfer: request it through DBPR to 365 Yachts Inc.","Tell your Sales Executive the day you submit.","Upload the confirmation here."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Open your step-by-step guide above and follow it in order.","Message Shelly before you start, for 365's employing broker details.","Scan your paperwork to PDF before you mail anything.","Upload your proof below as a PDF."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Wait until DBPR has issued your license. A temporary one is fine.$g$, $g$Follow your step-by-step guide above.$g$, $g$Upload your license and your bond copy: one file or separate files.$g$]::text[], updated_at = now()
  WHERE key = 'license_bond' AND todo_items = ARRAY[$g$Find your license (temporary or permanent) and your surety bond.$g$, $g$Check your name and license number are readable on both.$g$, $g$Upload both here. You can add up to 5 files.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', $g$["Find your license (temporary or permanent) and your surety bond.","Check your name and license number are readable on both.","Upload both here. You can add up to 5 files."]$g$::jsonb), jsonb_build_object('todoItems', $g$["Wait until DBPR has issued your license. A temporary one is fine.","Follow your step-by-step guide above.","Upload your license and your bond copy: one file or separate files."]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET full_text_md = $g$## Process

- **New to Florida brokerage** — Register with DBPR through the online license portal. Complete application, fingerprints, surety bond, and fee. You will receive a temporary 90-day license while background checks process.
- **Transferring an existing license** — Request a license transfer through DBPR to associate your license with 365 Yachts Inc. Notify your Sales Executive the day you submit.
- **Renewal** — Two-year cycle. Watch for the DBPR notice 60 days out. Do not let a license lapse — you cannot legally take a listing or write an offer with an expired credential.

## Official links

- [DBPR Yacht and Ship licensing](https://www2.myfloridalicense.com/yacht-and-ships/licensing/): requirements and fees
- [DBPR Yacht and Ship forms](https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/): Form YS 6000-1 and the Change Form
- [DBPR Yacht and Ship FAQs](https://www2.myfloridalicense.com/yacht-and-ships/faqs/): bond amounts, fees, license terms
- [FDLE Livescan providers](https://www.fdle.state.fl.us/criminal-history-records/registered-livescan-submitters): where to get fingerprinted (ORI FL921900Z)
- [Chapter 326, Florida Statutes](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0326/0326.html): the Florida Yacht and Ship Brokers' Act

## Week 1 checklist (Module 06)

- Licensing application filed or transfer requested with DBPR

> [!WATCH]
> Fee and bond amounts are set by DBPR and change. Verify current figures on the DBPR site before you write a check. The table above reflects the schedule published as of this edition.$g$, updated_at = now()
  WHERE key = 'dbpr_filing' AND full_text_md = $g$## Process

- **New to Florida brokerage** — Register with DBPR through the online license portal. Complete application, fingerprints, surety bond, and fee. You will receive a temporary 90-day license while background checks process.
- **Transferring an existing license** — Request a license transfer through DBPR to associate your license with 365 Yachts Inc. Notify your Sales Executive the day you submit.
- **Renewal** — Two-year cycle. Watch for the DBPR notice 60 days out. Do not let a license lapse — you cannot legally take a listing or write an offer with an expired credential.

## Official links

- DBPR Yacht & Ship Licensing — applications, forms, requirements
- DBPR Yacht & Ship FAQs — bond amounts, fees, license terms
- Chapter 326, Florida Statutes — the Florida Yacht and Ship Brokers Act

## Week 1 checklist (Module 06)

- Licensing application filed or transfer requested with DBPR

> [!WATCH]
> Fee and bond amounts are set by DBPR and change. Verify current figures on the DBPR site before you write a check. The table above reflects the schedule published as of this edition.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('fullTextMd', 'official links without web addresses'), jsonb_build_object('fullTextMd', 'official links with web addresses')
FROM updated;
