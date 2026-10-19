-- CreateEnum
CREATE TYPE "PoliciesType" AS ENUM ('PDPA', 'TERMSERVICE');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('DISCOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PAID', 'PENDING', 'CANCEL', 'EXPIRE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('SLIP', 'PROMPTPAY', 'TRUEMONEY');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('SUCCESSFUL', 'PENDING', 'REJECT');

-- CreateEnum
CREATE TYPE "IpType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'DISCORD', 'FACEBOOK');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "role_name" VARCHAR(50) NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password" VARCHAR(60),
    "role_id" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "is_verify" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users_info" (
    "user_id" INTEGER NOT NULL,
    "first_name" VARCHAR(150) NOT NULL,
    "last_name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(10) NOT NULL,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "address3" VARCHAR(100) NOT NULL,
    "address4" VARCHAR(100) NOT NULL,
    "address5" VARCHAR(10) NOT NULL,
    "address6" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "users_info_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" SERIAL NOT NULL,
    "policie_title" VARCHAR(150) NOT NULL,
    "policies_detail" TEXT NOT NULL,
    "policies_type" "PoliciesType" NOT NULL,
    "version" VARCHAR(10) NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" SERIAL NOT NULL,
    "users_id" INTEGER NOT NULL,
    "policies_id" INTEGER NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "os" (
    "id" SERIAL NOT NULL,
    "os_name" VARCHAR(50) NOT NULL,
    "os_version" VARCHAR(50) NOT NULL,
    "vmid" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "os_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vm" (
    "id" SERIAL NOT NULL,
    "core" INTEGER NOT NULL,
    "memory" VARCHAR(10) NOT NULL,
    "size" VARCHAR(10) NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "vm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "period" INTEGER NOT NULL,
    "os_id" INTEGER NOT NULL,
    "vm_id" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "code_name" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "ref_no" VARCHAR(100) NOT NULL,
    "amount" INTEGER NOT NULL,
    "users_id" INTEGER NOT NULL,
    "promotions_id" INTEGER,
    "packages_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "provider_ref_id" VARCHAR(100) NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "slip_url" TEXT,
    "order_id" INTEGER NOT NULL,
    "status" "TxStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temp_vps" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150),
    "order_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temp_vps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vps" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "vmid" INTEGER NOT NULL,
    "ip_assignments_id" INTEGER NOT NULL,
    "orders_id" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_assignments" (
    "id" SERIAL NOT NULL,
    "ip_id" INTEGER NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ip_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_oauth_providers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_uid" VARCHAR(200) NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "user_oauth_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_pools" (
    "id" SERIAL NOT NULL,
    "ip" INET NOT NULL,
    "type" "IpType" NOT NULL,
    "status" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ip_pools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_name_key" ON "promotions"("code_name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_ref_no_key" ON "orders"("ref_no");

-- CreateIndex
CREATE UNIQUE INDEX "temp_vps_order_id_key" ON "temp_vps"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "vps_ip_assignments_id_key" ON "vps"("ip_assignments_id");

-- CreateIndex
CREATE UNIQUE INDEX "vps_orders_id_key" ON "vps"("orders_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_oauth_providers_provider_provider_uid_key" ON "user_oauth_providers"("provider", "provider_uid");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users_info" ADD CONSTRAINT "users_info_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_users_id_fkey" FOREIGN KEY ("users_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_policies_id_fkey" FOREIGN KEY ("policies_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "os"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_vm_id_fkey" FOREIGN KEY ("vm_id") REFERENCES "vm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_users_id_fkey" FOREIGN KEY ("users_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotions_id_fkey" FOREIGN KEY ("promotions_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_packages_id_fkey" FOREIGN KEY ("packages_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temp_vps" ADD CONSTRAINT "temp_vps_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vps" ADD CONSTRAINT "vps_ip_assignments_id_fkey" FOREIGN KEY ("ip_assignments_id") REFERENCES "ip_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vps" ADD CONSTRAINT "vps_orders_id_fkey" FOREIGN KEY ("orders_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_assignments" ADD CONSTRAINT "ip_assignments_ip_id_fkey" FOREIGN KEY ("ip_id") REFERENCES "ip_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_oauth_providers" ADD CONSTRAINT "user_oauth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
