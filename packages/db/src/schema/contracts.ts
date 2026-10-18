/**
 * File: packages/db/src/schema/contracts.ts
 * Purpose: Contract signing tables (SPEC D31). contract_templates holds each versioned blank PDF with its field map and
 * font; company_signatures holds Shelly's authorized signature (image in the private bucket, authorization text, time,
 * IP and user agent, auto-sign switch); contract_documents holds every generated document for a broker with the
 * storage key and SHA-256 of each version (unsigned, broker-signed, final), who signed when, and void details.
 * New tables and enums only.
 *
 * Functions:
 * - none
 */
import { COMPANY_SIGN_METHODS, CONTRACT_STATUSES, type ContractFieldMap } from "@bp/shared";
import { boolean, customType, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { brokers, files } from "./portal";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const contractStatusEnum = pgEnum("contract_status", CONTRACT_STATUSES);
export const companySignMethodEnum = pgEnum("company_sign_method", COMPANY_SIGN_METHODS);

export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    pdf: bytea("pdf").notNull(),
    pdfSha256: text("pdf_sha256").notNull(),
    fields: jsonb("fields").$type<ContractFieldMap>().notNull(),
    font: text("font").notNull(),
    fontFile: bytea("font_file"),
    active: boolean("active").notNull().default(true),
    createdAt,
  },
  (table) => [unique("contract_templates_key_version_unique").on(table.key, table.version)],
);

export const companySignatures = pgTable(
  "company_signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    imageStorageKey: text("image_storage_key").notNull(),
    imageSha256: text("image_sha256").notNull(),
    authorizationText: text("authorization_text").notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }).notNull(),
    authorizedIp: text("authorized_ip"),
    authorizedUserAgent: text("authorized_user_agent"),
    autoSign: boolean("auto_sign").notNull().default(true),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [index("company_signatures_user_idx").on(table.userId, table.createdAt)],
);

export const contractDocuments = pgTable(
  "contract_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => contractTemplates.id, { onDelete: "restrict" }),
    templateKey: text("template_key").notNull(),
    status: contractStatusEnum("status").notNull().default("pending"),
    values: jsonb("values").$type<Record<string, string>>(),
    unsignedStorageKey: text("unsigned_storage_key"),
    unsignedSha256: text("unsigned_sha256"),
    brokerSignedStorageKey: text("broker_signed_storage_key"),
    brokerSignedSha256: text("broker_signed_sha256"),
    finalStorageKey: text("final_storage_key"),
    finalSha256: text("final_sha256"),
    finalFileId: uuid("final_file_id").references(() => files.id, { onDelete: "set null" }),
    brokerSignatureStorageKey: text("broker_signature_storage_key"),
    brokerSignatureMethod: text("broker_signature_method"),
    brokerSignedAt: timestamp("broker_signed_at", { withTimezone: true }),
    brokerIp: text("broker_ip"),
    brokerUserAgent: text("broker_user_agent"),
    consentText: text("consent_text"),
    companySignatureId: uuid("company_signature_id").references(() => companySignatures.id, { onDelete: "restrict" }),
    companySignedBy: uuid("company_signed_by").references(() => users.id, { onDelete: "set null" }),
    companySignedAt: timestamp("company_signed_at", { withTimezone: true }),
    companySignMethod: companySignMethodEnum("company_sign_method"),
    outsideSignedOn: date("outside_signed_on", { mode: "string" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    createdAt,
    updatedAt,
  },
  (table) => [index("contract_documents_broker_idx").on(table.brokerId, table.templateKey, table.createdAt)],
);
