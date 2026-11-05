/**
 * File: packages/db/src/seed/steps.ts
 * Purpose: The onboarding steps from docs/SPEC.md: the two "Start here" steps (step 0, Aj's portal walkthrough video, and
 * step 1, Aj's personal AI agent video; SPEC D30), then the 12 steps with copy taken from the mockups and the 365 Broker
 * Onboarding Manual (Module 01 Week One Setup, Module 02 Licensing). Seeded once; admins can edit them later. The old
 * step 11 (commission_tier) is retired by migration 0005: commission splits are now set at invite (SPEC D27). Step 10 is
 * now "Log in to your 365 Yachts email" (no brand signature), and the old platform logins step is retired and split
 * into CRM sign in and training (its video must be watched before it can be ticked; copy in crm-training.ts), BoatWizard
 * sign in and YachtCloser sign in, steps 11 to 13 (SPEC D32, migration 0019). Upload
 * steps carry their own file-count limits (minFiles/maxFiles) and the bio its word limits; migration 0014 adds them to existing databases.
 * The DBPR confirmation is PDF only (migration 0015). Steps 7 to 9 use the licensing guides in
 * license-paths.ts: step 7's answer picks the guide steps 8 and 9 show, and "not sure" emails the admins (migration 0016).
 *
 * Functions:
 * - none
 */
import { MAX_UPLOAD_BYTES, type StepConfig, type StepKind, type StepStage } from "@bp/shared";
import { CRM_TRAINING_INTRO } from "./crm-training";
import { DBPR_FILING_PATHS, LICENSE_BOND_PATHS, LICENSE_CHOICE_VALUES, LICENSE_CHOICES } from "./license-paths";

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
const PDF_TYPES = ["application/pdf"];

export const ONBOARDING_STEP_SEEDS: readonly StepSeed[] = [
  {
    key: "start_here",
    position: 0,
    stage: "start_here",
    title: "Start here: how the 365 portal works",
    shortTitle: "Start here: portal walkthrough",
    summary: "Watch Aj's short walkthrough of the portal before you begin. Takes about 10 minutes.",
    intro: "Aj walks you through the platform: your checklist, sending each step, getting help, and what happens after.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Watch Part 1: Aj walks you through the platform.",
      "2. Tick the box to say you've watched it.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: { minutes: 10, confirmLabel: "I've watched the walkthrough" },
  },
  {
    key: "ai_agent",
    position: 1,
    stage: "start_here",
    title: "Introducing your personal AI agent",
    shortTitle: "Start here: your personal AI agent",
    summary: "Watch Aj introduce your personal AI agent. Takes about 5 minutes.",
    intro: "Part 2 of Start here: Aj introduces your personal AI agent.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Watch Part 2: Aj introduces your personal AI agent.",
      "2. Tick the box to say you've watched it.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: { minutes: 5, confirmLabel: "I've watched the AI agent video" },
  },
  {
    key: "photo_id",
    position: 2,
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
      "3. Upload it here — a clear phone photo is fine. For a driver's license, add the front and the back (2 files at most).",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 2,
      minFiles: 1,
      maxFiles: 2,
      reviewChecklist: ["Photo is clear and readable", "Name matches the broker", "Not expired"],
    },
  },
  {
    key: "contract_nda",
    position: 3,
    stage: "paperwork",
    title: "Review and sign your agreements",
    shortTitle: "Broker Agreement & NDA",
    summary: "Read your Broker Agreement and NDA, already filled in with your details, and sign both here. Takes about 10 minutes.",
    intro: "Your Broker Agreement sets out how you work with 365 Yachts and your commission splits; the NDA protects our clients and systems. Both are filled in for you, and one signature signs both.",
    kind: "upload",
    needsApproval: true,
    instructionsMd: [
      "1. Open and read both documents.",
      "2. Enter your mailing address and license number, and check your phone and email.",
      "3. Sign once. Your signature goes on both documents.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 10,
      reviewChecklist: ["Both documents signed by the broker", "Commission splits match the profile", "Countersigned by 365 Yachts"],
    },
  },
  {
    key: "bio",
    position: 4,
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
      minWords: 100,
      maxWords: 250,
      placeholder: "I grew up on the water in…",
      reviewChecklist: ["Professional tone", "No spelling mistakes", "Roughly 100 to 200 words"],
    },
  },
  {
    key: "headshot",
    position: 5,
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
      "3. No sunglasses, hats or filters — then upload one photo here, at least 600 × 600 pixels.",
    ].join("\n"),
    acceptedTypes: IMAGE_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 5,
      minFiles: 1,
      maxFiles: 1,
      minImagePx: 600,
      reviewChecklist: ["Plain background", "Shoulders up, facing the camera", "Sharp and well lit"],
    },
  },
  {
    key: "w9",
    position: 6,
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
      minFiles: 1,
      maxFiles: 2,
      templateLink: { label: "Download blank W-9", url: "https://www.irs.gov/pub/irs-pdf/fw9.pdf" },
      reviewChecklist: ["Name matches their ID", "Tax ID filled in", "Signed and dated"],
    },
  },
  {
    key: "license_situation",
    position: 7,
    stage: "florida_license",
    title: "Tell us your license situation (new, transfer or not yet licensed)",
    shortTitle: "License situation",
    summary: "One question so we can guide you through the right licensing path. Takes 1 minute.",
    intro: "Florida requires a yacht and ship license to sell any used vessel over 32 feet. Tell us where you stand, and steps 8 and 9 will show you exactly what to do.",
    kind: "choice",
    needsApproval: false,
    instructionsMd: [
      "1. Pick the option that describes you today.",
      "2. Not sure? Pick the last option and we'll message you to work it out together.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 1,
      choices: LICENSE_CHOICES,
      alertChoices: [LICENSE_CHOICE_VALUES.notSure],
    },
  },
  {
    key: "dbpr_filing",
    position: 8,
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
      "3. Upload the confirmation here as a PDF. On the DBPR page, use Print, then Save as PDF.",
    ].join("\n"),
    acceptedTypes: PDF_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 30,
      minFiles: 1,
      maxFiles: 2,
      links: [{ label: "DBPR Yacht and Ship forms", url: "https://www2.myfloridalicense.com/yacht-and-ships/forms-and-publications/" }],
      paths: { fromStep: "license_situation", options: DBPR_FILING_PATHS },
      reviewChecklist: ["Application or transfer confirmation is visible", "Name matches their ID"],
    },
  },
  {
    key: "license_bond",
    position: 9,
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
      "3. Upload both here — one file with both is fine, or up to 5 separate files.",
    ].join("\n"),
    acceptedTypes: DOCUMENT_TYPES,
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 5,
      minFiles: 1,
      maxFiles: 5,
      paths: { fromStep: "license_situation", options: LICENSE_BOND_PATHS },
      reviewChecklist: ["License number visible", "Bond amount matches license type", "Names match"],
    },
  },
  {
    key: "email_signature",
    position: 10,
    stage: "your_tools",
    title: "Log in to your 365 Yachts email",
    shortTitle: "Log in to your 365 email",
    summary: "Sign in to the 365 Yachts email we made for you and pick your own password. Takes about 5 minutes.",
    intro: "All your client email runs through your 365 Yachts address. Your email address and starting password are below.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Open Gmail and sign in with your 365 email and the starting password below.",
      "2. Pick your own password when Google asks.",
      "3. Tick the box once you're signed in.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 5,
      confirmLabel: "I've logged in to my 365 Yachts email",
    },
  },
  {
    key: "crm_login",
    position: 11,
    stage: "your_tools",
    title: "CRM sign in and training",
    shortTitle: "CRM sign in and training",
    summary: "Watch Aj's CRM training, then sign in to GoHighLevel. Takes about 20 minutes.",
    intro: CRM_TRAINING_INTRO,
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Watch the CRM training video.",
      "2. Sign in to GoHighLevel with the login details you received.",
      "3. Tick the box once you're signed in.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 20,
      confirmLabel: "I've watched the CRM training and signed in to GoHighLevel",
      fullTextLabel: "Read along with the video",
      fullTextSource: "Transcript",
      requireVideo: true,
    },
  },
  {
    key: "boatwizard_login",
    position: 12,
    stage: "your_tools",
    title: "Sign in to BoatWizard",
    shortTitle: "BoatWizard sign in",
    summary: "Sign in to BoatWizard, the MLS, and run one practice search. Takes about 10 minutes.",
    intro: "BoatWizard / YachtWorld is the MLS: listings, buyer searches and sold comps.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Sign in to BoatWizard with the login details you received.",
      "2. Run one practice search.",
      "3. Tick the box once you've done it.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 10,
      confirmLabel: "I signed in to BoatWizard and ran one practice search",
    },
  },
  {
    key: "yachtcloser_login",
    position: 13,
    stage: "your_tools",
    title: "Sign in to YachtCloser",
    shortTitle: "YachtCloser sign in",
    summary: "Sign in to YachtCloser and review a sample deal file. Takes about 10 minutes.",
    intro: "YachtCloser handles contracts, e-signatures, deals and closing statements.",
    kind: "confirm",
    needsApproval: false,
    instructionsMd: [
      "1. Sign in to YachtCloser with the login details you received.",
      "2. Open a sample deal file and look through it.",
      "3. Tick the box once you've done it.",
    ].join("\n"),
    acceptedTypes: [],
    maxSizeBytes: MAX_UPLOAD_BYTES,
    config: {
      minutes: 10,
      confirmLabel: "I signed in to YachtCloser and reviewed a sample deal file",
    },
  },
];
