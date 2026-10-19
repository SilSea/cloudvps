# CloudVPS - Database Schema

- Database engine: PostgreSQL
- Database name: cloudvps
- Total tables: 28 (all live — `email_broadcasts` Phase 5 ✅, `system_configs` Phase 4 ✅, `promo_usages` Phase 7 ✅, `vps_upgrade_logs` Phase 9 ✅, `nat_allocations` Phase 8 ✅, `nat_port_rules` Phase 8 ✅, `package_categories` Phase 10 ✅, `email_templates` Phase 11 ✅, `ticket_categories` Phase 13 ✅, `tickets` Phase 13 ✅, `ticket_messages` Phase 13 ✅)

---

## 1. Relationships

- roles → users: One role has many users (1:N)
- users → users_info: One user has one personal info record (1:1)
- users → consents: One user can accept many policies (1:N)
- users → orders: One user can place many orders (1:N)
- policies → consents: One policy can be referenced by many consents (1:N)
- os → packages: One OS template can be used in many packages (1:N)
- vm → packages: One VM spec can be used in many packages (1:N)
- package_categories → packages: One category can contain many packages (1:N, optional) [Phase 10 ✅]
- packages → orders: One package can be ordered many times (1:N)
- promotions → orders: One promotion can be applied to many orders (1:N)
- promotions → promo_usages: One promotion can have many usage records (1:N) [Phase 7]
- promotions → vps (locked): One promotion can be locked to many VPS for auto-renew (1:N) [Phase 7]
- users → promo_usages: One user can have many promo usage records (1:N) [Phase 7]
- orders → promo_usages: One order maps to one promo usage record (1:1) [Phase 7]
- orders → transactions: One order can have many transactions (1:N)
- orders → temp_vps: One order creates one temp_vps record (1:1)
- orders → vps: One order provisions one VPS instance (1:1, named relation "vps_provision")
- orders → vps (renewal): One renewal order references one existing VPS (M:1, named relation "vps_renewals")
- orders → vps (upgrade): One upgrade order references one existing VPS (M:1, named relation "vps_upgrades") [Phase 9]
- orders → vps_upgrade_logs: One upgrade order has one upgrade log (1:1) [Phase 9]
- vps → vps_upgrade_logs: One VPS can have many upgrade log records (1:N) [Phase 9]
- ip_pools → ip_assignments: One IP from pool can be assigned multiple times (1:N)
- ip_assignments → vps: One IP assignment is bound to one VPS (1:1)
- users → user_oauth_providers: One user can have many OAuth provider links (1:N)
- users (actor) → admin_audit_logs: One admin/support user can perform many audit actions (1:N)
- users (target) → admin_audit_logs: One user can be the target of many audit actions (1:N)
- users (sender) → email_broadcasts: One admin user can send many broadcasts (1:N) [Phase 5 ✅]
- users (updater) → system_configs: One admin user can update many config entries (1:N) [Phase 4 ✅]
- vps → nat_allocations: One VPS has at most one NAT port block allocation (1:1) [Phase 8 ✅]
- nat_allocations → nat_port_rules: One NAT allocation has many port rules (1:N) [Phase 8 ✅]
- users (updater) → email_templates: One admin user can update many email templates (1:N) [Phase 11 ✅]
- ticket_categories → tickets: One category can contain many tickets (1:N) [Phase 13 ✅]
- users (owner) → tickets: One user can own many tickets (1:N, relation "TicketOwner") [Phase 13 ✅]
- users (assignee) → tickets: One staff user can be assigned many tickets (1:N, relation "TicketAssignee") [Phase 13 ✅]
- tickets → ticket_messages: One ticket can have many messages (1:N) [Phase 13 ✅]
- users (sender) → ticket_messages: One user can send many ticket messages (1:N, relation "MessageSender") [Phase 13 ✅]

---

## 2. Table Definitions

**Table: users**
- id (serial, PK, auto) — User ID
- email (varchar 100, not null) — Email address
- password (varchar 60, nullable) — Hashed password (null for OAuth-only accounts)
- role_id (int 10, not null, FK→roles.id) — Role reference (admin, support, or users)
- status (boolean, default true, not null) — Active/Inactive status
- is_verify (boolean, default false, not null) — Email verification status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: users_info**
- user_id (int 10, not null, FK→users.id) — User reference
- first_name (varchar 150, not null) — First name
- last_name (varchar 150, not null) — Last name
- phone (varchar 10, not null) — Phone number
- address1 (text, not null) — Address line 1
- address2 (text, nullable) — Address line 2
- address3 (varchar 100, not null) — Sub-district
- address4 (varchar 100, not null) — District
- address5 (varchar 10, not null) — Postal code
- address6 (varchar 50, not null) — Country
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: roles**
- id (serial, PK, auto) — Role ID
- role_name (varchar 50, not null) — Role name (admin / support / users)
- status (boolean, default true, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: policies**
- id (serial, PK, auto) — Policy ID
- policie_title (varchar 150, not null) — Title
- policies_detail (text, not null) — Content body
- policies_type (enum: PDPA / TERMSERVICE, not null) — Policy type
- version (varchar 10, not null) — Version string
- status (boolean, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: consents**
- id (serial, PK, auto) — Consent ID
- users_id (int 10, not null, FK→users.id) — User reference
- policies_id (int 10, not null, FK→policies.id) — Policy reference (PDPA or Term&Service)
- accepted_at (timestamp, not null) — Acceptance timestamp

**Table: package_categories** [Phase 10 ✅]
- id (serial, PK, auto) — Category ID
- name (varchar 100, not null, unique) — Category name
- description (text, nullable) — Optional description
- status (boolean, default true) — Active/Inactive
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: os**
- id (serial, PK, auto) — OS template ID
- os_name (varchar 50, not null) — OS name
- os_version (varchar 50, not null) — OS version
- vmid (int 10, not null) — Proxmox vmid for the template
- status (boolean, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: vm**
- id (serial, PK, auto) — VM spec ID
- core (int 5, not null) — Number of CPU cores
- memory (varchar 10, not null) — RAM size
- size (varchar 10, not null) — Disk size
- status (boolean, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: packages**
- id (serial, PK, auto) — Package ID
- name (varchar 100, not null) — Package name
- description (text, not null) — Description
- price (double, not null) — Price
- period (int 10, not null) — Rental period
- os_id (int 10, not null, FK→os.id) — OS template reference
- vm_id (int 10, not null, FK→vm.id) — VM spec reference
- port_count (int, nullable) — NAT port block size; null = PUBLIC IP, number = PRIVATE IP + NAT (Phase 8 ✅)
- category_id (int, nullable, FK→package_categories.id) — Optional category [Phase 10 ✅]
- status (boolean, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: promotions**
- id (serial, PK, auto) — Promotion ID
- code_name (varchar 150, not null) — Promo code
- description (text, not null) — Description
- type (enum: DISCOUNT / PERCENT, not null) — Discount type (flat amount or percentage)
- discount (double, not null) — Discount value
- status (boolean, not null) — Active/Inactive status
- max_uses (int, nullable) — Global usage cap; null = unlimited [Phase 7]
- max_uses_per_user (int, nullable) — Per-user cap; null = unlimited [Phase 7]
- used_count (int, default 0, not null) — Global usage counter (incremented atomically on order create) [Phase 7]
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date
- expired_at (timestamp, nullable, auto) — Promotion expiry date

**Table: orders**
- id (serial, PK, auto) — Order ID
- ref_no (varchar 100, not null, UNIQUE) — Order reference number
- amount (int 10, not null) — Total amount
- users_id (int 10, not null, FK→users.id) — User reference
- promotions_id (int 10, nullable, FK→promotions.id) — Promotion reference (nullable when no promo applied)
- packages_id (int 10, not null, FK→packages.id) — Package reference
- renewal_vps_id (int 10, nullable, FK→vps.id) — Renewal target VPS (null for new orders, set for renewal orders) [Phase 5]
- upgrade_vps_id (int 10, nullable, FK→vps.id) — Upgrade target VPS (set for upgrade orders) [Phase 9]
- status (enum: PAID / PENDING / CANCEL / EXPIRE, default PENDING, not null) — Order status
- created_at (timestamp, not null) — Creation date
- expired_at (timestamp, nullable, auto) — Order expiry date

**Table: transactions**
- id (serial, PK, auto) — Transaction ID
- provider_ref_id (varchar 100, not null) — Payment provider reference ID
- amount (int 10, not null) — Payment amount
- payment_method (enum: SLIP / PROMPTPAY / TRUEMONEY, not null) — Payment channel
- slip_url (text, nullable) — Slip image reference; format depends on `payment.slip_mode` system config: **FILE** mode stores URL path (e.g. `/uploads/slips/2026-07/abc.jpg`), **BASE64** mode stores raw base64 string. Nullable for TrueMoney (no slip) and when no slip attached.
- order_id (int 10, not null, FK→orders.id) — Order reference
- status (enum: SUCCESSFUL / PENDING / REJECT, not null) — Transaction status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: temp_vps**
- id (serial 10, PK, auto) — Temp VPS ID
- name (varchar 150, nullable) — VPS machine name
- order_id (int 10, not null, FK→orders.id) — Order reference
- created_at (timestamp, not null) — Creation date

**Table: vps**
- id (serial, PK, auto) — VPS instance ID
- name (varchar 150, not null) — VPS machine name
- vmid (int 10, not null) — Proxmox vmid
- ip_assignments_id (int 10, not null, FK→ip_assignments.id) — Assigned IP reference
- orders_id (int 10, not null, FK→orders.id) — Order reference
- status (boolean, not null) — Active/Inactive status
- auto_renew (boolean, default false, not null) — Enable cron-driven renewal order creation [Phase 7]
- locked_promo_id (int, nullable, FK→promotions.id) — Promo locked for all auto-renewal orders; null = no locked promo [Phase 7]
- current_cores (int, nullable) — Current effective vCPU count (synced on provision + upgrade) [Phase 9]
- current_memory_gib (int, nullable) — Current effective RAM in GiB [Phase 9]
- current_disk_gb (int, nullable) — Current effective disk in GB [Phase 9]
- monthly_price (float, nullable) — Current effective monthly price (updated on upgrade) [Phase 9]
- created_at (timestamp, not null) — Creation date
- expired_at (timestamp, not null, auto) — VPS expiry date
- deleted_at (timestamp, nullable, auto) — Soft delete date

**Table: vps_upgrade_logs** *(Phase 9 ✅)*
- id (serial, PK, auto) — Log ID
- vps_id (int, not null, FK→vps.id) — VPS reference
- order_id (int, not null, UNIQUE, FK→orders.id) — Upgrade order reference
- upgrade_type (enum: PACKAGE / CUSTOM, not null) — Mode A or Mode B upgrade
- before_cores (int, not null) — CPU cores before upgrade
- before_memory_gib (int, not null) — RAM (GiB) before upgrade
- before_disk_gb (int, not null) — Disk (GB) before upgrade
- before_monthly_price (float, not null) — Monthly price before upgrade
- after_cores (int, not null) — CPU cores after upgrade
- after_memory_gib (int, not null) — RAM (GiB) after upgrade
- after_disk_gb (int, not null) — Disk (GB) after upgrade
- after_monthly_price (float, not null) — Monthly price after upgrade
- amount_charged (int, not null) — Amount charged for this upgrade (0 = free downgrade)
- applied_at (timestamp, nullable) — When upgrade was applied to Proxmox (null = pending)
- failed_at (timestamp, nullable) — When Proxmox apply failed (null = no failure)
- fail_reason (text, nullable) — Failure reason from Proxmox
- created_at (timestamp, not null) — Log creation date

**Table: promo_usages** *(Phase 7 ✅)*
- id (serial, PK, auto) — Usage record ID
- promotion_id (int, not null, FK→promotions.id) — Promotion reference
- user_id (int, not null, FK→users.id) — User who used the promo
- order_id (int, not null, UNIQUE, FK→orders.id) — Order the promo was applied to (UNIQUE prevents double-count)
- created_at (timestamp, not null) — When the promo was used

**Table: ip_assignments**
- id (serial, PK, auto) — IP assignment ID
- ip_id (int 10, not null, FK→ip_pools.id) — IP reference from pool
- status (boolean, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: user_oauth_providers**
- id (serial, PK, auto) — Record ID
- user_id (int 10, not null, FK→users.id) — User reference
- provider (enum: GOOGLE / DISCORD / FACEBOOK, not null) — OAuth provider name
- provider_uid (varchar 200, not null) — User ID from the provider's platform
- access_token (text, nullable) — Provider access token
- refresh_token (text, nullable) — Provider refresh token
- token_expires_at (timestamp, nullable) — Token expiry time
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date
- UNIQUE (provider, provider_uid) — Prevents duplicate provider accounts

**Table: ip_pools**
- id (serial, PK, auto) — IP pool ID
- ip (inet, not null) — IP address
- type (enum: PUBLIC / PRIVATE, not null) — IP type (public or private)
- status (boolean, not null) — Active/Inactive status
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Table: admin_audit_logs**
- id (serial, PK, auto) — Audit log ID
- actor_id (int 10, not null, FK→users.id) — Admin/Support who performed the action
- actor_role (varchar 20, not null) — Role of the actor at time of action (admin / support)
- action (enum: AuditAction, not null) — Action performed
- entity (enum: AuditEntity, not null) — Entity type that was acted upon
- entity_id (int 10, not null) — ID of the record that was acted upon
- target_user_id (int 10, nullable, FK→users.id) — User who is affected by this action (nullable)
- metadata (jsonb, nullable) — Additional context: before/after values, reason, changed fields
- ip_address (varchar 45, nullable) — IP address of the actor
- created_at (timestamp, not null) — When the action occurred
- Note: append-only table — no UPDATE or DELETE allowed

**Enum: AuditAction**
- CREATE — Record was created
- UPDATE — Record was updated
- ENABLE — Record status was toggled to active
- DISABLE — Record status was toggled to inactive
- APPROVE — Transaction/payment was approved
- REJECT — Transaction/payment was rejected
- CANCEL — Order was cancelled
- START — VPS was started
- STOP — VPS was stopped
- REBOOT — VPS was rebooted
- EXPIRE — VPS or order was expired
- ROLE_CHANGE — User role was changed
- BROADCAST — Email broadcast was sent [Phase 5]
- UPGRADE — VPS resource upgrade applied [Phase 9]
- ASSIGN — Support ticket assigned to staff member [Phase 13]
- REPLY — Message added to support ticket [Phase 13]
- BYPASS — Admin forced order past capacity check [Phase 14]

**Enum: AuditEntity**
- USER — Action on a user account
- VPS — Action on a VPS instance
- ORDER — Action on an order
- TRANSACTION — Action on a transaction
- PACKAGE — Action on a VPS package
- OS_TEMPLATE — Action on an OS template
- VM_SPEC — Action on a VM spec
- PROMOTION — Action on a promotion code
- POLICY — Action on a policy version
- IP_POOL — Action on an IP pool entry
- SYSTEM_CONFIG — Action on a system config entry
- EMAIL_BROADCAST — Email broadcast record [Phase 5]
- VPS_UPGRADE — VPS upgrade log record [Phase 9]
- PACKAGE_CATEGORY — Package category record [Phase 10]
- EMAIL_TEMPLATE — Email template record [Phase 11]
- TICKET — Support ticket record [Phase 13]
- TICKET_CATEGORY — Support ticket category record [Phase 13]
- CAPACITY_CHECK — Proxmox capacity check bypass [Phase 14]

**Enum: BroadcastType** *(Phase 5 ✅)*
- MAINTENANCE — Maintenance notification (header color: #f59e0b amber)
- EMERGENCY — Emergency alert (header color: #ef4444 red)
- ANNOUNCEMENT — General announcement (header color: #7c3aed purple)

**Enum: BroadcastTarget** *(Phase 5 ✅)*
- ALL — All users with status=true AND is_verify=true
- ACTIVE_VPS — Users with at least one running VPS (status=true, deleted_at IS NULL) — deduped
- EXPIRING_SOON — Users with VPS expiring within 14 days (expired_at BETWEEN now AND now+14d) — deduped

**Table: email_broadcasts** *(Phase 5 ✅ — Complete)*
- id (serial, PK, auto) — Broadcast ID
- subject (varchar 200, not null) — Email subject line
- body (text, not null) — Plain text body (newlines converted to `<br>` in HTML template)
- type (enum: BroadcastType, not null) — Event type
- target (enum: BroadcastTarget, not null) — Recipient scope
- sent_by (int 10, not null, FK→users.id) — Admin who triggered broadcast
- sent_count (int, not null, default 0) — Successfully sent count
- failed_count (int, not null, default 0) — Failed delivery count
- created_at (timestamp, not null, default now()) — Send time
- Note: no `recipient_count`, no `status`, no `metadata` fields

**Table: system_configs** *(Phase 4 ✅ — Complete)*
- id (serial, PK, auto) — Config ID
- key (varchar 100, not null, UNIQUE) — Config key (e.g. "proxmox.host")
- value (text, nullable) — Config value (null = use env var fallback)
- description (varchar 500, nullable) — Human-readable description
- is_secret (boolean, default false, not null) — Mask value in GET responses as "***"
- category (varchar 50, not null) — Grouping key ("proxmox", "pricing", "mikrotik", "capacity", "payment")
- updated_by (int 10, nullable, FK→users.id) — Admin who last updated (null = never updated via API)
- updated_at (timestamp, not null, auto updatedAt) — Last update time
- Note: 22 keys pre-seeded (10 proxmox + 5 mikrotik [Phase 8] + 3 pricing [Phase 9] + 3 capacity [Phase 14] + 1 payment [Phase 15]); no new keys can be created via API
  - `payment.slip_mode` — `FILE` (default, multipart disk) | `BASE64` (raw base64 string); controls how slip images are submitted and stored

**Enum: NatProtocol** *(Phase 8 ✅)*
- TCP — TCP-only port forwarding rule
- UDP — UDP-only port forwarding rule
- BOTH — Creates both TCP and UDP rules in MikroTik

**Table: nat_allocations** *(Phase 8 ✅)*
- id (serial, PK, auto) — Allocation ID
- vps_id (int, not null, UNIQUE, FK→vps.id) — VPS reference (one allocation per VPS)
- public_ip (varchar 45, not null) — Shared NAT public IP address
- port_start (int, not null) — First port in allocated block
- port_end (int, not null) — Last port in allocated block
- is_active (boolean, default true, not null) — Active/released status
- created_at (timestamp, not null) — Allocation date
- Indexes: `(public_ip, is_active)` — fast MAX(port_end) query

**Table: nat_port_rules** *(Phase 8 ✅)*
- id (serial, PK, auto) — Rule ID
- allocation_id (int, not null, FK→nat_allocations.id) — NAT allocation reference
- public_port (int, not null) — Inbound public port (within VPS block)
- private_port (int, not null) — Destination port on private VM
- protocol (enum: NatProtocol, not null) — TCP / UDP / BOTH
- is_system (boolean, default false, not null) — True = SSH/RDP rule created at provision; cannot be deleted by users
- mikrotik_ids (jsonb, nullable) — Array of MikroTik DST-NAT rule IDs for cleanup
- is_active (boolean, default true, not null) — Active/deleted status
- created_at (timestamp, not null) — Rule creation date
- Indexes: `(allocation_id, is_active)`, `(allocation_id, public_port)`

**Enum: EmailTemplateType** *(Phase 11 ✅ + Phase 13 ✅)*
- VERIFICATION, EXPIRY_WARNING, EXPIRED, FORCE_DELETED, AUTO_RENEWAL_REMINDER
- BROADCAST_MAINTENANCE, BROADCAST_EMERGENCY, BROADCAST_ANNOUNCEMENT, WELCOME
- TICKET_REPLY, TICKET_CLOSED *(Phase 13 — ticket email notifications)*

**Table: email_templates** *(Phase 11 ✅ — Complete)*
- id (serial, PK, auto) — Template ID
- type (enum: EmailTemplateType, not null, UNIQUE) — One record per email type
- subject (varchar 255, not null) — Email subject line; supports `{{variable}}` placeholders
- body_html (text, not null) — Full HTML body; supports `{{variable}}` placeholders
- variables (jsonb, nullable) — Array of available placeholder names (metadata only)
- is_active (boolean, default true, not null) — When false, email.service falls back to hardcoded default
- updated_by (int, nullable, FK→users.id) — Admin who last updated; null = seeded default
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last update time
- Index: `(updated_by)` — lookup templates by admin
- Note: 11 templates pre-seeded (9 original + TICKET_REPLY, TICKET_CLOSED added in Phase 13); variable interpolation uses `{{key}}` syntax

**Table: ticket_categories** *(Phase 13 ✅ — Complete)*
- id (serial, PK, auto) — Category ID
- name (varchar 100, not null, UNIQUE) — Category name
- description (text, nullable) — Optional description
- status (boolean, default true, not null) — Active/Inactive
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date

**Enum: TicketStatus** *(Phase 13 ✅)*
- OPEN — Newly created ticket
- IN_PROGRESS — Staff is handling
- WAITING_USER — Staff waiting for user response
- RESOLVED — Staff marked resolved
- CLOSED — Ticket closed (by staff, user, or auto after 7 days RESOLVED)

**Enum: TicketPriority** *(Phase 13 ✅)*
- LOW / MEDIUM (default) / HIGH / URGENT — Set by ADMIN or SUPPORT only

**Table: tickets** *(Phase 13 ✅ — Complete)*
- id (serial, PK, auto) — Ticket ID
- ref_no (varchar 30, not null, UNIQUE) — Reference number (format `TKT-YYYYMMDD-XXXXX`)
- title (varchar 255, not null) — Ticket title
- category_id (int, not null, FK→ticket_categories.id) — Ticket category
- priority (enum: TicketPriority, default MEDIUM, not null) — Priority level
- status (enum: TicketStatus, default OPEN, not null) — Current status
- user_id (int, not null, FK→users.id) — Ticket owner (USER role)
- assigned_to (int, nullable, FK→users.id) — Assigned staff member
- closed_at (timestamp, nullable) — When ticket was closed
- created_at (timestamp, not null) — Creation date
- updated_at (timestamp, nullable, auto) — Last updated date
- Indexes: `user_id`, `status`, `assigned_to`, `category_id`

**Table: ticket_messages** *(Phase 13 ✅ — Complete)*
- id (serial, PK, auto) — Message ID
- ticket_id (int, not null, FK→tickets.id) — Parent ticket
- sender_id (int, not null, FK→users.id) — Message author
- message (text, not null) — Message body
- attachments (jsonb, nullable) — Array of `{name, mime_type, url, size}` (Phase 15: multipart image upload ≤5MB each, max 3)
- is_internal (boolean, default false, not null) — Internal note (hidden from USER role)
- created_at (timestamp, not null) — Send time
- Indexes: `ticket_id`, `sender_id`
- Note: append-only; no UPDATE or DELETE on messages

---

## 3. Schema Improvements Applied

The following issues were identified and corrected from the original design:

1. orders.promotions_id — Changed from not null to nullable. Not every order uses a promotion code, so this field must allow null values.

2. transactions.slip_url — Changed from not null to nullable. Truemoney payments are verified via API and do not produce a slip image, so this field should not be required for all payment methods.

3. temp_vps — Added created_at timestamp field. The original schema had no timestamp, making it impossible to track when a provisioning request was queued.

4. vps.ip_assignments — Renamed to ip_assignments_id and declared as FK→ip_assignments.id. The original field name was ambiguous and was not explicitly marked as a foreign key.

5. vps.deleted_at — Changed from not null to nullable. A soft-delete timestamp should be null when the record has not been deleted.

6. users.password — Changed from not null to nullable. OAuth-authenticated users (Google, Discord, Facebook) do not have a password; requiring it would prevent their accounts from being created.

7. user_oauth_providers — New table added to support OAuth login. Stores the provider name, the user's ID on that provider, and optional tokens. A unique constraint on (provider, provider_uid) prevents the same external account from being linked twice.

8. orders.renewal_vps_id — Added nullable FK to vps.id to link a renewal order to the VPS being extended (Phase 5). Named relations "vps_provision" / "vps_renewals" distinguish provision orders from renewal orders.

9. system_configs — New table added (Phase 4) for runtime-editable Proxmox credentials. 22 keys pre-seeded (10 proxmox + 5 mikrotik + 3 pricing + 3 capacity + 1 payment); SMTP and payment credentials remain in .env only.

10. email_broadcasts — New table added (Phase 5) for admin email broadcast history.

---

## 4. Database Indexes

Indexes added beyond PKs and UNIQUE constraints (for query performance):

| Table | Index columns | Purpose |
|-------|--------------|---------|
| `users` | `role_id` | RBAC + list queries |
| `consents` | `users_id` | user consent lookup |
| `consents` | `policies_id` | policy consent lookup |
| `packages` | `os_id` | FK join |
| `packages` | `vm_id` | FK join |
| `orders` | `users_id` | user order list |
| `orders` | `packages_id` | FK join |
| `orders` | `promotions_id` | FK join |
| `orders` | `renewal_vps_id` | renewal query |
| `transactions` | `order_id` | order transaction lookup |
| `vps` | `expired_at` | expiry cron query |
| `vps` | `status` | running VPS query |
| `vps` | `deleted_at` | soft-delete filter |
| `vps` | `(expired_at, status, deleted_at)` | compound cron query |
| `vps` | `locked_promo_id` | FK join [Phase 7] |
| `vps` | `(auto_renew, expired_at, deleted_at)` | auto-renew cron query [Phase 7] |
| `promo_usages` | `(promotion_id, user_id)` | per-user usage count [Phase 7] |
| `promo_usages` | `user_id` | FK join [Phase 7] |
| `ip_assignments` | `ip_id` | FK join |
| `admin_audit_logs` | `actor_id` | audit filter |
| `admin_audit_logs` | `(entity, entity_id)` | audit filter |
| `admin_audit_logs` | `target_user_id` | audit filter |
| `admin_audit_logs` | `created_at` | date range filter |
| `system_configs` | `category` | group listing |
| `system_configs` | `updated_by` | FK join |
| `email_broadcasts` | `sent_by` | FK join |
| `email_broadcasts` | `created_at` | date order |
| `nat_allocations` | `(public_ip, is_active)` | MAX(port_end) query for block allocation [Phase 8] |
| `nat_port_rules` | `(allocation_id, is_active)` | active rules lookup [Phase 8] |
| `nat_port_rules` | `(allocation_id, public_port)` | port conflict check [Phase 8] |
| `orders` | `upgrade_vps_id` | upgrade order lookup [Phase 9] |
| `vps_upgrade_logs` | `vps_id` | VPS upgrade history [Phase 9] |
| `vps_upgrade_logs` | `created_at` | date order [Phase 9] |
| `packages` | `category_id` | category filter [Phase 10] |
| `email_templates` | `updated_by` | FK join [Phase 11] |
| `tickets` | `user_id` | user ticket list [Phase 13] |
| `tickets` | `status` | status filter [Phase 13] |
| `tickets` | `assigned_to` | staff assignment list [Phase 13] |
| `tickets` | `category_id` | category filter [Phase 13] |
| `ticket_messages` | `ticket_id` | message thread lookup [Phase 13] |
| `ticket_messages` | `sender_id` | FK join [Phase 13] |

---

## Enums

| Enum | Values |
|------|--------|
| `PoliciesType` | `PDPA`, `TERMSERVICE` |
| `PromotionType` | `DISCOUNT`, `PERCENT` |
| `OrderStatus` | `PENDING`, `PAID`, `CANCEL`, `EXPIRE` |
| `PaymentMethod` | `SLIP`, `PROMPTPAY`, `TRUEMONEY` |
| `TxStatus` | `PENDING`, `SUCCESSFUL`, `REJECT` |
| `IpType` | `PUBLIC`, `PRIVATE` |
| `OAuthProvider` | `GOOGLE`, `DISCORD`, `FACEBOOK` |
| `UpgradeType` | `PACKAGE`, `CUSTOM` |
| `NatProtocol` | `TCP`, `UDP`, `BOTH` |
| `BroadcastType` | `MAINTENANCE`, `EMERGENCY`, `ANNOUNCEMENT` |
| `BroadcastTarget` | `ALL`, `ACTIVE_VPS`, `EXPIRING_SOON` |
| `AuditAction` | `CREATE`, `UPDATE`, `ENABLE`, `DISABLE`, `APPROVE`, `REJECT`, `CANCEL`, `START`, `STOP`, `REBOOT`, `EXPIRE`, `ROLE_CHANGE`, `BROADCAST`, `UPGRADE`, `ASSIGN`, `REPLY`, `BYPASS` |
| `AuditEntity` | `USER`, `VPS`, `ORDER`, `TRANSACTION`, `PACKAGE`, `OS_TEMPLATE`, `VM_SPEC`, `PROMOTION`, `POLICY`, `IP_POOL`, `SYSTEM_CONFIG`, `EMAIL_BROADCAST`, `VPS_UPGRADE`, `PACKAGE_CATEGORY`, `EMAIL_TEMPLATE`, `TICKET`, `TICKET_CATEGORY`, `CAPACITY_CHECK` |
| `EmailTemplateType` | `VERIFICATION`, `EXPIRY_WARNING`, `EXPIRED`, `FORCE_DELETED`, `AUTO_RENEWAL_REMINDER`, `BROADCAST_MAINTENANCE`, `BROADCAST_EMERGENCY`, `BROADCAST_ANNOUNCEMENT`, `WELCOME`, `TICKET_REPLY` (P13), `TICKET_CLOSED` (P13) |
| `TicketStatus` | `OPEN`, `IN_PROGRESS`, `WAITING_USER`, `RESOLVED`, `CLOSED` |
| `TicketPriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
