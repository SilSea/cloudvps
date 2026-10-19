-- CreateEnum
CREATE TYPE "NatProtocol" AS ENUM ('TCP', 'UDP', 'BOTH');

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "port_count" INTEGER;

-- CreateTable
CREATE TABLE "nat_allocations" (
    "id" SERIAL NOT NULL,
    "vps_id" INTEGER NOT NULL,
    "public_ip" VARCHAR(45) NOT NULL,
    "port_start" INTEGER NOT NULL,
    "port_end" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nat_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nat_port_rules" (
    "id" SERIAL NOT NULL,
    "allocation_id" INTEGER NOT NULL,
    "public_port" INTEGER NOT NULL,
    "private_port" INTEGER NOT NULL,
    "protocol" "NatProtocol" NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "mikrotik_ids" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nat_port_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nat_allocations_vps_id_key" ON "nat_allocations"("vps_id");

-- CreateIndex
CREATE INDEX "nat_allocations_public_ip_is_active_idx" ON "nat_allocations"("public_ip", "is_active");

-- CreateIndex
CREATE INDEX "nat_port_rules_allocation_id_is_active_idx" ON "nat_port_rules"("allocation_id", "is_active");

-- CreateIndex
CREATE INDEX "nat_port_rules_allocation_id_public_port_idx" ON "nat_port_rules"("allocation_id", "public_port");

-- AddForeignKey
ALTER TABLE "nat_allocations" ADD CONSTRAINT "nat_allocations_vps_id_fkey" FOREIGN KEY ("vps_id") REFERENCES "vps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nat_port_rules" ADD CONSTRAINT "nat_port_rules_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "nat_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
