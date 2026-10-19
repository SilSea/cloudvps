-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('VERIFICATION', 'EXPIRY_WARNING', 'EXPIRED', 'FORCE_DELETED', 'AUTO_RENEWAL_REMINDER', 'BROADCAST_MAINTENANCE', 'BROADCAST_EMERGENCY', 'BROADCAST_ANNOUNCEMENT', 'WELCOME');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'EMAIL_TEMPLATE';

-- CreateTable
CREATE TABLE "email_templates" (
    "id" SERIAL NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body_html" TEXT NOT NULL,
    "variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_type_key" ON "email_templates"("type");

-- CreateIndex
CREATE INDEX "email_templates_updated_by_idx" ON "email_templates"("updated_by");

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
