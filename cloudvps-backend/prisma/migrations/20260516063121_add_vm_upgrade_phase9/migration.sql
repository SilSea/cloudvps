-- CreateEnum
CREATE TYPE "UpgradeType" AS ENUM ('PACKAGE', 'CUSTOM');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'UPGRADE';

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'VPS_UPGRADE';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "upgrade_vps_id" INTEGER;

-- AlterTable
ALTER TABLE "vps" ADD COLUMN     "current_cores" INTEGER,
ADD COLUMN     "current_disk_gb" INTEGER,
ADD COLUMN     "current_memory_gib" INTEGER,
ADD COLUMN     "monthly_price" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "vps_upgrade_logs" (
    "id" SERIAL NOT NULL,
    "vps_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "upgrade_type" "UpgradeType" NOT NULL,
    "before_cores" INTEGER NOT NULL,
    "before_memory_gib" INTEGER NOT NULL,
    "before_disk_gb" INTEGER NOT NULL,
    "before_monthly_price" DOUBLE PRECISION NOT NULL,
    "after_cores" INTEGER NOT NULL,
    "after_memory_gib" INTEGER NOT NULL,
    "after_disk_gb" INTEGER NOT NULL,
    "after_monthly_price" DOUBLE PRECISION NOT NULL,
    "amount_charged" INTEGER NOT NULL,
    "applied_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vps_upgrade_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vps_upgrade_logs_order_id_key" ON "vps_upgrade_logs"("order_id");

-- CreateIndex
CREATE INDEX "vps_upgrade_logs_vps_id_idx" ON "vps_upgrade_logs"("vps_id");

-- CreateIndex
CREATE INDEX "vps_upgrade_logs_created_at_idx" ON "vps_upgrade_logs"("created_at");

-- CreateIndex
CREATE INDEX "orders_upgrade_vps_id_idx" ON "orders"("upgrade_vps_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_upgrade_vps_id_fkey" FOREIGN KEY ("upgrade_vps_id") REFERENCES "vps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vps_upgrade_logs" ADD CONSTRAINT "vps_upgrade_logs_vps_id_fkey" FOREIGN KEY ("vps_id") REFERENCES "vps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vps_upgrade_logs" ADD CONSTRAINT "vps_upgrade_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
