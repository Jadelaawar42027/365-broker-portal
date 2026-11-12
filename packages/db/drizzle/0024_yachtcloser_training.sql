/*
 * File: packages/db/drizzle/0024_yachtcloser_training.sql
 * Purpose: Hand-written data migration (generated from packages/db/src/seed/steps.ts, step-guidance.ts and
 * yachtcloser-training.ts) for SPEC D36: step 13, "Sign in to YachtCloser", gets the YachtCloser training copy
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
  SET summary = $g$Watch the YachtCloser training, then sign in and review a sample deal file. Takes about 20 minutes.$g$, updated_at = now()
  WHERE key = 'yachtcloser_login' AND summary = $g$Sign in to YachtCloser and review a sample deal file. Takes about 10 minutes.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('summary', $g$Sign in to YachtCloser and review a sample deal file. Takes about 10 minutes.$g$::text), jsonb_build_object('summary', $g$Watch the YachtCloser training, then sign in and review a sample deal file. Takes about 20 minutes.$g$::text)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET intro = $g$YachtCloser is where every 365 Yachts contract lives: listing agreements, offers, counters, amendments and closing statements. Watch the training, read along if you like, then sign in.$g$, updated_at = now()
  WHERE key = 'yachtcloser_login' AND intro = $g$YachtCloser handles contracts, e-signatures, deals and closing statements.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('intro', $g$YachtCloser handles contracts, e-signatures, deals and closing statements.$g$::text), jsonb_build_object('intro', $g$YachtCloser is where every 365 Yachts contract lives: listing agreements, offers, counters, amendments and closing statements. Watch the training, read along if you like, then sign in.$g$::text)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET instructions_md = $g$1. Watch the YachtCloser training video.
2. Sign in to YachtCloser with the login details you received.
3. Open a sample deal file and look through it, then tick the box.$g$, updated_at = now()
  WHERE key = 'yachtcloser_login' AND instructions_md = $g$1. Sign in to YachtCloser with the login details you received.
2. Open a sample deal file and look through it.
3. Tick the box once you've done it.$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.copy_updated', 'onboarding_step', id, jsonb_build_object('instructionsMd', $g$1. Sign in to YachtCloser with the login details you received.
2. Open a sample deal file and look through it.
3. Tick the box once you've done it.$g$::text), jsonb_build_object('instructionsMd', $g$1. Watch the YachtCloser training video.
2. Sign in to YachtCloser with the login details you received.
3. Open a sample deal file and look through it, then tick the box.$g$::text)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET config = config || $g${"minutes":20,"confirmLabel":"I've watched the training, signed in to YachtCloser and reviewed a sample deal file","fullTextLabel":"Read along with the video","fullTextSource":"From the video"}$g$::jsonb, updated_at = now()
  WHERE key = 'yachtcloser_login' AND config ->> 'confirmLabel' = $g$I signed in to YachtCloser and reviewed a sample deal file$g$
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.config_updated', 'onboarding_step', id, $g${"minutes":10,"confirmLabel":"I signed in to YachtCloser and reviewed a sample deal file"}$g$::jsonb, $g${"minutes":20,"confirmLabel":"I've watched the training, signed in to YachtCloser and reviewed a sample deal file","fullTextLabel":"Read along with the video","fullTextSource":"From the video"}$g$::jsonb
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET todo_items = ARRAY[$g$Watch the training above. The read-along below explains every step.$g$, $g$List it: build the vessel and terms, then send the listing agreement.$g$, $g$Deals: buyer signs first, then seller; change terms only by amendment.$g$, $g$Verify every wire instruction by phone before any money moves.$g$, $g$Sign in, open a sample deal file, then tick the box.$g$]::text[], updated_at = now()
  WHERE key = 'yachtcloser_login' AND todo_items = ARRAY[$g$Sign in to YachtCloser with the login details you received.$g$, $g$Open a sample deal file and look through it.$g$, $g$Tick the box below once you've done it.$g$]::text[]
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('todoItems', to_jsonb(ARRAY[$g$Sign in to YachtCloser with the login details you received.$g$, $g$Open a sample deal file and look through it.$g$, $g$Tick the box below once you've done it.$g$]::text[])), jsonb_build_object('todoItems', to_jsonb(ARRAY[$g$Watch the training above. The read-along below explains every step.$g$, $g$List it: build the vessel and terms, then send the listing agreement.$g$, $g$Deals: buyer signs first, then seller; change terms only by amendment.$g$, $g$Verify every wire instruction by phone before any money moves.$g$, $g$Sign in, open a sample deal file, then tick the box.$g$]::text[]))
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET callouts = $g$[{"kind":"HOUSE RULE","text":"Buyer (or the buyer's broker) signs first, seller second. Never both at once, never the seller first."},{"kind":"NEVER","text":"Never agree a later closing date verbally. Any later date is a signed amendment."},{"kind":"WATCH","text":"Wire instructions never change. Verify every wire by phone; an email changing them is fraud."}]$g$::jsonb, updated_at = now()
  WHERE key = 'yachtcloser_login' AND callouts = '[]'::jsonb
  RETURNING id
)
INSERT INTO audit_log (action, entity_type, entity_id, before, after)
SELECT 'step.guidance_updated', 'onboarding_step', id, jsonb_build_object('callouts', '[]'::jsonb), jsonb_build_object('callouts', $g$[{"kind":"HOUSE RULE","text":"Buyer (or the buyer's broker) signs first, seller second. Never both at once, never the seller first."},{"kind":"NEVER","text":"Never agree a later closing date verbally. Any later date is a signed amendment."},{"kind":"WATCH","text":"Wire instructions never change. Verify every wire by phone; an email changing them is fraud."}]$g$::jsonb)
FROM updated;
--> statement-breakpoint
WITH updated AS (
  UPDATE onboarding_steps
  SET full_text_md = $g$## The short version

- **YachtCloser is where every 365 Yachts contract lives.** You create every document of a deal in it, and the file it keeps protects the client, the firm and your license.
- **Part 1, list it:** add the seller, build the vessel record, set the terms, then send the listing agreement for e-signature. The boat goes online in BoatWizard only once it's signed.
- **Part 2, make the deal:** add the deal with the right role, enter the buyer, seller, vessel, terms and commission, then send the purchase and sale agreement: buyer first, seller second. Counter offers go through an addendum.
- **Part 3, survey to close:** a conditional acceptance for a survey allowance, an amendment for any later closing date, then the closing statements.
- **Always:** enter names exactly as they'll appear on the title, send in the right order, move dates only by amendment, and verify every wire by phone.

## The contract set

These documents govern every transaction, and you create every one of them inside YachtCloser:

- The listing agreement
- Proof of funds
- The purchase and sale agreement
- The co-brokerage agreement
- Amendments
- Conditional acceptance and acceptance
- The closing statements
- The warranty and the abstract of title

The video uses a realistic training simulation. The gold outline on each screen shows exactly where you click.

## Part 1: The listing agreement

The example is a 2018 Viking 68 named *Sea Legacy*.

### Before you start

Have these in hand:

- The title or Coast Guard documents.
- The seller's driver's license.
- The seller's contact details.
- Any liens, confirmed.

### Add the seller

1. In the **Inventory** tab, click **Add inventory** at the top right.
2. Enter the seller exactly as they appear on the registration or Coast Guard documents, including an LLC or trust if that is the owner.
3. If the seller is already one of your clients, use **Client search** to pull them in.
4. Click **Save update**.

### Build the vessel record

1. Click the **Vessel** button.
2. Select **Used**, then enter the make, model, length, year and vessel name.
3. Use the **BLAST import** to pull in the manufacturer's specifications, descriptions and images, then check every field.
4. Enter the hull ID from the documents and check it digit by digit against your hull photo.
5. Add the category, vessel type, hull material and location, then click **Save**.

### Engines and extras

The blue tabs on the right hold the engines and any additional units, such as a tender or trailer that conveys with the boat.

1. Click **Engines** and enter each engine: make, model, horsepower and hours.
2. Note the generator hours, the last engine service and the last bottom paint you gathered at the listing appointment.
3. Click **Save**.

> [!NEVER]
> Never guess a number.

### Terms

- **Listing type:** Central Exclusive.
- **Contract date:** today.
- **Term:** 180 days. The end date fills in automatically.
- **Price:** the agreed price.
- **Commission:** 10%, with a $5,000 minimum.
- **Co-brokerage:** available over $200,000.

Then click **Save**.

### Create the listing agreement

1. Open the **Documents** page and click **Add documents**.
2. Tick **Listing agreement** and click **Add**. The document is built from the terms you just saved, so your terms must be right first.
3. Click anywhere on the document's row to select it. A green check appears.
4. Click the document's name, or **View**, to preview it.

The action bar works on whatever you've selected: **Assign**, **Email**, **Download**, **Hand sign**, **Reset**, **Remove** and **Log**.

### Send it for e-signature

1. Click **Assign**.
2. In the **Send e-sign invites** pop-up, tick each party who should sign. Here, that's the seller.
3. You can edit the subject, set a display name, and send a private message to one party or one message to everyone.
4. Click **Send invites**.
5. Call or text your seller straight away: "It's in your email. Check spam. It takes about 90 seconds on your phone."

### Confirm the signature

Select the document and click **Log**. You'll see every event with its date, time and IP address: invite sent, viewed and signed.

In the example, the seller signed in nine minutes. Only now does the boat go online in BoatWizard. Part 1 is complete.

> [!HOUSE RULE]
> No boat goes online in BoatWizard until the listing agreement is signed.

## Part 2: An offer on another firm's listing

Your buyer, Daniel Ortega, wants to offer $1.65 million on a 2016 Hatteras GT63. Proof of funds is on file.

### Start the deal

1. Click the **Deal** tab, then **Add deal**.
2. Choose your role: **Not our listing**. We represent the buyer, so select **Selling broker only**. The role controls who signs and how the commission is recorded.
3. Use the blue **Broker search** to attach the listing broker. If they use YachtCloser, find them in the search box. If not, click **New broker** and add their details. In the example, that's Marcus Reed at Coastline Yacht Group.

Tip: if the offer is on your own listing, don't add a new deal. Go to **Inventory**, open the three-dot actions menu and choose **Offer**, so the seller and vessel carry over.

### Buyer, seller and vessel

The deal form runs in order: buyer, seller, vessel, terms.

1. **Buyer:** enter the buyer exactly as they will take title, as an individual or through their LLC. Ask now, not at closing. Click **Save**.
2. **Seller:** if you don't have the seller's details, keep **Display as owner of record**.
3. **Vessel:** enter the vessel and confirm the hull ID from the listing broker's documents against the hull itself. Click **Save**.

### Terms

- **Deposit:** always 10% of the offer, by wire only.
- **Contract acceptance:** one day. This is the seller's deadline.
- **Vessel acceptance:** about two weeks, for the sea trial and survey.
- **Closing:** about one week after that.

Confirm both brokers appear under **Brokers of record**, and book your surveyors and the haul-out today.

### Commission

Enter 10%, then the 50/50 co-brokerage split between the brokerages, with a comment if needed. This drives the co-brokerage agreement, so there's no dispute at closing. Click **Save**.

### Create the documents

1. On **Documents**, click **Add documents**.
2. Tick **Purchase and sale agreement** and **Co-brokerage agreement**, and click **Add**.
3. Preview the purchase and sale agreement. Check the price, the deposit, the three dates and the hull ID. Drafts update automatically as you edit the deal.

If you ever need to fix a document after sending it, select it and click **Reset**. It goes back to draft, the signatures clear, and the old version is saved in **Archives**.

### Send in the right order

1. Click **Assign**, tick only the buyer, add a short message and click **Send invites**. Then call your buyer.
2. Once the buyer signs, click **Send to seller**. It goes to the seller through the listing broker, along with the co-brokerage agreement.

> [!HOUSE RULE]
> Buyer (or the buyer's broker) first, seller second. Never both at once, never the seller first.

### Counter offers

In the example, the seller counters at $1,695,000 with a counter offer addendum from the listing broker. Your buyer will hold at $1.65 million, but asks the seller to include the tender.

1. On the **Terms** page, click **Counter offer**. Counter offers are built for co-brokerage deals, not for when you represent both sides.
2. Enter the counter acceptance date and the terms: the price, what conveys and the deadline to respond. Everything not mentioned stays as written. Click **Save**.
3. On **Documents**, select the **Counter offer addendum (YC selling broker version)**, which pulls in your date and terms, and click **Assign**.
4. For another round, reset the counter, update the date and terms, and send it again. Signed counters are kept in **Archives**.

### When the seller accepts

1. Update the **Terms** page with the final terms.
2. Select the purchase and sale agreement, click **Reset**, and send it for signature to all parties again, buyer first.
3. Once it's fully signed, and only then, the wire instructions for the 10% deposit into escrow go out.

Give your buyer this warning: "Our instructions will never change. Any email changing them is fraud. Call me on the number you already have before you send a dollar."

Verify the wire by phone and log it.

> [!WATCH]
> Wire fraud targets yacht deals. Verify every wire instruction by phone, on a number you already have, and log it.

## Part 3: Survey to close

### Conditional acceptance for a survey allowance

In the example, the survey found two items worth $38,500. Your buyer wants a survey allowance instead of walking away.

1. On the **Terms** page, click **Acceptance** on the right.
2. Enter the survey allowance, the completion date and the conditions, in specific dollars and dates.
3. Click **Save**. The allowance doesn't print on the agreement, but it is taken off the price on the closing and registration paperwork.
4. On **Documents**, preview the conditional acceptance, then assign it to the buyer, then the seller, inside the vessel acceptance window.

> [!NEVER]
> Never write vague conditions like "seller to address items noted". Use specific dollars and dates.

### If the buyer walks away

1. On the **Terms** page, use **Rejection**. Enter the rejection date and the reason, and the rejection of vessel document is ready to sign inside the window.
2. Then ask both parties for a signed release direction.

> [!NEVER]
> Never tell anyone the deposit is safe or non-refundable. Escalate disputes to Shelly.

### Moving the closing date

In the example, closing has to move later because the buyer's lender needs three more days. A closing can always move earlier, but any later date is an amendment.

1. On the **Terms** page, click **Amendment** and enter the extension in plain words. Click **Save**.
2. Add the **Amendment to purchase and sale agreement** and send it to both parties.

Never agree an extension verbally.

### Closing statements

- **The buyer's statement** shows the price, less the survey allowance and the deposit in escrow, plus taxes, for the balance due.
- **The seller's statement** shows the adjusted price, less the 10% commission, for the net.
- Each side signs its own.

Verify every wire by phone again at closing. It's the moment attackers target most.

### Closed

Every document, every signature and every date sits in one file in YachtCloser. That record protects the client, the firm and your license.

Next come the title and registration transfer, the handoff after the sale, and asking for two referrals.

## Wrap-up

YachtCloser is where every 365 Yachts contract lives, and where deals are won or lost on paper:

- Enter it precisely.
- Send in the right order.
- Move dates only by amendment.
- Verify every wire by phone.

This week, open the YachtCloser simulator in the Training Hub and click through all 35 steps. Then build the same sample listing and deal in your own account, and walk Shelly through it.$g$, updated_at = now()
  WHERE key = 'yachtcloser_login' AND full_text_md = $g$## Platform credentials you will receive

| Platform | What it is for | First action |
|---|---|---|
| 365 Yachts Email | All client communication. No personal email for client business, ever. | Sign in and pick your own password |
| BoatWizard / YachtWorld | MLS. Listing your inventory, searching for buyers, sold-boat comps. | Log in, run one practice search |
| YachtCloser | Contracts, e-signature, listing agreements, deals, closing statements. | Log in, review a sample deal file |
| GoHighLevel CRM | Leads, pipeline, follow-up tasks, campaigns. | Load your first 100 contacts |

## Week 1 checklist (Module 06)

- Logged into BoatWizard, YachtCloser, and GoHighLevel$g$
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

## Week 1 checklist (Module 06)

- Logged into BoatWizard, YachtCloser, and GoHighLevel$g$::text), jsonb_build_object('fullTextMd', $g$## The short version

- **YachtCloser is where every 365 Yachts contract lives.** You create every document of a deal in it, and the file it keeps protects the client, the firm and your license.
- **Part 1, list it:** add the seller, build the vessel record, set the terms, then send the listing agreement for e-signature. The boat goes online in BoatWizard only once it's signed.
- **Part 2, make the deal:** add the deal with the right role, enter the buyer, seller, vessel, terms and commission, then send the purchase and sale agreement: buyer first, seller second. Counter offers go through an addendum.
- **Part 3, survey to close:** a conditional acceptance for a survey allowance, an amendment for any later closing date, then the closing statements.
- **Always:** enter names exactly as they'll appear on the title, send in the right order, move dates only by amendment, and verify every wire by phone.

## The contract set

These documents govern every transaction, and you create every one of them inside YachtCloser:

- The listing agreement
- Proof of funds
- The purchase and sale agreement
- The co-brokerage agreement
- Amendments
- Conditional acceptance and acceptance
- The closing statements
- The warranty and the abstract of title

The video uses a realistic training simulation. The gold outline on each screen shows exactly where you click.

## Part 1: The listing agreement

The example is a 2018 Viking 68 named *Sea Legacy*.

### Before you start

Have these in hand:

- The title or Coast Guard documents.
- The seller's driver's license.
- The seller's contact details.
- Any liens, confirmed.

### Add the seller

1. In the **Inventory** tab, click **Add inventory** at the top right.
2. Enter the seller exactly as they appear on the registration or Coast Guard documents, including an LLC or trust if that is the owner.
3. If the seller is already one of your clients, use **Client search** to pull them in.
4. Click **Save update**.

### Build the vessel record

1. Click the **Vessel** button.
2. Select **Used**, then enter the make, model, length, year and vessel name.
3. Use the **BLAST import** to pull in the manufacturer's specifications, descriptions and images, then check every field.
4. Enter the hull ID from the documents and check it digit by digit against your hull photo.
5. Add the category, vessel type, hull material and location, then click **Save**.

### Engines and extras

The blue tabs on the right hold the engines and any additional units, such as a tender or trailer that conveys with the boat.

1. Click **Engines** and enter each engine: make, model, horsepower and hours.
2. Note the generator hours, the last engine service and the last bottom paint you gathered at the listing appointment.
3. Click **Save**.

> [!NEVER]
> Never guess a number.

### Terms

- **Listing type:** Central Exclusive.
- **Contract date:** today.
- **Term:** 180 days. The end date fills in automatically.
- **Price:** the agreed price.
- **Commission:** 10%, with a $5,000 minimum.
- **Co-brokerage:** available over $200,000.

Then click **Save**.

### Create the listing agreement

1. Open the **Documents** page and click **Add documents**.
2. Tick **Listing agreement** and click **Add**. The document is built from the terms you just saved, so your terms must be right first.
3. Click anywhere on the document's row to select it. A green check appears.
4. Click the document's name, or **View**, to preview it.

The action bar works on whatever you've selected: **Assign**, **Email**, **Download**, **Hand sign**, **Reset**, **Remove** and **Log**.

### Send it for e-signature

1. Click **Assign**.
2. In the **Send e-sign invites** pop-up, tick each party who should sign. Here, that's the seller.
3. You can edit the subject, set a display name, and send a private message to one party or one message to everyone.
4. Click **Send invites**.
5. Call or text your seller straight away: "It's in your email. Check spam. It takes about 90 seconds on your phone."

### Confirm the signature

Select the document and click **Log**. You'll see every event with its date, time and IP address: invite sent, viewed and signed.

In the example, the seller signed in nine minutes. Only now does the boat go online in BoatWizard. Part 1 is complete.

> [!HOUSE RULE]
> No boat goes online in BoatWizard until the listing agreement is signed.

## Part 2: An offer on another firm's listing

Your buyer, Daniel Ortega, wants to offer $1.65 million on a 2016 Hatteras GT63. Proof of funds is on file.

### Start the deal

1. Click the **Deal** tab, then **Add deal**.
2. Choose your role: **Not our listing**. We represent the buyer, so select **Selling broker only**. The role controls who signs and how the commission is recorded.
3. Use the blue **Broker search** to attach the listing broker. If they use YachtCloser, find them in the search box. If not, click **New broker** and add their details. In the example, that's Marcus Reed at Coastline Yacht Group.

Tip: if the offer is on your own listing, don't add a new deal. Go to **Inventory**, open the three-dot actions menu and choose **Offer**, so the seller and vessel carry over.

### Buyer, seller and vessel

The deal form runs in order: buyer, seller, vessel, terms.

1. **Buyer:** enter the buyer exactly as they will take title, as an individual or through their LLC. Ask now, not at closing. Click **Save**.
2. **Seller:** if you don't have the seller's details, keep **Display as owner of record**.
3. **Vessel:** enter the vessel and confirm the hull ID from the listing broker's documents against the hull itself. Click **Save**.

### Terms

- **Deposit:** always 10% of the offer, by wire only.
- **Contract acceptance:** one day. This is the seller's deadline.
- **Vessel acceptance:** about two weeks, for the sea trial and survey.
- **Closing:** about one week after that.

Confirm both brokers appear under **Brokers of record**, and book your surveyors and the haul-out today.

### Commission

Enter 10%, then the 50/50 co-brokerage split between the brokerages, with a comment if needed. This drives the co-brokerage agreement, so there's no dispute at closing. Click **Save**.

### Create the documents

1. On **Documents**, click **Add documents**.
2. Tick **Purchase and sale agreement** and **Co-brokerage agreement**, and click **Add**.
3. Preview the purchase and sale agreement. Check the price, the deposit, the three dates and the hull ID. Drafts update automatically as you edit the deal.

If you ever need to fix a document after sending it, select it and click **Reset**. It goes back to draft, the signatures clear, and the old version is saved in **Archives**.

### Send in the right order

1. Click **Assign**, tick only the buyer, add a short message and click **Send invites**. Then call your buyer.
2. Once the buyer signs, click **Send to seller**. It goes to the seller through the listing broker, along with the co-brokerage agreement.

> [!HOUSE RULE]
> Buyer (or the buyer's broker) first, seller second. Never both at once, never the seller first.

### Counter offers

In the example, the seller counters at $1,695,000 with a counter offer addendum from the listing broker. Your buyer will hold at $1.65 million, but asks the seller to include the tender.

1. On the **Terms** page, click **Counter offer**. Counter offers are built for co-brokerage deals, not for when you represent both sides.
2. Enter the counter acceptance date and the terms: the price, what conveys and the deadline to respond. Everything not mentioned stays as written. Click **Save**.
3. On **Documents**, select the **Counter offer addendum (YC selling broker version)**, which pulls in your date and terms, and click **Assign**.
4. For another round, reset the counter, update the date and terms, and send it again. Signed counters are kept in **Archives**.

### When the seller accepts

1. Update the **Terms** page with the final terms.
2. Select the purchase and sale agreement, click **Reset**, and send it for signature to all parties again, buyer first.
3. Once it's fully signed, and only then, the wire instructions for the 10% deposit into escrow go out.

Give your buyer this warning: "Our instructions will never change. Any email changing them is fraud. Call me on the number you already have before you send a dollar."

Verify the wire by phone and log it.

> [!WATCH]
> Wire fraud targets yacht deals. Verify every wire instruction by phone, on a number you already have, and log it.

## Part 3: Survey to close

### Conditional acceptance for a survey allowance

In the example, the survey found two items worth $38,500. Your buyer wants a survey allowance instead of walking away.

1. On the **Terms** page, click **Acceptance** on the right.
2. Enter the survey allowance, the completion date and the conditions, in specific dollars and dates.
3. Click **Save**. The allowance doesn't print on the agreement, but it is taken off the price on the closing and registration paperwork.
4. On **Documents**, preview the conditional acceptance, then assign it to the buyer, then the seller, inside the vessel acceptance window.

> [!NEVER]
> Never write vague conditions like "seller to address items noted". Use specific dollars and dates.

### If the buyer walks away

1. On the **Terms** page, use **Rejection**. Enter the rejection date and the reason, and the rejection of vessel document is ready to sign inside the window.
2. Then ask both parties for a signed release direction.

> [!NEVER]
> Never tell anyone the deposit is safe or non-refundable. Escalate disputes to Shelly.

### Moving the closing date

In the example, closing has to move later because the buyer's lender needs three more days. A closing can always move earlier, but any later date is an amendment.

1. On the **Terms** page, click **Amendment** and enter the extension in plain words. Click **Save**.
2. Add the **Amendment to purchase and sale agreement** and send it to both parties.

Never agree an extension verbally.

### Closing statements

- **The buyer's statement** shows the price, less the survey allowance and the deposit in escrow, plus taxes, for the balance due.
- **The seller's statement** shows the adjusted price, less the 10% commission, for the net.
- Each side signs its own.

Verify every wire by phone again at closing. It's the moment attackers target most.

### Closed

Every document, every signature and every date sits in one file in YachtCloser. That record protects the client, the firm and your license.

Next come the title and registration transfer, the handoff after the sale, and asking for two referrals.

## Wrap-up

YachtCloser is where every 365 Yachts contract lives, and where deals are won or lost on paper:

- Enter it precisely.
- Send in the right order.
- Move dates only by amendment.
- Verify every wire by phone.

This week, open the YachtCloser simulator in the Training Hub and click through all 35 steps. Then build the same sample listing and deal in your own account, and walk Shelly through it.$g$::text)
FROM updated;
