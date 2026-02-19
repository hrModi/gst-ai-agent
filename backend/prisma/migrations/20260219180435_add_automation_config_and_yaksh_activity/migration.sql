-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "automation_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "data_email_subject" TEXT,
ADD COLUMN     "gstr1_due_day" INTEGER NOT NULL DEFAULT 11,
ADD COLUMN     "gstr3b_due_day" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "notify_email" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_whatsapp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminder_days_before" INTEGER[] DEFAULT ARRAY[7, 3, 1]::INTEGER[];

-- AlterTable
ALTER TABLE "filing_status" ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "stage_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "yaksh_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT,
    "activity_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yaksh_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "yaksh_activities_tenant_id_created_at_idx" ON "yaksh_activities"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "yaksh_activities_client_id_idx" ON "yaksh_activities"("client_id");
