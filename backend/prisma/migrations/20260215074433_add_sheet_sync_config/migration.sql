-- CreateTable
CREATE TABLE "sheet_sync_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "spreadsheet_url" TEXT NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "sheet_name" TEXT NOT NULL DEFAULT 'Sheet1',
    "last_synced_at" TIMESTAMP(3),
    "last_sync_status" TEXT,
    "last_sync_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sheet_sync_configs_tenant_id_key" ON "sheet_sync_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "sheet_sync_configs" ADD CONSTRAINT "sheet_sync_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
