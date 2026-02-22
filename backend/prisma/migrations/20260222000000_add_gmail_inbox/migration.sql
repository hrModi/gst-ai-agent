-- Add Gmail fields to SheetSyncConfig
ALTER TABLE "sheet_sync_configs"
  ADD COLUMN "gmail_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gmail_last_poll_at" TIMESTAMP(3);

-- New InboxMessage table
CREATE TABLE "inbox_messages" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "client_id"        TEXT NOT NULL,
  "gmail_message_id" TEXT NOT NULL,
  "from_email"       TEXT NOT NULL,
  "subject"          TEXT NOT NULL,
  "received_at"      TIMESTAMP(3) NOT NULL,
  "month"            INTEGER NOT NULL,
  "year"             INTEGER NOT NULL,
  "attachment_count" INTEGER NOT NULL DEFAULT 0,
  "status"           TEXT NOT NULL,
  "pipeline_stage"   TEXT,
  "error_summary"    TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inbox_messages_gmail_message_id_key" UNIQUE ("gmail_message_id")
);

ALTER TABLE "inbox_messages"
  ADD CONSTRAINT "inbox_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "inbox_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
