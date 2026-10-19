-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "max_uses" INTEGER,
ADD COLUMN     "max_uses_per_user" INTEGER,
ADD COLUMN     "used_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vps" ADD COLUMN     "auto_renew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locked_promo_id" INTEGER;

-- CreateTable
CREATE TABLE "promo_usages" (
    "id" SERIAL NOT NULL,
    "promotion_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_usages_order_id_key" ON "promo_usages"("order_id");

-- CreateIndex
CREATE INDEX "promo_usages_promotion_id_user_id_idx" ON "promo_usages"("promotion_id", "user_id");

-- CreateIndex
CREATE INDEX "promo_usages_user_id_idx" ON "promo_usages"("user_id");

-- CreateIndex
CREATE INDEX "vps_locked_promo_id_idx" ON "vps"("locked_promo_id");

-- CreateIndex
CREATE INDEX "vps_auto_renew_expired_at_deleted_at_idx" ON "vps"("auto_renew", "expired_at", "deleted_at");

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vps" ADD CONSTRAINT "vps_locked_promo_id_fkey" FOREIGN KEY ("locked_promo_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
