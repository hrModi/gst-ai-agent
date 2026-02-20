-- CreateTable
CREATE TABLE "reminder_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reminder_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_templates_tenant_id_reminder_type_channel_key" ON "reminder_templates"("tenant_id", "reminder_type", "channel");

-- AddForeignKey
ALTER TABLE "reminder_templates" ADD CONSTRAINT "reminder_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
