-- AlterTable: add dataType to inbox_messages
ALTER TABLE "inbox_messages" ADD COLUMN "data_type" TEXT NOT NULL DEFAULT 'GSTR1';

-- CreateTable: purchase_data
CREATE TABLE "purchase_data" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "supplier_gstin" TEXT NOT NULL,
    "supplier_name" TEXT,
    "invoice_value" DECIMAL(15,2) NOT NULL,
    "taxable_value" DECIMAL(15,2) NOT NULL,
    "igst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cess_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "hsn_code" TEXT,
    "validation_status" "ValidationStatusEnum" NOT NULL DEFAULT 'PENDING',
    "row_number" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable: purchase_validation_errors
CREATE TABLE "purchase_validation_errors" (
    "id" TEXT NOT NULL,
    "purchase_data_id" TEXT NOT NULL,
    "error_type" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_validation_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable: gstr2b_entries
CREATE TABLE "gstr2b_entries" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "supplier_gstin" TEXT NOT NULL,
    "supplier_name" TEXT,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TEXT NOT NULL,
    "invoice_value" DECIMAL(15,2) NOT NULL,
    "taxable_value" DECIMAL(15,2) NOT NULL,
    "igst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cgst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sgst_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cess_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "itc_available" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "match_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gstr2b_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reconciliation_reports
CREATE TABLE "reconciliation_reports" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "total_purchase" INTEGER NOT NULL,
    "total_gstr2b" INTEGER NOT NULL,
    "matched" INTEGER NOT NULL,
    "mismatched" INTEGER NOT NULL,
    "missing_in_purchase" INTEGER NOT NULL,
    "extra_in_purchase" INTEGER NOT NULL,
    "total_itc_available" DECIMAL(15,2) NOT NULL,
    "total_itc_mismatch" DECIMAL(15,2) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable: gstr3b_summaries
CREATE TABLE "gstr3b_summaries" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "outward_taxable_value" DECIMAL(15,2) NOT NULL,
    "outward_igst" DECIMAL(15,2) NOT NULL,
    "outward_cgst" DECIMAL(15,2) NOT NULL,
    "outward_sgst" DECIMAL(15,2) NOT NULL,
    "itc_igst" DECIMAL(15,2) NOT NULL,
    "itc_cgst" DECIMAL(15,2) NOT NULL,
    "itc_sgst" DECIMAL(15,2) NOT NULL,
    "net_igst" DECIMAL(15,2) NOT NULL,
    "net_cgst" DECIMAL(15,2) NOT NULL,
    "net_sgst" DECIMAL(15,2) NOT NULL,
    "classification" TEXT NOT NULL,
    "json_generated" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gstr3b_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraints
CREATE UNIQUE INDEX "purchase_data_client_id_month_year_supplier_gstin_invoice_num_key" ON "purchase_data"("client_id", "month", "year", "supplier_gstin", "invoice_number");
CREATE UNIQUE INDEX "gstr2b_entries_client_id_month_year_supplier_gstin_invoice_num_key" ON "gstr2b_entries"("client_id", "month", "year", "supplier_gstin", "invoice_number");
CREATE UNIQUE INDEX "reconciliation_reports_client_id_month_year_key" ON "reconciliation_reports"("client_id", "month", "year");
CREATE UNIQUE INDEX "gstr3b_summaries_client_id_month_year_key" ON "gstr3b_summaries"("client_id", "month", "year");

-- AddForeignKey
ALTER TABLE "purchase_data" ADD CONSTRAINT "purchase_data_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_validation_errors" ADD CONSTRAINT "purchase_validation_errors_purchase_data_id_fkey" FOREIGN KEY ("purchase_data_id") REFERENCES "purchase_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gstr2b_entries" ADD CONSTRAINT "gstr2b_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_reports" ADD CONSTRAINT "reconciliation_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gstr3b_summaries" ADD CONSTRAINT "gstr3b_summaries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
