/**
 * File: packages/db/src/seed/license-paths.ts
 * Purpose: The Florida licensing guides for steps 6 to 8, written so someone who has never done it can follow them:
 * the step 6 answers (each one clearly different), and for steps 7 and 8 one numbered guide per answer, shown to the
 * broker for the route they picked. Facts come from Chapter 326 Florida Statutes (s. 326.004) and DBPR's Yacht and
 * Ship pages and help answers, checked October 2026: Form YS 6000-1, the $10,000 salesperson bond, the $551 listed
 * fee, Livescan ORI FL921900Z, the Change Form with its $100 listed fee, and the temporary 90-day license.
 *
 * Functions:
 * - none
 */
import type { StepPath } from "@bp/shared";

export const LICENSE_CHOICE_VALUES = { newLicense: "new", transfer: "transfer", notSure: "not_licensed_yet" } as const;

export const LICENSE_CHOICES = [
  { value: LICENSE_CHOICE_VALUES.newLicense, label: "I don't have a Florida yacht & ship license yet. I'll apply for a new salesperson license (most new brokers pick this)" },
  { value: LICENSE_CHOICE_VALUES.transfer, label: "I already have a Florida yacht & ship license with another brokerage, and I'll move it to 365" },
  { value: LICENSE_CHOICE_VALUES.notSure, label: "I'm not sure what I have or what I need. I'd like help first" },
];

export const LICENSE_SITUATION_TODO = [
  "Never held a Florida yacht & ship license? Pick the first option.",
  "Licensed with another Florida brokerage? Pick the second.",
  "Not sure? Pick the third and we'll message you.",
  "A Florida real estate license doesn't count.",
  "Your answer sets what you see in steps 7 and 8.",
];

const LINKS = {
  forms: "https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/",
  licensing: "https://www2.myfloridalicense.com/yacht-and-ships/licensing/",
  faqs: "https://www2.myfloridalicense.com/yacht-and-ships/faqs/",
  livescan: "https://www.fdle.state.fl.us/criminal-history-records/registered-livescan-submitters",
  verify: "https://www.myfloridalicense.com/",
  statute: "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0300-0399/0326/0326.html",
};

const SCAN_TIP = "iPhone: open the Notes app, tap the camera icon, then Scan Documents. Android: open Google Drive, tap +, then Scan.";

const NEW_LICENSE_FILING = `Most new brokers are here. It takes about an hour of your own time spread over a few days, plus the bond and the DBPR fee. Do these in order.

1. **Message Shelly first.** Ask her for 365 Yachts Inc.'s employing broker details: company name, address and DBPR license number. You'll copy them onto the application in step 5.
2. **Buy a $10,000 surety bond.** A bond is a guarantee you buy from a bond company. It is not money you hand to DBPR. Search online for "Florida yacht salesperson bond", or ask any insurance agent. Tell them it's for a **Florida yacht and ship salesperson license (Chapter 326)**. You pay a small part of the $10,000, depending on your credit. As a new licensee you get a **paper original with a raised seal**. Keep it safe: you'll mail it to DBPR.
3. **Scan the bond to PDF before you mail it.** You'll need the copy in step 8. ${SCAN_TIP}
4. **Get your fingerprints taken (Livescan).** Pick a location from the [FDLE list of Livescan providers](${LINKS.livescan}) and bring your photo ID. Tell them it's for a **Chapter 326 yacht and ship license** and give them **ORI number FL921900Z** (the DBPR Yacht and Ship section). A wrong ORI means DBPR never gets your results. Keep the receipt. Fingerprints must be less than 6 months old when DBPR receives your application.
5. **Fill in the application: DBPR Form YS 6000-1.** Download it from the [DBPR Yacht and Ship forms page](${LINKS.forms}). Choose **Salesperson**: a broker license needs a salesperson license plus sales experience first. Enter 365 Yachts Inc. as your employing broker, using the details from Shelly. Sign and date it.
6. **Pay the fee.** DBPR lists **$551** (application plus fingerprint processing). Amounts change, so check the form or the [licensing page](${LINKS.licensing}) for the current fee and how to pay.
7. **Send DBPR your application, the original bond and the fee**, to the address on the form. Not sure about anything? Call the Yacht and Ship Brokers' Section on **850-487-2987**.
8. **Message Shelly the day you send it.**
9. **Upload your proof below.** Scan your signed application and your fingerprint receipt into one PDF and upload it. ${SCAN_TIP}

**What happens next:** DBPR issues a **temporary 90-day license** while the FBI background check runs, then your permanent two-year license. You'll upload your license and bond copy in step 8.`;

const TRANSFER_FILING = `You already hold a Florida yacht & ship license with another brokerage. Moving it to 365 is paperwork only. Do these in order.

1. **Message Shelly first.** Ask her for 365 Yachts Inc.'s employing broker details: company name, address and DBPR license number. If you hold a **broker** license rather than a salesperson license, tell her: the paperwork is different.
2. **Tell your current brokerage you're leaving.** By law your license is held by your employing broker, and when you leave they must send it back to DBPR. Ask them to do that now.
3. **Fill in the Yacht and Ship Broker Change Form.** Download it from the [DBPR Yacht and Ship forms page](${LINKS.forms}). Mark it as a **change of employing broker** and enter 365 Yachts Inc.'s details from Shelly. Sign and date it.
4. **Include the change fee.** DBPR's FAQ lists **$100** for changing brokerage. Check the form for the current amount and how to pay.
5. **Send DBPR the form and the fee** as the form explains. Do it straight away: DBPR expects a change of employer within 30 days. Questions? Call **850-487-2987**.
6. **Call your bond company.** Tell them you've moved to 365 Yachts and ask whether your bond needs updating.
7. **Message Shelly the day you send it.** Until DBPR shows your license with 365 Yachts, check with Shelly before you work on any deal.
8. **Upload your proof below.** Scan your signed change form (and the payment receipt, if you have one) into a PDF and upload it. ${SCAN_TIP}`;

const NOT_SURE_FILING = `No problem. We've let the team know, and Shelly will message you to work it out together. Meanwhile, carry on with your other steps.

1. **Check whether you already have a license.** Go to [MyFloridaLicense.com](${LINKS.verify}), choose **Verify a License**, and search your name.
2. **Found an active yacht and ship salesperson or broker license?** You're moving a license: follow "Moving your license to 365" below.
3. **Found nothing?** You need a new license: follow "Applying for a new salesperson license" below.
4. **Only have a real estate license?** That doesn't count. Selling used boats over 32 feet needs a separate yacht and ship license, so you need a new one.
5. **Still unsure?** Wait for Shelly's message, or tap Message Shelly on WhatsApp now.`;

const NEW_LICENSE_COPIES = `Do this once DBPR has issued your license. The temporary 90-day license is fine. It can take a little while after step 7, so this step will wait for you.

1. **Get a copy of your license.** If DBPR sent it to you, scan it to PDF. If it went to 365 Yachts, message Shelly: she can upload it for you. Or go to [MyFloridaLicense.com](${LINKS.verify}), choose **Verify a License**, search your name, open your license, then use **Print** and **Save as PDF**.
2. **Find the bond copy you scanned** before you mailed the original in step 7. No copy? Ask your bond company to email you one.
3. **Check both.** Your name and license number must be easy to read.
4. **Upload them below.** One PDF with both is fine, or separate files. Clear phone photos work too.
5. **When your permanent license arrives**, message Shelly so she can update your file.`;

const TRANSFER_COPIES = `Do this once DBPR shows your license under 365 Yachts.

1. **Check DBPR has moved your license.** Go to [MyFloridaLicense.com](${LINKS.verify}), choose **Verify a License**, and search your name. The employer should say 365 Yachts. Not yet? Wait a few days and check again, or message Shelly.
2. **Save that page as a PDF:** use **Print**, then **Save as PDF**. That's your license copy.
3. **Get a copy of your current bond.** Ask your bond company to email one if you don't have it.
4. **Upload both below.** One PDF with both is fine, or separate files.`;

const NOT_SURE_COPIES = `Finish step 7 with Shelly first. Once you know whether you're getting a new license or moving one, open the matching guide below and follow it.`;

const NEW_HEADING = "Applying for a new salesperson license";
const TRANSFER_HEADING = "Moving your license to 365";
const NOT_SURE_HEADING = "Not sure yet: let's find out";

export const DBPR_FILING_PATHS: StepPath[] = [
  { value: LICENSE_CHOICE_VALUES.newLicense, heading: NEW_HEADING, bodyMd: NEW_LICENSE_FILING },
  { value: LICENSE_CHOICE_VALUES.transfer, heading: TRANSFER_HEADING, bodyMd: TRANSFER_FILING },
  { value: LICENSE_CHOICE_VALUES.notSure, heading: NOT_SURE_HEADING, bodyMd: NOT_SURE_FILING },
];

export const LICENSE_BOND_PATHS: StepPath[] = [
  { value: LICENSE_CHOICE_VALUES.newLicense, heading: `${NEW_HEADING}: your copies`, bodyMd: NEW_LICENSE_COPIES },
  { value: LICENSE_CHOICE_VALUES.transfer, heading: `${TRANSFER_HEADING}: your copies`, bodyMd: TRANSFER_COPIES },
  { value: LICENSE_CHOICE_VALUES.notSure, heading: NOT_SURE_HEADING, bodyMd: NOT_SURE_COPIES },
];

export const DBPR_FILING_TODO = [
  "Open your step-by-step guide above and follow it in order.",
  "Message Shelly before you start, for 365's employing broker details.",
  "Scan your paperwork to PDF before you mail anything.",
  "Upload your proof below as a PDF.",
];

export const LICENSE_BOND_TODO = [
  "Wait until DBPR has issued your license. A temporary one is fine.",
  "Follow your step-by-step guide above.",
  "Upload your license and your bond copy: one file or separate files.",
];

export const DBPR_OFFICIAL_LINKS_MD = `## Official links

- [DBPR Yacht and Ship licensing](${LINKS.licensing}): requirements and fees
- [DBPR Yacht and Ship forms](${LINKS.forms}): Form YS 6000-1 and the Change Form
- [DBPR Yacht and Ship FAQs](${LINKS.faqs}): bond amounts, fees, license terms
- [FDLE Livescan providers](${LINKS.livescan}): where to get fingerprinted (ORI FL921900Z)
- [Chapter 326, Florida Statutes](${LINKS.statute}): the Florida Yacht and Ship Brokers' Act`;
