-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'PACKAGE_CATEGORY';

-- AlterTable
ALTER TABLE "packages" ADD COLUMN     "category_id" INTEGER;

-- CreateTable
CREATE TABLE "package_categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "package_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "package_categories_name_key" ON "package_categories"("name");

-- CreateIndex
CREATE INDEX "packages_category_id_idx" ON "packages"("category_id");

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "package_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
