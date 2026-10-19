-- CreateIndex
CREATE INDEX "consents_users_id_idx" ON "consents"("users_id");

-- CreateIndex
CREATE INDEX "consents_policies_id_idx" ON "consents"("policies_id");

-- CreateIndex
CREATE INDEX "ip_assignments_ip_id_idx" ON "ip_assignments"("ip_id");

-- CreateIndex
CREATE INDEX "orders_users_id_idx" ON "orders"("users_id");

-- CreateIndex
CREATE INDEX "orders_packages_id_idx" ON "orders"("packages_id");

-- CreateIndex
CREATE INDEX "orders_promotions_id_idx" ON "orders"("promotions_id");

-- CreateIndex
CREATE INDEX "orders_renewal_vps_id_idx" ON "orders"("renewal_vps_id");

-- CreateIndex
CREATE INDEX "packages_os_id_idx" ON "packages"("os_id");

-- CreateIndex
CREATE INDEX "packages_vm_id_idx" ON "packages"("vm_id");

-- CreateIndex
CREATE INDEX "system_configs_updated_by_idx" ON "system_configs"("updated_by");

-- CreateIndex
CREATE INDEX "transactions_order_id_idx" ON "transactions"("order_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "vps_expired_at_idx" ON "vps"("expired_at");

-- CreateIndex
CREATE INDEX "vps_status_idx" ON "vps"("status");

-- CreateIndex
CREATE INDEX "vps_deleted_at_idx" ON "vps"("deleted_at");

-- CreateIndex
CREATE INDEX "vps_expired_at_status_deleted_at_idx" ON "vps"("expired_at", "status", "deleted_at");
