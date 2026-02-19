-- AlterTable
ALTER TABLE "sheet_sync_configs" ADD COLUMN     "google_access_token" TEXT,
ADD COLUMN     "google_email" TEXT,
ADD COLUMN     "google_refresh_token" TEXT,
ADD COLUMN     "google_token_expiry" TIMESTAMP(3),
ALTER COLUMN "spreadsheet_url" DROP NOT NULL,
ALTER COLUMN "spreadsheet_id" DROP NOT NULL;
