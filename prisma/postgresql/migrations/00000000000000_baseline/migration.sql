-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "immos";

-- Keep every unqualified object from this migration inside the dedicated schema.
SET search_path = "immos";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DIRECTION', 'INVENTORY_MANAGER', 'MAINTENANCE_MANAGER', 'BASIC_USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'VERY_GOOD', 'GOOD', 'FAIR', 'WORN', 'TO_REPAIR', 'OUT_OF_ORDER');

-- CreateEnum
CREATE TYPE "AssetUnitStatus" AS ENUM ('IN_SERVICE', 'IN_STOCK', 'IN_REPAIR', 'TEMPORARILY_OUT', 'MISSING', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetInformationStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'TO_COMPLETE', 'UNKNOWN_INFO');

-- CreateEnum
CREATE TYPE "AssetEntryType" AS ENUM ('PURCHASE', 'EXISTING_STOCK', 'DONATION', 'INCOMING_TRANSFER', 'PROGRESSIVE_INVENTORY');

-- CreateEnum
CREATE TYPE "AssetEntryStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetDocumentType" AS ENUM ('PROGRESSIVE_INVENTORY_SHEET', 'ENTRY_SLIP', 'ASSIGNMENT_SLIP', 'MOVEMENT_SLIP', 'BATCH_MOVEMENT_SLIP', 'ISSUE_REPORT', 'REPAIR_SHEET', 'PERIODIC_INVENTORY_SHEET', 'DISCREPANCY_SHEET', 'REGULARIZATION_SLIP', 'TEMPORARY_EXIT_SLIP', 'RETURN_SLIP', 'FINAL_EXIT_SLIP');

-- CreateEnum
CREATE TYPE "AssetDocumentStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetMovementType" AS ENUM ('ASSIGNMENT', 'REASSIGNMENT', 'LOAN_EVENT', 'RETURN_FROM_LOAN_EVENT', 'WORKSHOP_REPAIR', 'RETURN_FROM_WORKSHOP_REPAIR', 'LOCATION_CHANGE', 'ROOM_TRANSFER', 'STOCK_TRANSFER', 'TEMPORARY_EXIT', 'RETURN_FROM_TEMPORARY_EXIT', 'REGULARIZATION');

-- CreateEnum
CREATE TYPE "AssetMovementStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetFileType" AS ENUM ('MAIN_PHOTO', 'GENERAL_VIEW', 'DETAIL_VIEW', 'DEFECT_PHOTO', 'SERIAL_OR_LABEL', 'INVOICE', 'WARRANTY', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BASIC_USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "auth_provider" TEXT NOT NULL DEFAULT 'local',
    "external_auth_id" TEXT,
    "direction_code_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "supplier_type" TEXT,
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location_type" TEXT,
    "parent_id" TEXT,
    "notes" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "parent_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "unit_label" TEXT,
    "depreciation_years" INTEGER,
    "category_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_entries" (
    "id" TEXT NOT NULL,
    "entry_number" TEXT NOT NULL,
    "asset_item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "entry_type" "AssetEntryType" NOT NULL,
    "entry_date" TIMESTAMPTZ(3) NOT NULL,
    "initial_condition" "AssetCondition" NOT NULL,
    "initial_status" "AssetUnitStatus" NOT NULL,
    "entry_status" "AssetEntryStatus" NOT NULL DEFAULT 'VALIDATED',
    "information_status" "AssetInformationStatus" NOT NULL DEFAULT 'PARTIAL',
    "purchase_date" TIMESTAMPTZ(3),
    "purchase_date_known" BOOLEAN NOT NULL DEFAULT false,
    "supplier_known" BOOLEAN NOT NULL DEFAULT false,
    "unit_price" INTEGER,
    "total_price" INTEGER,
    "price_known" BOOLEAN NOT NULL DEFAULT false,
    "invoice_available" BOOLEAN NOT NULL DEFAULT false,
    "invoice_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "asset_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_units" (
    "id" TEXT NOT NULL,
    "asset_code" TEXT NOT NULL,
    "asset_item_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "entry_id" TEXT,
    "serial_number" TEXT,
    "condition" "AssetCondition" NOT NULL,
    "status" "AssetUnitStatus" NOT NULL,
    "information_status" "AssetInformationStatus" NOT NULL DEFAULT 'PARTIAL',
    "purchase_date" TIMESTAMPTZ(3),
    "purchase_date_known" BOOLEAN NOT NULL DEFAULT false,
    "unit_price" INTEGER,
    "price_known" BOOLEAN NOT NULL DEFAULT false,
    "supplier_known" BOOLEAN NOT NULL DEFAULT false,
    "invoice_available" BOOLEAN NOT NULL DEFAULT false,
    "invoice_reference" TEXT,
    "warranty_end_date" TIMESTAMPTZ(3),
    "possible_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_files" (
    "id" TEXT NOT NULL,
    "asset_unit_id" TEXT NOT NULL,
    "file_type" "AssetFileType" NOT NULL,
    "file_label" TEXT,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "asset_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_movements" (
    "id" TEXT NOT NULL,
    "movement_number" TEXT NOT NULL,
    "movement_type" "AssetMovementType" NOT NULL,
    "movement_status" "AssetMovementStatus" NOT NULL DEFAULT 'DRAFT',
    "movement_date" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "related_movement_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "validated_by" TEXT,
    "validated_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,

    CONSTRAINT "asset_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_movement_lines" (
    "id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "asset_unit_id" TEXT NOT NULL,
    "from_location_id" TEXT NOT NULL,
    "to_location_id" TEXT NOT NULL,
    "line_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_movement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_documents" (
    "id" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "document_type" "AssetDocumentType" NOT NULL,
    "document_date" TIMESTAMPTZ(3) NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AssetDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "validated_by" TEXT,
    "validated_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "cancellation_approval_id" TEXT,

    CONSTRAINT "asset_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_document_entries" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "asset_entry_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_document_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_document_lines" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "asset_entry_id" TEXT,
    "asset_unit_id" TEXT,
    "asset_item_id" TEXT,
    "location_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_label" TEXT NOT NULL,
    "line_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensitive_action_approvals" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_table" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "requested_by" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "metadata" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitive_action_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_table" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_external_auth_id_idx" ON "users"("external_auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "locations_name_idx" ON "locations"("name");

-- CreateIndex
CREATE INDEX "locations_parent_id_idx" ON "locations"("parent_id");

-- CreateIndex
CREATE INDEX "locations_status_idx" ON "locations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_code_key" ON "asset_categories"("code");

-- CreateIndex
CREATE INDEX "asset_categories_name_idx" ON "asset_categories"("name");

-- CreateIndex
CREATE INDEX "asset_categories_parent_id_idx" ON "asset_categories"("parent_id");

-- CreateIndex
CREATE INDEX "asset_categories_status_idx" ON "asset_categories"("status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_items_code_key" ON "asset_items"("code");

-- CreateIndex
CREATE INDEX "asset_items_name_idx" ON "asset_items"("name");

-- CreateIndex
CREATE INDEX "asset_items_category_id_idx" ON "asset_items"("category_id");

-- CreateIndex
CREATE INDEX "asset_items_supplier_id_idx" ON "asset_items"("supplier_id");

-- CreateIndex
CREATE INDEX "asset_items_status_idx" ON "asset_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_entries_entry_number_key" ON "asset_entries"("entry_number");

-- CreateIndex
CREATE INDEX "asset_entries_entry_number_idx" ON "asset_entries"("entry_number");

-- CreateIndex
CREATE INDEX "asset_entries_asset_item_id_idx" ON "asset_entries"("asset_item_id");

-- CreateIndex
CREATE INDEX "asset_entries_location_id_idx" ON "asset_entries"("location_id");

-- CreateIndex
CREATE INDEX "asset_entries_supplier_id_idx" ON "asset_entries"("supplier_id");

-- CreateIndex
CREATE INDEX "asset_entries_entry_status_idx" ON "asset_entries"("entry_status");

-- CreateIndex
CREATE INDEX "asset_entries_entry_date_idx" ON "asset_entries"("entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "asset_units_asset_code_key" ON "asset_units"("asset_code");

-- CreateIndex
CREATE INDEX "asset_units_asset_code_idx" ON "asset_units"("asset_code");

-- CreateIndex
CREATE INDEX "asset_units_asset_item_id_idx" ON "asset_units"("asset_item_id");

-- CreateIndex
CREATE INDEX "asset_units_location_id_idx" ON "asset_units"("location_id");

-- CreateIndex
CREATE INDEX "asset_units_supplier_id_idx" ON "asset_units"("supplier_id");

-- CreateIndex
CREATE INDEX "asset_units_entry_id_idx" ON "asset_units"("entry_id");

-- CreateIndex
CREATE INDEX "asset_units_condition_idx" ON "asset_units"("condition");

-- CreateIndex
CREATE INDEX "asset_units_status_idx" ON "asset_units"("status");

-- CreateIndex
CREATE INDEX "asset_units_information_status_idx" ON "asset_units"("information_status");

-- CreateIndex
CREATE INDEX "asset_files_asset_unit_id_idx" ON "asset_files"("asset_unit_id");

-- CreateIndex
CREATE INDEX "asset_files_file_type_idx" ON "asset_files"("file_type");

-- CreateIndex
CREATE INDEX "asset_files_is_primary_idx" ON "asset_files"("is_primary");

-- CreateIndex
CREATE INDEX "asset_files_deleted_at_idx" ON "asset_files"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "asset_movements_movement_number_key" ON "asset_movements"("movement_number");

-- CreateIndex
CREATE INDEX "asset_movements_movement_number_idx" ON "asset_movements"("movement_number");

-- CreateIndex
CREATE INDEX "asset_movements_movement_type_idx" ON "asset_movements"("movement_type");

-- CreateIndex
CREATE INDEX "asset_movements_movement_status_idx" ON "asset_movements"("movement_status");

-- CreateIndex
CREATE INDEX "asset_movements_movement_date_idx" ON "asset_movements"("movement_date");

-- CreateIndex
CREATE INDEX "asset_movements_related_movement_id_idx" ON "asset_movements"("related_movement_id");

-- CreateIndex
CREATE INDEX "asset_movement_lines_movement_id_idx" ON "asset_movement_lines"("movement_id");

-- CreateIndex
CREATE INDEX "asset_movement_lines_asset_unit_id_idx" ON "asset_movement_lines"("asset_unit_id");

-- CreateIndex
CREATE INDEX "asset_movement_lines_from_location_id_idx" ON "asset_movement_lines"("from_location_id");

-- CreateIndex
CREATE INDEX "asset_movement_lines_to_location_id_idx" ON "asset_movement_lines"("to_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_movement_lines_movement_id_asset_unit_id_key" ON "asset_movement_lines"("movement_id", "asset_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_documents_document_number_key" ON "asset_documents"("document_number");

-- CreateIndex
CREATE INDEX "asset_documents_document_number_idx" ON "asset_documents"("document_number");

-- CreateIndex
CREATE INDEX "asset_documents_document_type_idx" ON "asset_documents"("document_type");

-- CreateIndex
CREATE INDEX "asset_documents_status_idx" ON "asset_documents"("status");

-- CreateIndex
CREATE INDEX "asset_documents_document_date_idx" ON "asset_documents"("document_date");

-- CreateIndex
CREATE INDEX "asset_document_entries_document_id_idx" ON "asset_document_entries"("document_id");

-- CreateIndex
CREATE INDEX "asset_document_entries_asset_entry_id_idx" ON "asset_document_entries"("asset_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_document_entries_document_id_asset_entry_id_key" ON "asset_document_entries"("document_id", "asset_entry_id");

-- CreateIndex
CREATE INDEX "asset_document_lines_document_id_idx" ON "asset_document_lines"("document_id");

-- CreateIndex
CREATE INDEX "asset_document_lines_asset_entry_id_idx" ON "asset_document_lines"("asset_entry_id");

-- CreateIndex
CREATE INDEX "asset_document_lines_asset_unit_id_idx" ON "asset_document_lines"("asset_unit_id");

-- CreateIndex
CREATE INDEX "asset_document_lines_asset_item_id_idx" ON "asset_document_lines"("asset_item_id");

-- CreateIndex
CREATE INDEX "asset_document_lines_location_id_idx" ON "asset_document_lines"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_document_lines_document_id_asset_unit_id_key" ON "asset_document_lines"("document_id", "asset_unit_id");

-- CreateIndex
CREATE INDEX "sensitive_action_approvals_action_idx" ON "sensitive_action_approvals"("action");

-- CreateIndex
CREATE INDEX "sensitive_action_approvals_entity_table_entity_id_idx" ON "sensitive_action_approvals"("entity_table", "entity_id");

-- CreateIndex
CREATE INDEX "sensitive_action_approvals_requested_by_idx" ON "sensitive_action_approvals"("requested_by");

-- CreateIndex
CREATE INDEX "sensitive_action_approvals_approved_by_idx" ON "sensitive_action_approvals"("approved_by");

-- CreateIndex
CREATE INDEX "audit_logs_entity_table_entity_id_idx" ON "audit_logs"("entity_table", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "asset_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_items" ADD CONSTRAINT "asset_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_items" ADD CONSTRAINT "asset_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_asset_item_id_fkey" FOREIGN KEY ("asset_item_id") REFERENCES "asset_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_entries" ADD CONSTRAINT "asset_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_units" ADD CONSTRAINT "asset_units_asset_item_id_fkey" FOREIGN KEY ("asset_item_id") REFERENCES "asset_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_units" ADD CONSTRAINT "asset_units_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_units" ADD CONSTRAINT "asset_units_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_units" ADD CONSTRAINT "asset_units_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "asset_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_files" ADD CONSTRAINT "asset_files_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_related_movement_id_fkey" FOREIGN KEY ("related_movement_id") REFERENCES "asset_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement_lines" ADD CONSTRAINT "asset_movement_lines_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "asset_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement_lines" ADD CONSTRAINT "asset_movement_lines_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement_lines" ADD CONSTRAINT "asset_movement_lines_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_movement_lines" ADD CONSTRAINT "asset_movement_lines_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_entries" ADD CONSTRAINT "asset_document_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "asset_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_entries" ADD CONSTRAINT "asset_document_entries_asset_entry_id_fkey" FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_lines" ADD CONSTRAINT "asset_document_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "asset_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_lines" ADD CONSTRAINT "asset_document_lines_asset_entry_id_fkey" FOREIGN KEY ("asset_entry_id") REFERENCES "asset_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_lines" ADD CONSTRAINT "asset_document_lines_asset_unit_id_fkey" FOREIGN KEY ("asset_unit_id") REFERENCES "asset_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_lines" ADD CONSTRAINT "asset_document_lines_asset_item_id_fkey" FOREIGN KEY ("asset_item_id") REFERENCES "asset_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_document_lines" ADD CONSTRAINT "asset_document_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL-only invariant: at most one active primary photo per asset.
CREATE UNIQUE INDEX "asset_files_one_active_primary_per_asset_idx"
ON "asset_files" ("asset_unit_id")
WHERE "is_primary" = true AND "deleted_at" IS NULL;

-- A primary file must be an image.
ALTER TABLE "asset_files"
ADD CONSTRAINT "asset_files_primary_must_be_image_check"
CHECK (NOT "is_primary" OR "mime_type" LIKE 'image/%');
