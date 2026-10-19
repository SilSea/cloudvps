-- CreateEnum
CREATE TYPE "BroadcastType" AS ENUM ('MAINTENANCE', 'EMERGENCY', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "BroadcastTarget" AS ENUM ('ALL', 'ACTIVE_VPS', 'EXPIRING_SOON');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BROADCAST';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'EMAIL_BROADCAST';

-- CreateTable
CREATE TABLE "email_broadcasts" (
    "id" SERIAL NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "type" "BroadcastType" NOT NULL,
    "target" "BroadcastTarget" NOT NULL,
    "sent_by" INTEGER NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_broadcasts_sent_by_idx" ON "email_broadcasts"("sent_by");

-- CreateIndex
CREATE INDEX "email_broadcasts_created_at_idx" ON "email_broadcasts"("created_at");

-- AddForeignKey
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
