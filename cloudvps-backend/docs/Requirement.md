# CloudVPS - API Specification & Security Requirements

Reference: Feature.md (Feature Summary F1–F19), Schema.md (Database Schema)

---

## 1. Authentication & RBAC (F1)

### 1.1 Functional Requirements

- REQ-1.1: The system shall support user registration via Email + Password.
- REQ-1.2: The system shall support OAuth login via Google (future).
- REQ-1.3: The system shall support OAuth login via Discord (future).
- REQ-1.4: The system shall issue a JWT access token upon successful login.
- REQ-1.5: The system shall issue a JWT refresh token for session renewal.
- REQ-1.6: The system shall enforce role-based access control with 3 roles: ADMIN, SUPPORT, USER.
- REQ-1.7: The system shall reject requests from unauthenticated users to all protected endpoints.
- REQ-1.8: The system shall reject requests from users whose role does not match the required permission for the endpoint.
- REQ-1.9: The system shall allow only ADMIN to create SUPPORT accounts.
- REQ-1.10: The system shall send a verification email upon registration.
- REQ-1.11: The system shall set is_verify to true only after the user clicks the verification link.
- REQ-1.12: The system shall block login for users with status = false (disabled accounts).

### 1.2 Security Requirements

- SEC-1.1: Passwords shall be hashed using bcrypt with a minimum cost factor of 10.
- SEC-1.2: JWT access tokens shall expire within 15 minutes.
- SEC-1.3: JWT refresh tokens shall expire within 7 days and be stored securely (httpOnly cookie or encrypted storage).
- SEC-1.4: JWT secrets shall be stored in environment variables, never hardcoded.
- SEC-1.5: Failed login attempts shall be rate-limited to 5 attempts per 15 minutes per IP.
- SEC-1.6: The system shall implement CORS with a strict origin whitelist.
- SEC-1.7: All API responses shall never expose password hashes or internal error stack traces.
- SEC-1.8: OAuth state parameter shall be validated to prevent CSRF attacks.

### 1.3 API Endpoints

- POST /api/auth/register — Register a new user account (Public)
- POST /api/auth/login — Login with email + password (Public)
- POST /api/auth/refresh — Refresh access token using refresh token (Public)
- POST /api/auth/logout — Invalidate refresh token (Authenticated)
- GET /api/auth/verify/:token — Verify email address (Public)
- GET /api/auth/me — Get current user profile (Authenticated)

---

## 2. Account Management (F2)

### 2.1 Functional Requirements

- REQ-2.1: Users shall be able to view their own profile (users + users_info).
- REQ-2.2: Users shall be able to update their personal info (first_name, last_name, phone, address fields).
- REQ-2.3: Users shall be able to change their email (requires re-verification).
- REQ-2.4: Users shall be able to change their password (requires current password confirmation).
- REQ-2.5: Admin shall be able to list all user accounts with pagination and filters.
- REQ-2.6: Admin shall be able to disable/enable user accounts by toggling status.
- REQ-2.7: Admin shall be able to change a user's role.
- REQ-2.8: Support shall be able to view and edit user accounts (except role changes).

### 2.2 Security Requirements

- SEC-2.1: Users shall only access their own profile data. Cross-user access shall be denied.
- SEC-2.2: Password change shall require the current password for verification.
- SEC-2.3: Email change shall invalidate the current session and require re-verification.
- SEC-2.4: All user input shall be validated and sanitized to prevent XSS and SQL injection.
- SEC-2.5: Admin/Support endpoints shall enforce role checks via RBAC middleware.

### 2.3 API Endpoints

- GET /api/users/me — Get own profile with users_info (USER, SUPPORT, ADMIN)
- PUT /api/users/me — Update own personal info (USER, SUPPORT, ADMIN)
- PUT /api/users/me/password — Change own password (USER, SUPPORT, ADMIN)
- PUT /api/users/me/email — Change own email (USER, SUPPORT, ADMIN)
- GET /api/users — List all users with pagination (ADMIN, SUPPORT)
- GET /api/users/:id — Get a specific user profile (ADMIN, SUPPORT)
- PUT /api/users/:id — Update a user account (ADMIN, SUPPORT)
- PATCH /api/users/:id/status — Toggle user active status (ADMIN)
- PATCH /api/users/:id/role — Change user role (ADMIN)
- POST /api/users — Create user with auto-generated password (ADMIN, SUPPORT) *(Phase 11 — see §14)*

---

## 3. Package Management (F3)

### 3.1 Functional Requirements

- REQ-3.1: Admin shall be able to create OS templates (os_name, os_version, vmid).
- REQ-3.2: Admin shall be able to create VM specs (core, memory, size).
- REQ-3.3: Admin shall be able to create packages by combining an OS template + VM spec + price + period.
- REQ-3.4: Admin shall be able to update and toggle status of packages, OS templates, and VM specs.
- REQ-3.5: Users shall be able to browse all active packages.
- REQ-3.6: Users shall be able to view package details including OS, CPU, RAM, Disk, price, and period.
- REQ-3.7: The system shall not allow deletion of packages that are referenced by existing orders.
- REQ-3.8: Packages shall optionally reference a package category via `category_id` (nullable FK).
- REQ-3.9: Users shall be able to filter active packages by category using the `?category_id=N` query parameter.

### 3.2 Security Requirements

- SEC-3.1: Only ADMIN shall be able to create, update, or delete packages, OS templates, and VM specs.
- SEC-3.2: Package price and period values shall be validated as positive numbers.
- SEC-3.3: Proxmox vmid references in OS templates shall be validated against the Proxmox API.

### 3.3 API Endpoints

- GET /api/packages — List all active packages (Public, optional `?category_id=N`; includes `available: boolean` per package — see §18)
- GET /api/packages/:id — Get package details (Public)
- POST /api/packages — Create a new package (ADMIN)
- PUT /api/packages/:id — Update a package (ADMIN)
- PATCH /api/packages/:id/status — Toggle package status (ADMIN)
- GET /api/packages/categories — List active categories (Public)
- GET /api/packages/categories/all — List all categories incl. inactive (ADMIN)
- POST /api/packages/categories — Create a category (ADMIN)
- PUT /api/packages/categories/:id — Update a category (ADMIN)
- PATCH /api/packages/categories/:id/status — Toggle category status (ADMIN)
- GET /api/packages/os — List OS templates (ADMIN)
- POST /api/packages/os — Create OS template (ADMIN)
- PUT /api/packages/os/:id — Update OS template (ADMIN)
- GET /api/packages/vm — List VM specs (ADMIN)
- POST /api/packages/vm — Create VM spec (ADMIN)
- PUT /api/packages/vm/:id — Update VM spec (ADMIN)

*(Note: packages optionally include `port_count Int?` — null = Public IP, number = Private IP + NAT port block; and `category_id Int?` — optional FK to package_categories.)*

---

## 4. PDPA & Terms of Service (F4)

### 4.1 Functional Requirements

- REQ-4.1: Admin shall be able to create new policy versions (PDPA or TERMSERVICE).
- REQ-4.2: Admin shall be able to update policy content and toggle status.
- REQ-4.3: The system shall present the latest active policies to users during registration.
- REQ-4.4: The system shall require users to accept all active policies before completing registration.
- REQ-4.5: The system shall check on login if a newer policy version exists and prompt re-acceptance.
- REQ-4.6: The system shall record each consent with users_id, policies_id, and accepted_at.
- REQ-4.7: Users shall be able to view their consent history.

### 4.2 Security Requirements

- SEC-4.1: Only ADMIN shall be able to create or modify policies.
- SEC-4.2: Consent records shall be immutable (no update or delete allowed).
- SEC-4.3: The system shall log all consent events for PDPA compliance auditing.
- SEC-4.4: Policy content shall be sanitized to prevent stored XSS.

### 4.3 API Endpoints

- GET /api/policies/active — Get all active policies (Public)
- GET /api/policies — List all policies with versions (ADMIN)
- POST /api/policies — Create a new policy version (ADMIN)
- PUT /api/policies/:id — Update policy content (ADMIN)
- PATCH /api/policies/:id/status — Toggle policy status (ADMIN)
- POST /api/policies/consents — Accept a policy (USER, SUPPORT, ADMIN)
- GET /api/policies/consents/me — Get own consent history (USER, SUPPORT, ADMIN)

---

## 5. VPS Management (F5)

### 5.1 Functional Requirements

- REQ-5.1: The system shall create a temp_vps record when an order is paid.
- REQ-5.2: The system shall call Proxmox API to clone a VM template with the package specs (CPU, RAM, Disk).
- REQ-5.3: The system shall allocate an available IP from ip_pools and create an ip_assignments record.
- REQ-5.4: Upon successful VM creation in Proxmox, the system shall move the record from temp_vps to vps.
- REQ-5.5: Users shall be able to Start, Stop, and Reboot their own VPS via Proxmox API.
- REQ-5.6: Users shall be able to view their VPS details (name, vmid, IP, status, expiry).
- REQ-5.7: Admin shall be able to view and monitor all VPS instances.
- REQ-5.8: Support shall be able to configure VMs, assign packages, and manage provisioning.
- REQ-5.9: The system shall automatically expire VPS instances when vps.expired_at is reached.
- REQ-5.10: The system shall soft-delete VPS instances by setting deleted_at instead of hard delete.
- REQ-5.11: For private IP VPS, the system shall configure port forwarding (NAT) with SSH and RDP reserved ports.
- REQ-5.12: Admin shall be able to manage the IP pool (view allocated/available IPs).
- REQ-5.13: Users, Admin, and Support shall be able to retrieve live VM metrics (status, cpu%, mem, uptime) via `GET /api/vps/:id/status` *(implemented in Phase 12 — see §16)*.
- REQ-5.14: Users shall be able to force-reset their VPS via `POST /api/vps/:id/reset` (ACPI hard reset) *(implemented in Phase 12 — see §16)*.

### 5.2 Security Requirements

- SEC-5.1: Users shall only be able to control their own VPS instances. Cross-user VPS access shall be denied.
- SEC-5.2: Proxmox API credentials shall be stored in environment variables, never exposed to the client.
- SEC-5.3: VPS provisioning requests shall be idempotent to prevent duplicate VM creation.
- SEC-5.4: The system shall validate that the IP being assigned is not already allocated to another active VPS.
- SEC-5.5: VPS console access shall require an authenticated websocket connection with ownership verification *(implemented in Phase 12 — see §16)*.
- SEC-5.6: Port forwarding rules shall be scoped to the assigned port range only. Users shall not be able to access ports outside their range.

### 5.3 API Endpoints

- GET /api/vps — List own VPS instances (USER) / List all VPS instances (ADMIN, SUPPORT)
- GET /api/vps/:id — Get VPS details (Owner, ADMIN, SUPPORT)
- GET /api/vps/queue — View pending/failed provisioning queue (ADMIN, SUPPORT)
- POST /api/vps/provision/:orderId — Manual retry provisioning (ADMIN, SUPPORT)
- POST /api/vps/:id/start — Start a VPS (Owner, ADMIN, SUPPORT)
- POST /api/vps/:id/stop — Stop a VPS (Owner, ADMIN, SUPPORT)
- POST /api/vps/:id/reboot — Reboot a VPS (Owner, ADMIN, SUPPORT)
- POST /api/vps/:id/reset — Force reset VM (Owner, ADMIN) *(Phase 12 — see §16)*
- POST /api/vps/:id/renew — Manually renew a VPS (Owner, ADMIN, SUPPORT)
- PATCH /api/vps/:id/auto-renew — Toggle VPS auto-renew setting (Owner)
- DELETE /api/vps/:id — Force delete VPS immediately (ADMIN)
- GET /api/vps/:id/status — Get live VPS resource usage from Proxmox (Owner, ADMIN, SUPPORT) *(Phase 12 — see §16)*
- GET /api/ip-pools — List all IPs and their allocation status (ADMIN)
- POST /api/ip-pools — Add single IP address to pool (ADMIN)
- POST /api/ip-pools/range — Bulk add IP range to pool, max 256 IPs (ADMIN)
- PATCH /api/ip-pools/:id — Update IP pool entry (ADMIN)
- PATCH /api/ip-pools/:id/status — Toggle IP pool status (ADMIN)

---

## 6. Orders & Payment (F6)

### 6.1 Functional Requirements

- REQ-6.1: Users shall be able to create an order by selecting a package (and optionally a promotion code).
- REQ-6.2: The system shall generate a unique ref_no for each order.
- REQ-6.3: The system shall calculate the final amount after applying any valid promotion discount.
- REQ-6.4: New orders shall default to status PENDING.
- REQ-6.5: The system shall support 3 payment methods: TRUEMONEY (auto-verify via API), SLIP (auto-verify via SlipOK), PROMPTPAY (manual verify by Admin/Support).
- REQ-6.6: For SLIP payments, the system shall accept a slip image via multipart/form-data (`slip_file: File`, ≤5MB, image/jpeg|png|webp|gif), save it to local disk, and verify it via the SlipOK API. `payment.slip_mode = BASE64` is an alternate config mode — see SEC-6.5.
- REQ-6.7: For TRUEMONEY payments, the system shall verify the Angpao voucher via the Truemoney API.
- REQ-6.8: For PROMPTPAY payments, the user may optionally attach a slip image (`slip_file`) as proof; Admin/Support shall manually approve or reject the transaction.
- REQ-6.9: When a transaction is marked SUCCESSFUL, the order status shall transition to PAID.
- REQ-6.10: When an order is PAID, the system shall trigger VPS provisioning (create temp_vps).
- REQ-6.11: Admin/Support shall be able to view all orders and transactions.
- REQ-6.12: Users shall be able to view their own order and transaction history.
- REQ-6.13: The system shall auto-expire orders that exceed their expired_at timestamp.
- REQ-6.14: Admin shall be able to create, update, and manage promotion codes with DISCOUNT or PERCENT type and expiry date.
- REQ-6.15: Promotion codes shall support optional `max_uses` (global usage cap) and `max_uses_per_user` (per-user cap); both nullable (null = unlimited). Admin can set or clear these via POST/PUT API.
- REQ-6.16: Order creation shall be blocked with `INSUFFICIENT_RESOURCES` (409) if the Proxmox node lacks capacity for the package, unless ADMIN passes `force: true` — see §18.

### 6.2 Security Requirements

- SEC-6.1: Users shall only view their own orders and transactions. Cross-user access shall be denied.
- SEC-6.2: Payment verification callbacks (SlipOK, Truemoney) shall validate the request signature or API key.
- SEC-6.3: Promotion codes shall be validated for expiry, status, and type before applying discounts.
- SEC-6.4: The system shall prevent double-payment by checking if the order already has a SUCCESSFUL transaction.
- SEC-6.5: Slip upload mode is configurable via `payment.slip_mode` system config. **FILE mode** (default): multipart file upload — size ≤5MB, MIME must be image/jpeg|png|webp|gif, stored on local disk, URL path stored in DB. **BASE64 mode**: base64 string in form field — size approximated from string length (≤5MB decoded), stored as-is in DB. Both modes validate size at controller layer.
- SEC-6.6: Order amount shall be recalculated server-side. Client-submitted amounts shall never be trusted.
- SEC-6.7: Only ADMIN/SUPPORT shall be able to approve or reject PROMPTPAY transactions.

### 6.3 API Endpoints

- POST /api/orders — Create a new order (USER); ADMIN may pass optional `force: true` to bypass capacity check (§18)
- GET /api/orders — List own orders (USER) / List all orders (ADMIN, SUPPORT)
- GET /api/orders/:id — Get order details (Owner, ADMIN, SUPPORT)
- PATCH /api/orders/:id/cancel — Cancel a pending order (Owner, ADMIN)
- POST /api/transactions — Submit a payment for an order (USER) — `multipart/form-data`
- GET /api/transactions — List own transactions (USER) / List all transactions (ADMIN, SUPPORT)
- PATCH /api/transactions/:id/approve — Approve a PROMPTPAY transaction (ADMIN, SUPPORT)
- PATCH /api/transactions/:id/reject — Reject a PROMPTPAY transaction (ADMIN, SUPPORT)
- POST /api/promotions — Create a promotion code (ADMIN)
- GET /api/promotions — List all promotions (ADMIN)
- PUT /api/promotions/:id — Update a promotion (ADMIN)
- PATCH /api/promotions/:id/status — Toggle promotion status (ADMIN)
- POST /api/promotions/validate — Validate a promo code (USER)

---

## 7. Support System (F7)

### 7.1 Functional Requirements

- REQ-7.1: Users shall be able to contact support via Facebook Fanpage (external — no in-app ticket system for this channel).
- REQ-7.2: The system shall provide a link to the Facebook Fanpage on the support page.

> Note: F7 (external Facebook contact) is distinct from F17 (in-app ticket system, §17, Phase 13 ✅). Both exist; F7's `GET /api/support/contact` endpoint remains deferred.

### 7.2 Security Requirements

- SEC-7.1: No user data shall be transmitted to external systems without user consent.

### 7.3 API Endpoints

- GET /api/support/contact — Return support contact information (Public) *(deferred — not yet implemented)*

---

## 8. System Config Management (F8) *(Phase 4 — Complete ✅)*

### 8.1 Functional Requirements

- REQ-8.1: Admin shall be able to update Proxmox VE credentials at runtime without restarting the server. (SMTP and `TRUEMONEY_API_URL` are configured via `.env` only; payment credentials resolve from system_configs first, falling back to `.env`.)
- REQ-8.2: Admin and Support shall be able to view all config entries; secret values (passwords, API keys, tokens) shall be masked as `***` in responses.
- REQ-8.3: Config keys shall be pre-defined and seeded. The API shall not allow creating new keys outside the predefined set.
- REQ-8.4: Setting a config value to null shall reset the key to use its env-var fallback.
- REQ-8.5: Updated config values shall take effect within 60 seconds (Redis cache TTL).
- REQ-8.6: Every config update shall be recorded in the audit log as `UPDATE SYSTEM_CONFIG`.

### 8.2 Security Requirements

- SEC-8.1: Only ADMIN role shall be able to update config values (`PUT /api/system-configs/:key`).
- SEC-8.2: Both ADMIN and SUPPORT roles shall be able to read config entries (secrets masked).
- SEC-8.3: Secret config values shall never appear in audit log metadata or API responses in plaintext.

### 8.3 API Endpoints

- GET /api/system-configs — List all config entries, secrets masked (ADMIN, SUPPORT)
- GET /api/system-configs/:key — Get single config entry, secret masked (ADMIN, SUPPORT)
- PUT /api/system-configs/:key — Update config value (ADMIN only)
- DELETE /api/system-configs/cache/flush — Flush Redis config cache (ADMIN only)
- GET /api/system-configs/pricing — Unit pricing for upgrade cost preview (all authenticated roles)
- GET /api/system-configs/payment-info — PromptPay ID + bank account for checkout display (all authenticated roles)

---

## 9. Email Broadcast (F9) *(Phase 5 — Complete ✅)*

### 9.1 Functional Requirements

- REQ-9.1: Admin shall be able to send a broadcast email to users by selecting an event type and target scope.
- REQ-9.2: The system shall support 3 event types: `MAINTENANCE`, `EMERGENCY`, `ANNOUNCEMENT`.
- REQ-9.3: The system shall support 3 target scopes: `ALL` (all verified users), `ACTIVE_VPS` (users with running VPS), `EXPIRING_SOON` (users with VPS expiring within 14 days).
- REQ-9.4: Each event type shall have a pre-built HTML email template with color-coded header.
- REQ-9.5: Admin shall provide `subject` and `body` (plain text; `\n→<br>` in HTML).
- REQ-9.6: The system shall send emails to all recipients concurrently using `Promise.allSettled` (non-blocking, does not fail on partial delivery).
- REQ-9.7: The system shall record each broadcast in `email_broadcasts` table: type, target, subject, sent_count, failed_count, sender (admin_id), created_at.
- REQ-9.8: Admin shall be able to list broadcast history with pagination.
- REQ-9.9: Admin shall be able to view details of a specific broadcast.
- REQ-9.10: The system shall only send to users with `is_verify = true`.
- REQ-9.11: Every broadcast action shall be recorded in the audit log as `BROADCAST EMAIL_BROADCAST`.

### 9.2 Security Requirements

- SEC-9.1: Only ADMIN role shall be able to send broadcasts or view broadcast history.
- SEC-9.2: Broadcast endpoint shall be rate-limited to 5 requests per hour per IP.
- SEC-9.3: Broadcast records shall never store recipient email addresses — only aggregate counts.

### 9.3 API Endpoints

- POST /api/broadcasts — Send broadcast email (ADMIN only, rate-limit 5/hr)
- GET /api/broadcasts — List broadcast history with pagination (ADMIN only)
- GET /api/broadcasts/:id — Get broadcast detail (ADMIN only)

---

## 10. Promo Limits & Auto-Renew (F10) *(Phase 7 — Complete ✅)*

### 10.1 Functional Requirements

- REQ-10.1: Promotions shall support `max_uses` (global cap) and `max_uses_per_user` (per-user cap); both default to null (unlimited).
- REQ-10.2: A `promo_usages` table shall track one row per order that uses a promotion.
- REQ-10.3: On order creation, the system shall check global cap vs `used_count`; error code `PROMO_LIMIT_REACHED` (409).
- REQ-10.4: On order creation, the system shall check per-user usage count; error code `PROMO_USER_LIMIT_REACHED` (409).
- REQ-10.5: VPS shall have an `auto_renew` flag (default false) and optional `locked_promo_id`.
- REQ-10.6: Users shall toggle auto-renew via `PATCH /api/vps/:id/auto-renew` with `{ auto_renew, locked_promo_id? }`.
- REQ-10.7: Daily cron at 02:20 Asia/Bangkok shall auto-create renewal orders for VPS with `auto_renew=true` expiring within 3 days.
- REQ-10.8: `POST /api/vps/:id/renew` shall accept optional `{ promo_code }` — same limit checks as order creation.

### 10.2 API Endpoints

- PATCH /api/vps/:id/auto-renew — Toggle auto-renew + set locked promo (Owner)
- POST /api/vps/:id/renew — Manual renew with optional promo (Owner, ADMIN, SUPPORT)

---

## 11. Port Forwarding / NAT (F11) *(Phase 8 — Complete ✅)*

### 11.1 Functional Requirements

- REQ-11.1: Packages with `port_count > 0` shall use Private IP + NAT via MikroTik CHR.
- REQ-11.2: On provisioning a Private IP VPS, the system shall allocate a consecutive port block of size `port_count` from the NAT public IP.
- REQ-11.3: First port in the block shall be auto-forwarded to default remote-access port (Linux→22, Windows→3389). This rule is system-locked (`is_system=true`).
- REQ-11.4: Users shall be able to add up to `port_count` port rules by specifying `private_port` + `protocol` (TCP/UDP/BOTH).
- REQ-11.5: System shall auto-assign the next available `public_port` within the VPS block.
- REQ-11.6: VPS deletion (force or expiry) shall call `natService.releaseAll(vpsId)` before releasing the private IP.
- REQ-11.7: `GET /api/vps/:id` shall include `nat_allocation` and `port_rules` for Private IP VPS.

### 11.2 Security Requirements

- SEC-11.1: Users shall only manage port rules (add/delete non-system) for their own VPS. Admin manages port rules for any VPS and can delete system rules. Support has read-only access (GET only).
- SEC-11.2: MikroTik credentials (`host`, `username`, `password`, `nat_public_ip`, `nat_base_port`) shall be stored in system_configs, not `.env`.

### 11.3 API Endpoints

- GET /api/vps/:id/port-rules — List port rules for a VPS (Owner, ADMIN, SUPPORT)
- POST /api/vps/:id/port-rules — Add a port rule (Owner, ADMIN)
- DELETE /api/vps/:id/port-rules/:ruleId — Delete a port rule (Owner [non-system], ADMIN)

---

## 12. VM Reconfigure & Upgrade (F12) *(Phase 9 — Complete ✅)*

### 12.1 Functional Requirements

- REQ-12.1: Users shall be able to upgrade VPS resources without reprovisioning via two modes: Package Switch (Mode A) and Custom Resource (Mode B).
- REQ-12.2: Mode A (Package Switch): upgrade = pro-rate charge for remaining days; downgrade = free spec change.
- REQ-12.3: Mode B (Custom Resource): unit prices from system_configs (`pricing.cpu_per_core`, `pricing.ram_per_gib`, `pricing.disk_per_gb`); disk cannot shrink.
- REQ-12.4: Orders with amount > 0 remain PENDING until payment. Amount = 0 auto-approved immediately.
- REQ-12.5: After payment, `upgradeService.applyUpgrade()` acquires Redis lock; if cores/RAM changed, `stopVm → pollTask → updateVmResources → startVm → pollTask`; if disk changed, `resizeDisk`; then updates `vps.current_*` and `monthly_price`.
- REQ-12.6: Every upgrade (including free downgrades) shall be recorded in `vps_upgrade_logs`.
- REQ-12.7: Users shall be able to cancel PENDING (unpaid) upgrade orders — cancelling marks the pending `vps_upgrade_logs` entry as failed. PAID upgrade orders cannot be cancelled (`CANNOT_CANCEL_UPGRADE`) because the upgrade has already been applied to the VPS.
- REQ-12.8: "Same OS" (Mode A eligibility) shall be determined by comparing `os_name` + `os_version` of the current and target package, not `os.id` — the `os` table permits multiple rows for the same logical OS (different `vmid` templates per tier/node), so an `os.id` comparison would incorrectly reject a same-OS package switch.
- REQ-12.9: `parseGib()` (`src/utils/specs.ts`) shall treat a bare numeric memory string (no `GB`/`MB` unit, e.g. `"4"`) as GiB directly, not fall back to a default of `1`.
- REQ-12.10: `proxmoxService.resizeDisk()` shall read the VM's actual current disk size first and no-op instead of erroring the task if the target size is not strictly larger (Proxmox rejects shrink requests outright).

### 12.2 API Endpoints

- POST /api/vps/:id/upgrade/package — Switch to a different package (Owner, ADMIN, SUPPORT)
- POST /api/vps/:id/upgrade/custom — Apply custom resource changes (Owner, ADMIN, SUPPORT)
- GET /api/vps/:id/upgrade/history — List upgrade history for a VPS (Owner, ADMIN, SUPPORT)

---

## 13. Package Categories (F13) *(Phase 10 — Complete ✅)*

### 13.1 Functional Requirements

- REQ-13.1: Admin shall be able to create package categories with a unique name and optional description.
- REQ-13.2: Admin shall be able to update and toggle status (active/inactive) of any category.
- REQ-13.3: Admin shall be able to view all categories including inactive ones.
- REQ-13.4: Users and public shall be able to list only active categories.
- REQ-13.5: Packages shall optionally reference a category via `category_id` (nullable FK). Existing packages without a category remain unaffected.
- REQ-13.6: Users shall be able to filter active packages by category using `GET /api/packages?category_id=N`.
- REQ-13.7: The system shall reject duplicate category names (case-sensitive unique constraint).

### 13.2 Security Requirements

- SEC-13.1: Only ADMIN shall be able to create, update, or toggle categories.
- SEC-13.2: All category mutations shall be recorded in the audit log as `PACKAGE_CATEGORY` entity.

### 13.3 API Endpoints

- GET /api/packages/categories — List active categories (Public)
- GET /api/packages/categories/all — List all categories incl. inactive (ADMIN)
- POST /api/packages/categories — Create a category (ADMIN)
- PUT /api/packages/categories/:id — Update a category (ADMIN)
- PATCH /api/packages/categories/:id/status — Toggle category status (ADMIN)

---

## 14. Admin/Support Create User (F14) *(Phase 11 — Complete ✅)*

### 14.1 Functional Requirements

- REQ-14.1: ADMIN and SUPPORT roles shall be able to create a new user account without requiring email verification.
- REQ-14.2: The system shall auto-generate a secure random password (16 chars, alphanumeric) and send a welcome email containing the temporary password.
- REQ-14.3: The created user shall have the default `users` role; role cannot be set at creation time.
- REQ-14.4: Every user-creation action shall be recorded in the audit log as `CREATE USER`.

### 14.2 Security Requirements

- SEC-14.1: Only ADMIN and SUPPORT roles shall access the create-user endpoint.
- SEC-14.2: The auto-generated password shall use `crypto.getRandomValues` — not `Math.random()`.
- SEC-14.3: The plaintext password shall only appear in the outbound welcome email and never be stored or logged.

### 14.3 API Endpoints

- POST /api/users — Create user with auto-generated password (ADMIN, SUPPORT)

---

## 15. Email Template Management (F15) *(Phase 11 — Complete ✅)*

### 15.1 Functional Requirements

- REQ-15.1: Admin shall be able to view, create, and update email templates for all 11 system email types (see EmailTemplateType enum in Schema.md).
- REQ-15.2: A DB-stored template shall override the hardcoded system default for that type.
- REQ-15.3: Setting `is_active=false` (or having no DB record) shall reset that type to the hardcoded default.
- REQ-15.4: The system shall cache active templates in Redis for 5 minutes (TTL); cache is invalidated on update.
- REQ-15.5: All template mutations shall be recorded in the audit log as `UPDATE EMAIL_TEMPLATE` or `ENABLE/DISABLE EMAIL_TEMPLATE`.

### 15.2 Security Requirements

- SEC-15.1: Only ADMIN role shall be able to create, update, or toggle email templates.
- SEC-15.2: Template content shall be sanitised before storage to prevent stored XSS in email clients.

### 15.3 API Endpoints

- GET /api/email-templates — List all templates (ADMIN)
- GET /api/email-templates/:type — Get a specific template by type (ADMIN)
- PUT /api/email-templates/:type — Create or update a template (ADMIN)
- PATCH /api/email-templates/:type/status — Toggle is_active (ADMIN; requires template in DB first)

---

## 16. VPS Web Terminal (F16) *(Phase 12 — Complete ✅)*

### 16.1 Functional Requirements

- REQ-16.1: Users shall be able to open a web-based VPS console (noVNC) through the browser without direct access to Proxmox.
- REQ-16.2: The system shall call Proxmox `POST /nodes/{node}/qemu/{vmid}/vncproxy` to obtain a short-lived VNC ticket and port.
- REQ-16.3: The system shall sign a 30-second JWT containing `{ vmid, ticket, port }` and return it to the client via `GET /api/terminal/:vps_id/token`.
- REQ-16.4: The system shall accept a WebSocket connection at `WS /api/terminal/:vps_id?token=xxx`, verify the JWT, open a WebSocket to Proxmox noVNC, and proxy all messages bi-directionally.
- REQ-16.5: Users shall be able to force-reset their VPS via `POST /api/vps/:id/reset` (ACPI hard reset).
- REQ-16.6: Users, Admin, and Support shall be able to retrieve live VM metrics (status, cpu%, mem, uptime) via `GET /api/vps/:id/status`.
- REQ-16.7: Admin shall be able to open a terminal for any user's VPS; every such access shall be recorded in the audit log with the target user's ID.
- REQ-16.8: Support role shall have read-only access to `GET /api/vps/:id/status` only; no terminal or reset access.

### 16.2 Security Requirements

- SEC-16.1: Terminal JWT tokens shall expire within 30 seconds; connecting with an expired token shall be rejected immediately.
- SEC-16.2: WebSocket connections shall be authenticated via the short-lived terminal JWT; unauthenticated connections shall be closed with code 4001.
- SEC-16.3: Users shall only open terminals for their own VPS. Cross-user terminal access shall be denied (403).
- SEC-16.4: Proxmox host, VNC port, and ticket shall never be exposed to the browser — they shall only exist in the backend terminal JWT (signed, not encrypted, but short-lived).
- SEC-16.5: All terminal open/close events shall be logged to `logs/YYYY-MM-DD/vps.log`.
- SEC-16.6: Admin terminal access to another user's VPS shall be recorded in `admin_audit_logs` as `ADMIN_VIEW VPS_TERMINAL` with metadata `{ vps_id, target_user_id }`.

### 16.3 API Endpoints

- GET /api/terminal/:vps_id/token — Get short-lived terminal token (USER own, ADMIN any)
- WS /api/terminal/:vps_id?token=xxx — WebSocket proxy to Proxmox noVNC (token auth)
- POST /api/vps/:id/reset — Force reset VM (USER own, ADMIN any)
- GET /api/vps/:id/status — Live Proxmox metrics: status, cpu%, mem, maxmem, uptime (USER own, ADMIN, SUPPORT)

---

## 17. In-App Support Ticket System (F17) *(Phase 13 — Complete ✅)*

### 17.1 Functional Requirements

- REQ-17.1: Users shall be able to create support tickets with a title, category, and description message.
- REQ-17.2: The system shall generate a unique ref_no for each ticket in the format `TKT-YYYYMMDD-XXXXX`.
- REQ-17.3: Tickets shall follow the lifecycle: OPEN → IN_PROGRESS → WAITING_USER → RESOLVED → CLOSED.
- REQ-17.4: Users shall be able to add follow-up messages (threaded) to their own open tickets.
- REQ-17.5: ADMIN and SUPPORT shall be able to reply to any ticket and post internal-only notes (`is_internal=true`) not visible to users.
- REQ-17.6: ADMIN and SUPPORT shall be able to update ticket status, priority, and assignment.
- REQ-17.7: Users shall only be able to set status to CLOSED on their own tickets.
- REQ-17.8: Each message shall optionally include up to 3 file attachments uploaded via multipart/form-data (`attachments: File[]`, each ≤5MB, image/jpeg|png|webp|gif). Stored in DB as `[{ name, mime_type, url, size }]`.
- REQ-17.9: When ADMIN/SUPPORT replies to a ticket, the system shall send a `TICKET_REPLY` email to the ticket owner.
- REQ-17.10: When a ticket is closed (by any party), the system shall send a `TICKET_CLOSED` email to the ticket owner.
- REQ-17.11: Admin shall be able to create, update, and toggle status of ticket categories.
- REQ-17.12: Users shall select a category when creating a ticket (must be an active category).
- REQ-17.13: ADMIN shall be able to assign a ticket to a specific SUPPORT or ADMIN user.
- REQ-17.14: SUPPORT shall be able to self-assign a ticket.

### 17.2 Security Requirements

- SEC-17.1: Users shall only view and reply to their own tickets. Cross-user ticket access shall be denied (403).
- SEC-17.2: Internal notes (`is_internal=true`) shall never be returned to USER-role callers.
- SEC-17.3: Attachments shall be uploaded as multipart files. Each file shall be validated at ≤5MB and image/* MIME type before saving to disk. Max 3 files per message enforced at the API boundary.
- SEC-17.4: Only ADMIN shall be able to create, update, or toggle ticket categories.
- SEC-17.5: All ticket mutations (create, status change, assign, priority change) shall be recorded in the audit log.

### 17.3 API Endpoints

- GET /api/tickets/categories — List active categories (Public)
- GET /api/tickets/categories/all — List all categories incl. inactive (ADMIN, SUPPORT)
- POST /api/tickets/categories — Create category (ADMIN)
- PUT /api/tickets/categories/:id — Update category (ADMIN)
- PATCH /api/tickets/categories/:id/status — Toggle category status (ADMIN)
- POST /api/tickets — Create ticket (USER)
- GET /api/tickets — List own (USER) / all with filters (ADMIN, SUPPORT)
- GET /api/tickets/:id — Get ticket + messages (Owner / ADMIN / SUPPORT)
- PATCH /api/tickets/:id/status — Update status (ADMIN, SUPPORT; USER = CLOSED own only)
- PATCH /api/tickets/:id/assign — Assign to staff (ADMIN, SUPPORT)
- PATCH /api/tickets/:id/priority — Set priority (ADMIN, SUPPORT)
- POST /api/tickets/:id/messages — Add message / internal note (Owner / ADMIN / SUPPORT) — `multipart/form-data`

---

## 18. Resource Capacity Lock (F18) *(Phase 14 — Complete ✅)*

### 18.1 Functional Requirements

- REQ-18.1: The system shall check Proxmox node resource availability before creating a VPS order.
- REQ-18.2: The capacity check shall query Proxmox `GET /nodes/{node}/status` and `GET /nodes/{node}/storage/{storage}/status`, cached in Redis for 30 seconds.
- REQ-18.3: The effective free RAM shall be calculated as: `node.maxmem_mb - node.mem_mb - Σ(temp_vps.memory where active)`.
- REQ-18.4: The effective free disk shall be calculated as: `storage.avail_gb - Σ(temp_vps.disk_gb where active)`.
- REQ-18.5: If `effective_free_ram_mb < package.memory_mb + capacity.min_free_ram_mb` OR `effective_free_disk_gb < package.disk_gb + capacity.min_free_disk_gb`, the system shall reject order creation with error `INSUFFICIENT_RESOURCES` (HTTP 409).
- REQ-18.6: The 409 response shall include diagnostic detail: `{ required_ram_mb, available_ram_mb, required_disk_gb, available_disk_gb }`.
- REQ-18.7: ADMIN may bypass the capacity check by including `force: true` in the order request body.
- REQ-18.8: All ADMIN capacity-check bypasses shall be recorded in the audit log as `BYPASS CAPACITY_CHECK` with node snapshot metadata.
- REQ-18.9: Admin and Support shall be able to view a live node resource snapshot via `GET /api/system/capacity`.
- REQ-18.10: Admin shall be able to enable/disable the capacity check globally via system_config key `capacity.check_enabled`.
- REQ-18.11: Admin shall be able to configure minimum free buffers via system_config keys `capacity.min_free_ram_mb` and `capacity.min_free_disk_gb`.
- REQ-18.12: `GET /api/packages` (public) shall include an `available: boolean` field per package — `true` if the node has sufficient effective free RAM and disk for that package, `false` otherwise. If `capacity.check_enabled=false` or the Proxmox node is unreachable, all packages shall return `available: true` (graceful degrade — never blocks the package listing endpoint).

### 18.2 Security Requirements

- SEC-18.1: Only ADMIN and SUPPORT shall be able to view `GET /api/system/capacity`.
- SEC-18.2: The `force: true` bypass shall only be accepted from ADMIN role; SUPPORT and USER bypass attempts shall be silently ignored.
- SEC-18.3: Proxmox node credentials used in capacity checks shall not appear in API responses or error payloads.

### 18.3 System Config Keys (3 new)

- `capacity.check_enabled` — `"true"` / `"false"` — global toggle (default `"true"`)
- `capacity.min_free_ram_mb` — buffer RAM MB to keep free after allocation (default `"1024"`)
- `capacity.min_free_disk_gb` — buffer disk GB to keep free after allocation (default `"10"`)

### 18.4 API Endpoints

- GET /api/packages — public; now includes `available: boolean` per package (degrades to `true` if check disabled or Proxmox unreachable)
- GET /api/system/capacity — Live node snapshot: total/used/free RAM, disk, CPU % (ADMIN, SUPPORT)
- POST /api/orders — existing endpoint; ADMIN may now pass optional `force: true` to bypass capacity check

---

## 19. VPS Credential Delivery + In-App Password Change (F19) *(Phase 16 — Complete ✅)*

**Prerequisite:** `qemu-guest-agent` installed in VM template (vmid 100) — done manually.

### 19.1 Functional Requirements — Auto Credential Delivery on Provision (F19a)

- REQ-19a.1: The system shall generate a random 16-character alphanumeric password during VPS provisioning.
- REQ-19a.2: The system shall pass the generated password as `cipassword` to Proxmox cloud-init configuration.
- REQ-19a.3: The system shall send an email to the VPS owner after successful provisioning, containing: IP address, OS username, and the generated password.
- REQ-19a.4: The password shall NOT be stored in the database. It is delivered once via email.
- REQ-19a.5: If email delivery fails, the provisioning is still considered successful; the failure shall be logged.

### 19.2 Functional Requirements — In-App Password Change with OTP (F19b)

- REQ-19b.1: Users shall be able to request a password change for their own VPS via `POST /api/vps/:id/change-password/request`.
- REQ-19b.2: On request, the system shall generate a 6-digit numeric OTP, store a bcrypt/SHA-256 hash in Redis with 5-minute TTL, and send the OTP to the user's registered email.
- REQ-19b.3: The system shall limit OTP verification attempts to 5 per request window.
- REQ-19b.4: Users shall submit the OTP and new password via `POST /api/vps/:id/change-password/confirm { otp, new_password }`.
- REQ-19b.5: The system shall verify the OTP hash, resolve `osType` (`linux` | `windows`) from the VPS's OS name, then call `proxmoxService.changeVmPassword(vmid, username, newPassword, osType)` via `qemu-guest-agent exec`: **Linux** runs `chpasswd` via stdin; **Windows** runs `Set-LocalUser` via a base64-encoded PowerShell command (`net user` was tried first but proved unreliable under `guest-exec`'s non-interactive SYSTEM session — see `docs/Qa.md` PROX-BUG-4/5).
- REQ-19b.6: On success, the system shall delete the OTP from Redis and send a "password changed" confirmation email.
- REQ-19b.7: `new_password` must be 8–64 characters. Allowed: `[A-Za-z0-9!@#%^&*()_+\-=]`. Forbidden: `"` `` ` `` `$` `\` `:`.
- REQ-19b.8: Admin may change password for any VPS. SUPPORT has no access to this endpoint.
- REQ-19b.9: Every successful password change shall be recorded in the audit log (`UPDATE VPS_TERMINAL`, metadata: `{ action: "password_change" }`).

### 19.3 API Endpoints

- POST /api/vps/:id/change-password/request — Send OTP (USER own, ADMIN any)
- POST /api/vps/:id/change-password/confirm — Verify OTP + change password (USER own, ADMIN any)

---

## Appendix A. Global Security Requirements

### A.1 Transport & Network

- SEC-G1: All API communication shall use HTTPS (TLS 1.2+).
- SEC-G2: CORS shall be configured with an explicit origin whitelist. Wildcard origins shall not be used in production.
- SEC-G3: HTTP security headers shall be applied: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, X-XSS-Protection.

### A.2 Input Validation

- SEC-G4: All request bodies shall be validated using Elysia's type-safe schema validation (t.Object, t.String, etc.).
- SEC-G5: Query parameters and path parameters shall be validated and sanitized.
- SEC-G6: File uploads (slip images, ticket attachments) shall be limited to 5MB and validated for content type.

### A.3 Rate Limiting

- SEC-G7: Public endpoints (login, register) shall be rate-limited to 10 requests per minute per IP.
- SEC-G8: Authenticated endpoints shall be rate-limited to 100 requests per minute per user.
- SEC-G9: Payment submission endpoints shall be rate-limited to 5 requests per minute per user.

### A.4 Logging & Monitoring

- SEC-G10: All authentication events (login, logout, failed attempts) shall be logged to `logs/YYYY-MM-DD/auth.log`.
- SEC-G11: All payment events (creation, verification, approval, rejection) shall be logged to `logs/YYYY-MM-DD/payment.log`.
- SEC-G12: All VPS lifecycle events (create, start, stop, reboot, expire, delete) shall be logged to `logs/YYYY-MM-DD/vps.log`.
- SEC-G13: Logs shall not contain sensitive data (passwords, tokens, full slip images).
- SEC-G13a: General info/warn logs shall be written to `logs/YYYY-MM-DD/app.log`. Error-level logs shall additionally be written to `logs/YYYY-MM-DD/error.log`.
- SEC-G13b: All log files shall use newline-delimited JSON format (NDJSON) — one self-contained JSON object per line — so that log aggregators (Loki, CloudWatch, etc.) can parse them without regex.
- SEC-G13c: Log files shall be organized by UTC date under the `logs/` directory. The `logs/` directory shall be listed in `.gitignore` and excluded from version control.

### A.5 Database Security

- SEC-G14: Database connections shall use parameterized queries via Prisma (no raw SQL without parameterization).
- SEC-G15: Database credentials shall be stored in environment variables.
- SEC-G16: Sensitive fields (password) shall never be included in Prisma select/include queries to the client.

### A.6 Infrastructure

- SEC-G17: Proxmox API credentials shall be rotated periodically.
- SEC-G18: Redis shall be configured with authentication (requirepass) and not exposed to the public network.
- SEC-G19: The backend shall run behind a reverse proxy (e.g., Nginx) with request size limits.

---

## Appendix B. Summary

This specification defines the functional and security requirements for the CloudVPS VPS Cloud Rental Service backend. It covers 19 feature modules (F1–F19) mapped from `Feature.md`, plus global security policies for transport, validation, rate limiting, logging, and database security (Appendix A).

**Phase status:**
- Phase 1–5, 7, 8, 9, 10, 11, 13, 14, 15, 16 ✅ Complete
- Phase 12 (VPS Web Terminal) ✅ Complete
- Phase 6 (Staging Deploy) 🔧 In Progress — remaining: staging Docker Compose deploy, full endpoint smoke test, optional rate-limit load test
- F7's `GET /api/support/contact` endpoint remains deferred (not blocking — F17 in-app tickets cover the same need)

All requirements trace back to the feature summary in `Feature.md` and the database schema in `Schema.md`.
