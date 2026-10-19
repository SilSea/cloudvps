-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "renewal_vps_id" INTEGER;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_renewal_vps_id_fkey" FOREIGN KEY ("renewal_vps_id") REFERENCES "vps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
