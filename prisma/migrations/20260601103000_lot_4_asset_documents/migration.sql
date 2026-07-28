-- Lot 4: chronological documents, grouped entry links, detailed lines and sensitive action approval structure.

ALTER TABLE "users" ADD COLUMN "direction_code_hash" TEXT;

CREATE TABLE "asset_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "document_number" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "validated_by" TEXT,
    "validated_at" DATETIME,
    "cancelled_at" DATETIME
);

CREATE TABLE "asset_document_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "document_id" TEXT NOT NULL,
    "asset_entry_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_document_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "asset_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asset_document_entries_asset_entry_id_fkey" FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "asset_document_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "document_id" TEXT NOT NULL,
    "asset_entry_id" TEXT,
    "asset_unit_id" TEXT,
    "asset_item_id" TEXT,
    "location_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_label" TEXT NOT NULL,
    "line_notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "asset_document_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "asset_documents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asset_document_lines_asset_entry_id_fkey" FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "asset_document_lines_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "asset_document_lines_asset_item_id_fkey" FOREIGN KEY ("asset_item_id") REFERENCES "asset_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "asset_document_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "sensitive_action_approvals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity_table" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "requested_by" TEXT,
    "approved_by" TEXT,
    "approved_at" DATETIME,
    "reason" TEXT NOT NULL,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "asset_documents_document_number_key" ON "asset_documents"("document_number");
CREATE INDEX "asset_documents_document_number_idx" ON "asset_documents"("document_number");
CREATE INDEX "asset_documents_document_type_idx" ON "asset_documents"("document_type");
CREATE INDEX "asset_documents_status_idx" ON "asset_documents"("status");
CREATE INDEX "asset_documents_document_date_idx" ON "asset_documents"("document_date");

CREATE UNIQUE INDEX "asset_document_entries_document_id_asset_entry_id_key" ON "asset_document_entries"("document_id", "asset_entry_id");
CREATE INDEX "asset_document_entries_document_id_idx" ON "asset_document_entries"("document_id");
CREATE INDEX "asset_document_entries_asset_entry_id_idx" ON "asset_document_entries"("asset_entry_id");

CREATE UNIQUE INDEX "asset_document_lines_document_id_asset_unit_id_key" ON "asset_document_lines"("document_id", "asset_unit_id");
CREATE INDEX "asset_document_lines_document_id_idx" ON "asset_document_lines"("document_id");
CREATE INDEX "asset_document_lines_asset_entry_id_idx" ON "asset_document_lines"("asset_entry_id");
CREATE INDEX "asset_document_lines_asset_unit_id_idx" ON "asset_document_lines"("asset_unit_id");
CREATE INDEX "asset_document_lines_asset_item_id_idx" ON "asset_document_lines"("asset_item_id");
CREATE INDEX "asset_document_lines_location_id_idx" ON "asset_document_lines"("location_id");

CREATE INDEX "sensitive_action_approvals_action_idx" ON "sensitive_action_approvals"("action");
CREATE INDEX "sensitive_action_approvals_entity_table_entity_id_idx" ON "sensitive_action_approvals"("entity_table", "entity_id");
CREATE INDEX "sensitive_action_approvals_requested_by_idx" ON "sensitive_action_approvals"("requested_by");
CREATE INDEX "sensitive_action_approvals_approved_by_idx" ON "sensitive_action_approvals"("approved_by");
