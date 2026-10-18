/**
 * File: packages/db/src/seed/steps.ts
 * Purpose: The onboarding steps from docs/SPEC.md: step 0 "Start here" (a portal walkthrough video, SPEC D30), then the 10 steps with copy taken from the mockups and the 365 Broker
 * Onboarding Manual (Module 01 Week One Setup, Module 02 Licensing). Seeded once; admins can edit them later. The old
 * step 11 (commission_tier) is retired by migration 0005: commission splits are now set at invite (SPEC D27).
 *
 * Functions:
 * - none
 */
import { MAX_UPLOAD_BYTES, type StepConfig, type StepKind, type StepStage } from "@bp/shared";

export type StepSeed = {
  key: string;
  position: number;
  stage: StepStage;
  title: string;
  shortTitle: string;
  summary: string;
  intro: string;
  kind: StepKind;
  needsApproval: boolean;
  instructionsMd: string;
  acceptedTypes: string[];
  maxSizeBytes: number;
  config: StepConfig;
};

const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const IMAGE_TYPES = ["image/jpeg", "image/png"];

export const ONBOARDING_STEP_SEEDS: readonly StepSeed[] = [
  {
    key: "start_here",
    position: 0,
    stage: "start_here",
    title: "Start here: how the 365 portal works",
    shortTitle: "Start here: portal walkthrough",
    summary: "Watch a short walkthrough of the portal before you begin. Takes about 10 minutes.",
    intro: "Shelly shows you around the portal: your checklist, sending each step, getting help, and what happens after.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Watch the walkthrough video.",
      "2. Tick the box to say you've watched it.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: { minutes: 10, confirmLabel: "I've watched the walkthrough" },
  },
  {
    key: "photo_id",
    position: 1,
    stage: "paperwork",
    title: "Upload photo ID / driver's license",
    shortTitle: "Photo ID / driver's license",
    summary: "A clear photo of your driver's license or passport. Takes about 2 minutes.",
    intro: "We keep a copy of your ID on file to confirm who you are before you represent 365 Yachts.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. Use your driver's license or passport.",
      "2. Lay it flat in good light so all four corners and every word are readable.",
      "3. Upload it here — a clear phone photo is fine.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 2,
      reviewChecklist: ["Photo is clear and readable", "Name matches the broker", "Not expired"],
    },
  },
  {
    key: "contract_nda",
    position: 2,
    stage: "paperwork",
    title: "Sign your Employment Contract & NDA",
    shortTitle: "Employment Contract & NDA",
    summary: "Download the contract and NDA, sign both, and upload the signed copies. Takes about 10 minutes.",
    intro: "Your Employment Contract and NDA make it official. Sign both before you take your first client call.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. Download the contract and NDA below.",
      "2. Read both, then sign and date every place marked for you.",
      "3. Upload the signed pages here — a PDF scan or clear phone photos are fine.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 10,
      templateLabel: "Download contract & NDA",
      reviewChecklist: ["Both documents signed", "Signatures dated", "Every page included"],
    },
  },
  {
    key: "bio",
    position: 3,
    stage: "paperwork",
    title: "Write your professional bio",
    shortTitle: "Professional bio",
    summary: "A short bio in your own words for your 365 profile and listings. Takes about 10 minutes.",
    intro: "Clients read your bio before they call you. Write it yourself, in the first person, so it sounds like you.",
    kind: "text",
    needsApproval: true,
    instructionsMd: [
      "1. Write 100 to 200 words in the first person.",
      "2. Say where you come from, what you know about boats, and the clients you love working with.",
      "3. Keep it professional — no prices, no promises, no emojis.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 10,
      minLength: 300,
      maxLength: 2000,
      placeholder: "I grew up on the water in…",
      reviewChecklist: ["Professional tone", "No spelling mistakes", "Roughly 100 to 200 words"],
    },
  },
  {
    key: "headshot",
    position: 4,
    stage: "paperwork",
    title: "Upload a professional headshot",
    shortTitle: "Professional headshot",
    summary: "A recent photo for your profile and marketing. Takes about 5 minutes.",
    intro: "Your headshot goes on your profile, your email signature and our marketing, so it needs to look sharp.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. Stand in front of a plain, light background.",
      "2. Frame it from the shoulders up, facing the camera, in good daylight.",
      "3. No sunglasses, hats or filters — then upload it here.",
    ].join("\n"),
    acceptedTypes: IMAGE_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 5,
      reviewChecklist: ["Plain background", "Shoulders up, facing the camera", "Sharp and well lit"],
    },
  },
  {
    key: "w9",
    position: 5,
    stage: "paperwork",
    title: "Upload your W-9",
    shortTitle: "W-9",
    summary: "We need it before we can pay your commission. Takes about 5 minutes — a blank form is included.",
    intro: "You're paid as an independent contractor, so we need a W-9 on file before we can wire your first commission.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. Download the blank form below.",
      "2. Fill in your name, address and tax ID, then sign and date it.",
      "3. Upload it here — a clear phone photo is fine.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 5,
      templateLink: { label: "Download blank W-9", url: "https://www.irs.gov/pub/irs-pdf/fw9.pdf" },
      reviewChecklist: ["Name matches their ID", "Tax ID filled in", "Signed and dated"],
    },
  },
  {
    key: "license_situation",
    position: 6,
    stage: "florida_license",
    title: "Tell us your license situation (new, transfer or not yet licensed)",
    shortTitle: "License situation",
    summary: "One question so we can guide you through the right licensing path. Takes 1 minute.",
    intro: "Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand.",
    kind: "choice",
    needsApproval: false,
    instructionsMd: [
      "1. Pick the option that describes you today.",
      "2. Not sure? Pick \"Not licensed yet\" and we'll help you work it out.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 1,
      choices: [
        { value: "new", label: "New to Florida brokerage — I'll apply for a new license" },
        { value: "transfer", label: "I hold a Florida yacht & ship license and will transfer it to 365" },
        { value: "not_licensed_yet", label: "Not licensed yet — I need help getting started" },
      ],
    },
  },
  {
    key: "dbpr_filing",
    position: 7,
    stage: "florida_license",
    title: "File your DBPR application or license transfer",
    shortTitle: "DBPR application / transfer",
    summary: "Apply for your license or transfer it to 365 Yachts with the DBPR, then upload the confirmation.",
    intro:
      "Florida's Department of Business and Professional Regulation (DBPR) licenses yacht and ship salespeople and brokers.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. New license: register on the DBPR online portal and complete the application, fingerprints, surety bond and fee. You get a temporary 90-day license while background checks run.",
      "2. Transfer: request a license transfer through DBPR to associate your license with 365 Yachts Inc., and tell your Sales Executive the day you submit.",
      "3. Upload the confirmation here — a screenshot or PDF is fine.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 30,
      links: [{ label: "DBPR online services", url: "https://www.myfloridalicense.com/" }],
      reviewChecklist: ["Application or transfer confirmation is visible", "Name matches their ID"],
    },
  },
  {
    key: "license_bond",
    position: 8,
    stage: "florida_license",
    title: "Upload your license & surety bond copy",
    shortTitle: "License & surety bond copy",
    summary: "Upload your license and your surety bond once DBPR issues them.",
    intro:
      "Salespersons need a $10,000 surety bond and brokers a $25,000 bond. DBPR sets these amounts and they change, so check the current figures on the DBPR site.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. Find your license (temporary or permanent) and your surety bond.",
      "2. Make sure your name and license number are readable on both.",
      "3. Upload both here — you can add up to 5 files.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 5,
      reviewChecklist: ["License number visible", "Bond amount matches license type", "Names match"],
    },
  },
  {
    key: "email_signature",
    position: 9,
    stage: "your_tools",
    title: "Activate your 365 email and install the brand signature",
    shortTitle: "365 email + brand signature",
    summary: "All client communication runs through your 365 email with the brand signature. Takes about 10 minutes.",
    intro:
      "House rule: anything that counts as a record goes through your 365 Yachts email with the brand signature. Texts and calls are fine, but never use personal email for client business.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Sign in to your 365 Yachts email with the details you received.",
      "2. Install the 365 brand signature block with the logo.",
      "3. Send yourself a test email to check the signature looks right.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 10,
      confirmLabel: "I've activated my 365 email and installed the brand signature",
    },
  },
  {
    key: "platform_logins",
    position: 10,
    stage: "your_tools",
    title: "Log in to BoatWizard, YachtCloser and GoHighLevel",
    shortTitle: "BoatWizard, YachtCloser, GoHighLevel logins",
    summary: "Log in to the three platforms you'll use every day and take one first action in each.",
    intro: "These are the tools you sell with: the MLS, contracts and closing, and your CRM.",
    kind: "checklist",
    needsApproval: false,
    instructionsMd: [
      "1. BoatWizard / YachtWorld is the MLS: listings, buyer searches and sold comps.",
      "2. YachtCloser handles contracts, e-signatures, deals and closing statements.",
      "3. GoHighLevel is the CRM: leads, pipeline, follow-ups and campaigns.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 30,
      items: [
        { value: "boatwizard", label: "I logged in to BoatWizard and ran one practice search", videoUrl: null },
        { value: "yachtcloser", label: "I logged in to YachtCloser and reviewed a sample deal file", videoUrl: null },
        { value: "gohighlevel", label: "I logged in to GoHighLevel and started loading my contacts", videoUrl: null },
      ],
    },
  },
];
