/*
 * File: packages/db/drizzle/0023_boatwizard_training.sql
 * Purpose: Hand-written data migration (generated from packages/db/src/seed/steps.ts, step-guidance.ts and
 * boatwizard-training.ts) for SPEC D35: step 12, "Sign in to BoatWizard", gets the BoatWizard Mastery training copy
 * (summary, intro, instructions, 20 minutes, the new confirm label, "Read along with the video" panel wording, What to do
 * bullets, three callouts and the step-by-step read-along of the video). Each field changes only while it still has the
 * exact wording migration 0019 seeded, so admin edits are left alone, and running it again changes nothing. Writes one
 * audit_log row per changed field.
 *
 * Functions:
 * - none
 */
WITH updated AS (
  UPDATE onboarding_steps
  SET summary = $g$Watch the BoatWizard training, then sign in and run one practice search. Takes about 20 minutes.$g$, updated_at = now()
  WHERE key = 'boatwizard_login' AND summary = $g$Sign in to BoatWizard, the MLS, and run one practice search. Takes about 10 minutes.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('summary', $g$Sign in to BoatWizard, the MLS, and run one practice search. Takes about 10 minutes.$g$::text), jsonb_build_object('summary', $g$Watch the BoatWizard training, then sign in and run one practice search. Takes about 20 minutes.$g$::text)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = $g$BoatWizard is the engine behind YachtWorld and the industry MLS, and you'll use it every day for three jobs: list it, find it, price it. Watch the training, read along if you like, then sign in.$g$, updated_at = now()
  WHERE key = 'boatwizard_login' AND intro = $g$BoatWizard / YachtWorld is the MLS: listings, buyer searches and sold comps.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$BoatWizard / YachtWorld is the MLS: listings, buyer searches and sold comps.$g$::text), jsonb_build_object('intro', $g$BoatWizard is the engine behind YachtWorld and the industry MLS, and you'll use it every day for three jobs: list it, find it, price it. Watch the training, read along if you like, then sign in.$g$::text)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET instructions_md = $g$1. Watch the BoatWizard training video.
2. Sign in to BoatWizard with the login details you received.
3. Run one practice search, then tick the box.$g$, updated_at = now()
  WHERE key = 'boatwizard_login' AND instructions_md = $g$1. Sign in to BoatWizard with the login details you received.
2. Run one practice search.
3. Tick the box once you've done it.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('instructionsMd', $g$1. Sign in to BoatWizard with the login details you received.
2. Run one practice search.
3. Tick the box once you've done it.$g$::text), jsonb_build_object('instructionsMd', $g$1. Watch the BoatWizard training video.
2. Sign in to BoatWizard with the login details you received.
3. Run one practice search, then tick the box.$g$::text)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || $g${"minutes":20,"confirmLabel":"I've watched the training, signed in to BoatWizard and run one practice search","fullTextLabel":"Read along with the video","fullTextSource":"From the video"}$g$::jsonb, updated_at = now()
  WHERE key = 'boatwizard_login' AND config ->> 'confirmLabel' = $g$I signed in to BoatWizard and ran one practice search$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, $g${"minutes":10,"confirmLabel":"I signed in to BoatWizard and ran one practice search"}$g$::jsonb, $g${"minutes":20,"confirmLabel":"I've watched the training, signed in to BoatWizard and run one practice search","fullTextLabel":"Read along with the video","fullTextSource":"From the video"}$g$::jsonb
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Watch the training above. The read-along below explains every step.$g$, $g$List it: build listings in Inventory once the listing agreement is signed.$g$, $g$Find it: search the MLS for co-brokerage boats; send three at most.$g$, $g$Price it: use Sold Boats comps to build an owner's market analysis.$g$, $g$Sign in, run one practice search, then tick the box.$g$]::text[], updated_at = now()
  WHERE key = 'boatwizard_login' AND todo_items = ARRAY[$g$Sign in to BoatWizard with the login details you received.$g$, $g$Run one practice search for a boat a client might want.$g$, $g$Look at a few sold comps to see recent prices.$g$, $g$Tick the box below once you've done it.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', to_jsonb(ARRAY[$g$Sign in to BoatWizard with the login details you received.$g$, $g$Run one practice search for a boat a client might want.$g$, $g$Look at a few sold comps to see recent prices.$g$, $g$Tick the box below once you've done it.$g$]::text[])), jsonb_build_object('todoItems', to_jsonb(ARRAY[$g$Watch the training above. The read-along below explains every step.$g$, $g$List it: build listings in Inventory once the listing agreement is signed.$g$, $g$Find it: search the MLS for co-brokerage boats; send three at most.$g$, $g$Price it: use Sold Boats comps to build an owner's market analysis.$g$, $g$Sign in, run one practice search, then tick the box.$g$]::text[]))
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET callouts = $g$[{"kind":"HOUSE RULE","text":"No boat goes online without a signed listing agreement from YachtCloser."},{"kind":"NEVER","text":"Never put your contact details in a listing description. They get deleted."},{"kind":"WATCH","text":"Call the listing broker to confirm a boat is available before you send it to a client."}]$g$::jsonb, updated_at = now()
  WHERE key = 'boatwizard_login' AND callouts = '[]'::jsonb
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('callouts', '[]'::jsonb), jsonb_build_object('callouts', $g$[{"kind":"HOUSE RULE","text":"No boat goes online without a signed listing agreement from YachtCloser."},{"kind":"NEVER","text":"Never put your contact details in a listing description. They get deleted."},{"kind":"WATCH","text":"Call the listing broker to confirm a boat is available before you send it to a client."}]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET full_text_md = $g$## The short version

- **Three tabs, three jobs:** Inventory to list it, MLS to find it, Sold Boats to price it.
- **List it:** have the signed listing agreement and paperwork first, let BLAST fill in the specs, enter a real price, write at least 700 characters, upload 10 or more photos in tour order, and aim for a top listing score.
- **Find it:** search the MLS for boats available for co-brokerage, slightly above budget. Call the listing broker first and send three boats at most.
- **Price it:** compare active listings with recent Florida sales in Sold Boats, then walk the owner through the numbers in person.
- **Your first task:** run a sold comp search on a boat you know, build your first market analysis and bring it to Shelly.

## Signing in

1. Go to **yachtworld.com/research/member-access** and click **BoatWizard** in the center of the screen.
2. Your username is your first initial and last name. Your password is given to you at onboarding.
3. Locked out? Contact the head of the sales department.

## The three tabs you'll use

- **Inventory:** build and manage your listings.
- **MLS:** search every boat on the market for your buyers.
- **Sold Boats:** see what yachts actually sold for.

Three tabs, three jobs: list it, find it, price it.

## Job 1: List it

### Before you start: five things in hand

1. An e-signed listing agreement from YachtCloser.
2. High-quality photos of the vessel.
3. A photo of the hull ID, on the starboard side of the stern.
4. A copy of the title, registration or Coast Guard documentation.
5. A copy of the seller's driver's license.

> [!HOUSE RULE]
> A signed listing agreement before any boat goes online. Post first and paper later, and you put the firm at risk.

### Start the listing with BLAST

1. Click the **Inventory** tab, then the green **+** button to add a new listing.
2. Enter the make, model and year (for example, a 2018 Viking 68) and run the **BLAST** search.
3. BLAST shows the factory specs and past listings for that model in two sections, **Factory BLAST** and **Inventory BLAST**. Pick the closest match and the manufacturer's specs and dimensions fill in for you. That saves time and raises your listing score.
4. Model not in the database? Choose **Create a listing from scratch**.

### Basic details

Fill in every field marked with a red asterisk:

- **Listing type:** Central Exclusive.
- **Co-op type:** "Available for co-brokerage" if the boat is over $200,000, "Not available" if it's under.
- **Condition** (our house setting): Used for 2020 or older, New for 2021 or newer.
- **Year**, and **length** rounded to the nearest foot.
- **Class**, plus two more classes so the boat shows up in more searches.
- **Fuel type** and **hull material**.
- **Price:** enter a real asking price. BoatWizard reports that priced listings get about 10 times the traffic of "Call for price".
- **HIN:** enter it, then check it digit by digit against your hull ID photo.

### Description

This is where buyers decide whether to call.

- Write at least 700 characters, in two to three tight paragraphs.
- Lead with what sets the boat apart: recent refits, upgrades, new electronics or upholstery, a valid engine warranty, a joystick or stabilizers.
- Sell the life aboard, not just the spec sheet.
- Put your name, phone and email in the **Additional contact information** field instead, for example: "For showings or more information, call, text or email Shelly Melcher."

> [!NEVER]
> Never put your contact information in the description. It will be deleted.

### Photos and video

Photos sell yachts.

1. Upload 10 or more professional, high-quality photos, in landscape, with the boat centered.
2. Once you have your own photos, delete any manufacturer photos that were filled in for you.
3. Drag and drop them into order like a private tour: the best profile shot first, then the exterior, then the interior from stern to bow, and the engine room last.
4. No rust, no clutter, no dark rooms.
5. Add a video: a YouTube link or an immersive tour.

Most brokerages leave photos in the order they were uploaded. Putting them in walkthrough order costs nothing, and it sells boats.

### Features, measurements and propulsion

Click **Save and continue** through the remaining pages:

- **Features:** tick every feature the yacht has and apply the tags.
- **Measurements:** fill in everything you know: length overall, beam, draft, and fuel and water capacity. NADAguides is a useful reference, and you'll want these numbers when buyers call.
- **Propulsion:** joystick yes or no, and full engine details: make, model, horsepower and hours (for example, twin MTUs, 1,945 hp).
- **Other details:** optional.

### Launch it and check your score

1. Confirm the boat's location and the sales contact are right (for example, Palm Beach, Florida).
2. Review every field one last time.
3. Set the status to **Active** and click **Update** or **Finish**.
4. Listings usually take a few hours to go live. Go back to the Inventory list to confirm it's there.
5. Check your **listing score**, from 0 to 100%. The **Listing Optimizer** under the **Reports** tab shows exactly what to add.

The 365 standard is a top score on every listing we publish.

## Job 2: Find it

### Search the MLS

1. Click **MLS** in the top menu and enter your client's criteria: make, model, year, length, price and region.
2. Ask your client one question first: "If I find the right boat in another state or country, are you willing to have it shipped?"
3. Click **Advanced search** and set **Co-op type** to **Available for co-brokerage**. Those are the boats we get paid on.
4. Search slightly above budget. You can usually negotiate 5% or more off the asking price, so a buyer under $2 million should see boats up to about $2.2 million.

### Two kinds of buyer

**The buyer who knows exactly what they want**, for example a 68-foot Viking under $2 million:

- Use the exact make and length, a focused year range, and a price band of about $750,000 to $2.2 million.
- Speed wins.

**The buyer with a broad range**, for example a 60 to 75-foot sportfish under $2 million:

- Leave the make blank and widen the length to about 59 to 77 feet.
- Hold **Ctrl** to pick several types: Convertible, Saltwater Fishing and Sport Fishing.
- Ask what matters most: price, staterooms, hours or condition. They can't have all four.

Results thin? Click **Revise search**, not your browser's back button, or you'll lose your criteria.

### Four rules before any boat goes to a client

1. Call the listing broker to confirm the boat is still available, and ask what shape it's really in.
2. On high-end yachts, see the boat yourself first.
3. Never send more than three boats at once. Curation is the service.
4. On Boat Trader or any FSBO (for sale by owner) listing, call first to confirm a commission will be paid. Those sites have no co-brokerage flag.

### Three ways to send boats

1. **Email:** tick your top picks, click **Email selections** and send them to yourself first. Then write a clean email to your client with the boat name, model, year, price, location, engines, hours and three or four photos in the body, and a short subject like "Top picks: 68-foot Vikings on the market".
2. **Text:** run the search on your phone and text one to three photos with no caption. If they bite, follow up.
3. **Send boat:** open the listing and use **Send boat with full specs**, which hides the other broker's information. Then let your client know it's on the way.

## Job 3: Price it

### Pull sold comps

1. Click **Sold Boats** in the top menu. These are real recorded sales: BoatWizard takes sold prices from contracted YachtCloser deals, adjusted to reflect the vessel only.
2. Narrow the results with the filters on the left: sold date, make and model, length and year, price and region.
3. Sort by sold date, newest first.
4. Tick the comps you want. Then click **View selected** to compare them side by side, **Print selected** for a listing presentation handout, or **Email** or **Export** to save the set.

Watch two columns closely: **Days active** shows how long each boat sat, and the **listed price against the sold price** shows the real negotiation margin.

### Build a market analysis for an owner

When an owner wants to list, tell them you'll prepare a professional market analysis: the current competition against what has actually sold.

1. **Current market:** in **MLS**, search the same make, model and length, plus or minus a year, in Florida first. Pick about three active comps.
2. **What sold:** in **Sold Boats**, search the same make, model and length, and choose two to three recent Florida sales.
3. Start the sold date at the current year and step it back one year at a time until results appear. An empty result usually means the date window is too narrow.
4. Compare like for like. Use other states, makes or models only as a clearly labeled approximation.
5. For boats under $100,000 there isn't enough data for a written report. Walk the owner through your reasoning in conversation instead.

### Worked example: a 27-foot Conch

Three Florida sales:

- A 2022 listed at $225,000 sold for $199,500, down about 11% in five months.
- A 2020 listed at $249,000 sold for $224,000, down about 10% in one month.
- A 2015 sold at about its asking price.

That's an average sold price of about $207,000, about 3.7 months on the market, and an average price drop of about 7%.

The current competitor, a 2023, is listed at about $290,000 and already down 3%.

Weighing the sold data against the live competition, the recommended list price is about **$265,000**.

### Present it in person

Never just email the analysis and hope. Sit down with the owner, in person or on a screen share, and go through it in this order:

1. What has sold.
2. What is competing.
3. Where their boat honestly sits, including what hurts it.
4. The recommended number.

Say it like this: "I ran a full market analysis of current listings and recent sold comparables in Florida. Most sold within 3 to 5 months and needed price reductions of 7 to 11%. Based on that and where the competition sits, I recommend listing at $265,000 to attract serious buyers."

Sellers don't resist a low number. They resist an unexplained one.

Save every comp set in a client folder, in Excel, and keep the same format every time.

## Wrap-up

- **List it** with a top listing score.
- **Find it** with curated options that are ready for co-brokerage.
- **Price it** with real sold data, presented with confidence.

Competitors pitch on reach. We pitch on reach, relationship and a defensible number.

Open BoatWizard today, run a sold comp search on any boat you know, build your first market analysis, and bring it to Shelly for review.$g$, updated_at = now()
  WHERE key = 'boatwizard_login' AND full_text_md = $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

## Days 1–7 (Your first 90 days)

**Get legal, get logged in, get loud** — Paperwork submitted, licensing started, all four platforms accessed. Build your contact list: everyone you know who owns a boat, works on boats, or is wealthy enough to buy one. Target 100 names in the CRM by day seven.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('fullTextMd', $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

## Days 1–7 (Your first 90 days)

**Get legal, get logged in, get loud** — Paperwork submitted, licensing started, all four platforms accessed. Build your contact list: everyone you know who owns a boat, works on boats, or is wealthy enough to buy one. Target 100 names in the CRM by day seven.$g$::text), jsonb_build_object('fullTextMd', $g$## The short version

- **Three tabs, three jobs:** Inventory to list it, MLS to find it, Sold Boats to price it.
- **List it:** have the signed listing agreement and paperwork first, let BLAST fill in the specs, enter a real price, write at least 700 characters, upload 10 or more photos in tour order, and aim for a top listing score.
- **Find it:** search the MLS for boats available for co-brokerage, slightly above budget. Call the listing broker first and send three boats at most.
- **Price it:** compare active listings with recent Florida sales in Sold Boats, then walk the owner through the numbers in person.
- **Your first task:** run a sold comp search on a boat you know, build your first market analysis and bring it to Shelly.

## Signing in

1. Go to **yachtworld.com/research/member-access** and click **BoatWizard** in the center of the screen.
2. Your username is your first initial and last name. Your password is given to you at onboarding.
3. Locked out? Contact the head of the sales department.

## The three tabs you'll use

- **Inventory:** build and manage your listings.
- **MLS:** search every boat on the market for your buyers.
- **Sold Boats:** see what yachts actually sold for.

Three tabs, three jobs: list it, find it, price it.

## Job 1: List it

### Before you start: five things in hand

1. An e-signed listing agreement from YachtCloser.
2. High-quality photos of the vessel.
3. A photo of the hull ID, on the starboard side of the stern.
4. A copy of the title, registration or Coast Guard documentation.
5. A copy of the seller's driver's license.

> [!HOUSE RULE]
> A signed listing agreement before any boat goes online. Post first and paper later, and you put the firm at risk.

### Start the listing with BLAST

1. Click the **Inventory** tab, then the green **+** button to add a new listing.
2. Enter the make, model and year (for example, a 2018 Viking 68) and run the **BLAST** search.
3. BLAST shows the factory specs and past listings for that model in two sections, **Factory BLAST** and **Inventory BLAST**. Pick the closest match and the manufacturer's specs and dimensions fill in for you. That saves time and raises your listing score.
4. Model not in the database? Choose **Create a listing from scratch**.

### Basic details

Fill in every field marked with a red asterisk:

- **Listing type:** Central Exclusive.
- **Co-op type:** "Available for co-brokerage" if the boat is over $200,000, "Not available" if it's under.
- **Condition** (our house setting): Used for 2020 or older, New for 2021 or newer.
- **Year**, and **length** rounded to the nearest foot.
- **Class**, plus two more classes so the boat shows up in more searches.
- **Fuel type** and **hull material**.
- **Price:** enter a real asking price. BoatWizard reports that priced listings get about 10 times the traffic of "Call for price".
- **HIN:** enter it, then check it digit by digit against your hull ID photo.

### Description

This is where buyers decide whether to call.

- Write at least 700 characters, in two to three tight paragraphs.
- Lead with what sets the boat apart: recent refits, upgrades, new electronics or upholstery, a valid engine warranty, a joystick or stabilizers.
- Sell the life aboard, not just the spec sheet.
- Put your name, phone and email in the **Additional contact information** field instead, for example: "For showings or more information, call, text or email Shelly Melcher."

> [!NEVER]
> Never put your contact information in the description. It will be deleted.

### Photos and video

Photos sell yachts.

1. Upload 10 or more professional, high-quality photos, in landscape, with the boat centered.
2. Once you have your own photos, delete any manufacturer photos that were filled in for you.
3. Drag and drop them into order like a private tour: the best profile shot first, then the exterior, then the interior from stern to bow, and the engine room last.
4. No rust, no clutter, no dark rooms.
5. Add a video: a YouTube link or an immersive tour.

Most brokerages leave photos in the order they were uploaded. Putting them in walkthrough order costs nothing, and it sells boats.

### Features, measurements and propulsion

Click **Save and continue** through the remaining pages:

- **Features:** tick every feature the yacht has and apply the tags.
- **Measurements:** fill in everything you know: length overall, beam, draft, and fuel and water capacity. NADAguides is a useful reference, and you'll want these numbers when buyers call.
- **Propulsion:** joystick yes or no, and full engine details: make, model, horsepower and hours (for example, twin MTUs, 1,945 hp).
- **Other details:** optional.

### Launch it and check your score

1. Confirm the boat's location and the sales contact are right (for example, Palm Beach, Florida).
2. Review every field one last time.
3. Set the status to **Active** and click **Update** or **Finish**.
4. Listings usually take a few hours to go live. Go back to the Inventory list to confirm it's there.
5. Check your **listing score**, from 0 to 100%. The **Listing Optimizer** under the **Reports** tab shows exactly what to add.

The 365 standard is a top score on every listing we publish.

## Job 2: Find it

### Search the MLS

1. Click **MLS** in the top menu and enter your client's criteria: make, model, year, length, price and region.
2. Ask your client one question first: "If I find the right boat in another state or country, are you willing to have it shipped?"
3. Click **Advanced search** and set **Co-op type** to **Available for co-brokerage**. Those are the boats we get paid on.
4. Search slightly above budget. You can usually negotiate 5% or more off the asking price, so a buyer under $2 million should see boats up to about $2.2 million.

### Two kinds of buyer

**The buyer who knows exactly what they want**, for example a 68-foot Viking under $2 million:

- Use the exact make and length, a focused year range, and a price band of about $750,000 to $2.2 million.
- Speed wins.

**The buyer with a broad range**, for example a 60 to 75-foot sportfish under $2 million:

- Leave the make blank and widen the length to about 59 to 77 feet.
- Hold **Ctrl** to pick several types: Convertible, Saltwater Fishing and Sport Fishing.
- Ask what matters most: price, staterooms, hours or condition. They can't have all four.

Results thin? Click **Revise search**, not your browser's back button, or you'll lose your criteria.

### Four rules before any boat goes to a client

1. Call the listing broker to confirm the boat is still available, and ask what shape it's really in.
2. On high-end yachts, see the boat yourself first.
3. Never send more than three boats at once. Curation is the service.
4. On Boat Trader or any FSBO (for sale by owner) listing, call first to confirm a commission will be paid. Those sites have no co-brokerage flag.

### Three ways to send boats

1. **Email:** tick your top picks, click **Email selections** and send them to yourself first. Then write a clean email to your client with the boat name, model, year, price, location, engines, hours and three or four photos in the body, and a short subject like "Top picks: 68-foot Vikings on the market".
2. **Text:** run the search on your phone and text one to three photos with no caption. If they bite, follow up.
3. **Send boat:** open the listing and use **Send boat with full specs**, which hides the other broker's information. Then let your client know it's on the way.

## Job 3: Price it

### Pull sold comps

1. Click **Sold Boats** in the top menu. These are real recorded sales: BoatWizard takes sold prices from contracted YachtCloser deals, adjusted to reflect the vessel only.
2. Narrow the results with the filters on the left: sold date, make and model, length and year, price and region.
3. Sort by sold date, newest first.
4. Tick the comps you want. Then click **View selected** to compare them side by side, **Print selected** for a listing presentation handout, or **Email** or **Export** to save the set.

Watch two columns closely: **Days active** shows how long each boat sat, and the **listed price against the sold price** shows the real negotiation margin.

### Build a market analysis for an owner

When an owner wants to list, tell them you'll prepare a professional market analysis: the current competition against what has actually sold.

1. **Current market:** in **MLS**, search the same make, model and length, plus or minus a year, in Florida first. Pick about three active comps.
2. **What sold:** in **Sold Boats**, search the same make, model and length, and choose two to three recent Florida sales.
3. Start the sold date at the current year and step it back one year at a time until results appear. An empty result usually means the date window is too narrow.
4. Compare like for like. Use other states, makes or models only as a clearly labeled approximation.
5. For boats under $100,000 there isn't enough data for a written report. Walk the owner through your reasoning in conversation instead.

### Worked example: a 27-foot Conch

Three Florida sales:

- A 2022 listed at $225,000 sold for $199,500, down about 11% in five months.
- A 2020 listed at $249,000 sold for $224,000, down about 10% in one month.
- A 2015 sold at about its asking price.

That's an average sold price of about $207,000, about 3.7 months on the market, and an average price drop of about 7%.

The current competitor, a 2023, is listed at about $290,000 and already down 3%.

Weighing the sold data against the live competition, the recommended list price is about **$265,000**.

### Present it in person

Never just email the analysis and hope. Sit down with the owner, in person or on a screen share, and go through it in this order:

1. What has sold.
2. What is competing.
3. Where their boat honestly sits, including what hurts it.
4. The recommended number.

Say it like this: "I ran a full market analysis of current listings and recent sold comparables in Florida. Most sold within 3 to 5 months and needed price reductions of 7 to 11%. Based on that and where the competition sits, I recommend listing at $265,000 to attract serious buyers."

Sellers don't resist a low number. They resist an unexplained one.

Save every comp set in a client folder, in Excel, and keep the same format every time.

## Wrap-up

- **List it** with a top listing score.
- **Find it** with curated options that are ready for co-brokerage.
- **Price it** with real sold data, presented with confidence.

Competitors pitch on reach. We pitch on reach, relationship and a defensible number.

Open BoatWizard today, run a sold comp search on any boat you know, build your first market analysis, and bring it to Shelly for review.$g$::text)
FROM updated;
