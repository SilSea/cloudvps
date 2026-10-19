# CloudVPS Frontend — UI Requirements

Reference: Feature.md (F1–F13), Spec.md (routes/components), Backend Requirement.md (API contract)

---

## 1. Authentication & Session (F1)

### 1.1 Functional Requirements

- REQ-F1.1: User shall be able to log in with Email + Password via the login page.
- REQ-F1.2: On successful login, the system shall redirect the user to their role-appropriate home page.
- REQ-F1.3: User shall be able to register a new account with email, password, first name, and last name.
- REQ-F1.4: During registration, the system shall display all active PDPA and Terms of Service policies and require explicit acceptance before proceeding.
- REQ-F1.5: After registration, the system shall show a message instructing the user to verify their email.
- REQ-F1.6: The verify email page (`/verify/[token]`) shall call the backend verify endpoint and show success/failure feedback.
- REQ-F1.7: The system shall silently refresh the access token when it expires (≤15 min) using the refresh token.
- REQ-F1.8: On refresh token expiry (7 days), the system shall redirect to login and clear the session.
- REQ-F1.9: The logout button shall call `POST /api/auth/logout` (backend) then clear the NextAuth session.
- REQ-F1.10: All protected routes shall redirect unauthenticated users to `/login`.
- REQ-F1.11: Users with the wrong role accessing a restricted route shall be redirected to their own role home.

### 1.2 UI Requirements

- REQ-F1.UI.1: Login form shall show inline validation errors (email format, required fields).
- REQ-F1.UI.2: Login form shall show a toast on failed login (wrong credentials, account disabled).
- REQ-F1.UI.3: Register form shall show real-time password strength indicator.
- REQ-F1.UI.4: PDPA/ToS consent modal shall require the user to scroll to the bottom before enabling the accept button.
- REQ-F1.UI.5: Loading states shall be shown during auth API calls.

---

## 2. Account Management (F2)

### 2.1 Functional Requirements

- REQ-F2.1: User shall be able to view their own profile (name, email, phone, address).
- REQ-F2.2: User shall be able to update personal info (first_name, last_name, phone, address).
- REQ-F2.3: User shall be able to change their password (requires current password confirmation).
- REQ-F2.4: User shall be able to request email change (backend sends re-verification email).
- REQ-F2.5: ADMIN/SUPPORT shall be able to list all users with search, role filter, and pagination.
- REQ-F2.6: ADMIN shall be able to toggle user active status (enable/disable).
- REQ-F2.7: ADMIN shall be able to change a user's role.
- REQ-F2.8: SUPPORT shall be able to view and edit user info (cannot change role).

---

## 3. Package Management (F3 / F13)

### 3.1 Functional Requirements

- REQ-F3.1: Public users shall be able to browse all active packages on `/packages`.
- REQ-F3.2: Packages shall be filterable by category (active categories from `GET /api/packages/categories`).
- REQ-F3.3: Each package card shall display: name, OS, CPU cores, RAM (GiB), Disk (GB), price/period, IP type (Public/Private+NAT).
- REQ-F3.4: Selecting a package shall redirect to `/billing/orders/new?packageId=X` to create an order.
- REQ-F3.5: ADMIN shall be able to create/edit/toggle packages, OS templates, VM specs, and categories via the admin panel.
- REQ-F3.6: Package picker in order creation (`/billing/orders/new`) shall display packages where `available === false` as grayed-out/disabled with badge "ทรัพยากรไม่เพียงพอ". User cannot select them.
- REQ-F3.7: Order creation submit button shall be disabled (with warning text) if the selected package has `available === false`. Prevents bypass via direct URL `?packageId=X`.
- REQ-F3.8 *(2026-07-01)*: When multiple packages share identical spec (`vm_id`, `price`, `period`, `port_count`, `category_id`) but differ only by `os_id`, the package picker in order creation shall group them into a single card and let the user choose OS via a dropdown, instead of listing one row per OS. Implemented entirely in the frontend (spec-key grouping); requires no backend or DB changes, but does require Admin to create one package row per OS variant with matching spec fields.
- REQ-F3.9 *(2026-07-02)*: The admin package list (`/admin/packages`) shall display and manage packages grouped by spec-key (same grouping rule as REQ-F3.8), instead of one row per `Package` DB record. Admin creates a group by entering the spec once (name, VM spec, price, period, port count, category, status) and selecting one or more OS templates — the frontend fires one `POST /api/packages` per selected OS. Editing a group updates the shared spec on all existing variant rows and diffs the OS selection: newly checked OS templates are created, unchecked ones are deleted, unchanged ones are updated in place (`os_id` untouched). Deleting a group deletes every variant row in it. Implemented entirely in the frontend (`src/lib/packageGroup.ts`, shared with REQ-F3.8's order picker) — no backend/DB changes; each OS-variant request is independent (`Promise.allSettled`), so partial failure (e.g. one OS create fails) is reported to the admin rather than silently dropped.

---

## 4. PDPA & Terms of Service (F4)

### 4.1 Functional Requirements

- REQ-F4.1: The registration flow shall fetch active policies and render them in a consent modal.
- REQ-F4.2: On login, if a newer policy version exists (backend returns flag), the system shall show a re-acceptance modal before allowing access.
- REQ-F4.3: User shall be able to view their consent history on the profile page.
- REQ-F4.4: ADMIN shall be able to create new policy versions and toggle status.

---

## 5. VPS Management (F5)

### 5.1 Functional Requirements

- REQ-F5.1: User shall see their VPS list on `/vps` with status badge (RUNNING/STOPPED/PROVISIONING/EXPIRED).
- REQ-F5.2: User shall be able to Start, Stop, and Reboot their VPS from the VPS detail page.
- REQ-F5.3: VPS detail page shall show: VM name, OS, IP address, CPU/RAM/Disk specs, expiry date, auto-renew toggle.
- REQ-F5.4: User shall be able to toggle auto-renew and optionally lock a promo code for auto-renewal.
- REQ-F5.5: User shall be able to manually renew a VPS (creates a new renewal order).
- REQ-F5.6: For Private IP VPS (`port_count > 0`), the VPS detail page shall show the NAT port block and port rules table.
- REQ-F5.7: User shall be able to add port rules (private_port + protocol) and delete non-system rules.
- REQ-F5.8: ADMIN shall see all VPS. SUPPORT shall see all VPS (read + ops).
- REQ-F5.9: ADMIN shall have a "Force Delete" button for any VPS.
- REQ-F5.10: Expiring VPS (≤3 days) shall show a warning banner on the VPS card/detail.

---

## 6. Orders & Payment (F6 / F10)

### 6.1 Functional Requirements

- REQ-F6.1: User shall be able to create an order by selecting a package and optionally entering a promo code.
- REQ-F6.2: The order creation form shall validate the promo code via `POST /api/promotions/validate` before submitting.
- REQ-F6.3: Order detail page shall show the final amount, payment method selection, and payment submission form.
- REQ-F6.4: Payment methods:
  - **TRUEMONEY**: input field for Angpao voucher code.
  - **SLIP**: bank account info (name/number/holder) + file upload → submit.
  - **PROMPTPAY**: show QR code image, then upload slip for manual approval.
  - Both SLIP and PROMPTPAY are shown/hidden per REQ-F6.12 depending on whether admin has configured the corresponding `system_configs` keys.
- REQ-F6.5: Slip file upload shall be limited to 5MB (image/png or image/jpeg), validated client-side before upload.
- REQ-F6.6: User shall see order status: PENDING, PAID, CANCELLED, EXPIRED.
- REQ-F6.7: User shall see transaction status: PENDING, SUCCESSFUL, FAILED, REJECTED.
- REQ-F6.8: ADMIN/SUPPORT shall be able to approve or reject PROMPTPAY transactions.
- REQ-F6.9: ADMIN shall be able to create/edit/toggle promotions.
- REQ-F6.10 *(superseded 2026-07-02, see F6.10a)*: ~~Upgrade orders (F12) shall not have a cancel button visible to USER.~~
- REQ-F6.10a *(2026-07-02)*: A PENDING upgrade order (F12) shall show the same cancel button as any other PENDING order. The backend only rejects cancellation (`CANNOT_CANCEL_UPGRADE`, 403) once the upgrade has actually been applied — the frontend does not need to special-case upgrade orders when deciding whether to show the button, only `status === "PENDING"`.
- REQ-F6.11 *(2026-07-01)*: Order detail page (`/billing/orders/[orderId]`) shall display: an enlarged status badge in the top-right corner, a full package spec card (OS, vCPU, RAM, Disk, Network type, period), full price, discount amount (shown as ฿0 when no promotion applied, never hidden), and final amount.
- REQ-F6.12 *(2026-07-02)*: PromptPay number and bank account (name/number/holder) shall be fetched from `GET /api/system-configs/payment-info` (any authenticated role) rather than a frontend env var. A payment method whose config is unset (`promptpay_id === null` or `bank === null`) shall be hidden from the payment method tabs entirely, not shown empty/broken.
- REQ-F6.13 *(2026-07-02)*: Order detail page shall read `order.transactions` (newest first) and, when the latest transaction is `PENDING` (only possible for PROMPTPAY, awaiting ADMIN/SUPPORT manual approval), show an "awaiting review" banner instead of re-showing the payment method form. When the latest transaction is `REJECT`, show a "resubmit" notice above the payment form.
- REQ-F6.14 *(2026-07-02)*: For an UPGRADE-type order (`order.upgrade_vps_id != null`), the order detail page shall show the actual before/after spec + prorated price breakdown (via the matching `vps_upgrade_logs` entry) instead of the generic package-spec card. For CUSTOM-type upgrades specifically, the generic package-spec card is hidden entirely (it would show the VPS's *old*, pre-upgrade package — there is no "new package" row for a custom spec change).

---

## 7. VM Upgrade (F12)

### 7.1 Functional Requirements

- REQ-F12.1: VPS detail page shall have an "Upgrade" section showing two modes: Package Switch and Custom Resource.
- REQ-F12.2: Package Switch mode shall show available packages and calculated pro-rate charge for remaining days.
- REQ-F12.7: Upgrade package picker shall show packages where `available === false` as disabled with badge "ทรัพยากรไม่เพียงพอ". Upgrade button shall be disabled if selected package is unavailable.
- REQ-F12.3: Custom Resource mode shall show sliders/inputs for cores, RAM (GiB), disk (GB) with unit prices.
- REQ-F12.4: If upgrade amount = 0 (free downgrade), the system shall show "No charge — apply immediately".
- REQ-F12.5: If upgrade amount > 0, creating the upgrade creates a PENDING order → user pays → upgrade applied.
- REQ-F12.6: User shall be able to view upgrade history for their VPS.
- REQ-F12.8 *(2026-07-02)*: Custom Resource mode shall show a live cost preview (per-resource + total, prorated by days remaining) as the user types, computed client-side from `GET /api/system-configs/pricing` using the same formula as the backend. Disk cannot shrink for any role — the form shall block submission and show an inline message rather than let the backend reject with `DISK_SHRINK_NOT_ALLOWED`. Below-current CPU/RAM is additionally blocked unless the caller has downgrade permission (Admin/Support).

---

## 8. System Config & Health (F8) — Admin Only

### 8.1 Functional Requirements

- REQ-F8.1: ADMIN shall see all system config keys with values masked as `***` for secrets.
- REQ-F8.2: ADMIN shall be able to update config values via an edit form.
- REQ-F8.3: Setting a value to empty shall reset to env-var fallback (show placeholder).
- REQ-F8.4: Admin dashboard shall display a System Health card showing real-time status of DB, Redis, and Proxmox connections with latency (ms). Auto-refreshes every 30 seconds.
- REQ-F8.5: System Health card shall show overall status badge ("ปกติ" / "มีปัญหา") and a manual refresh button.
- REQ-F8.6: `GET /api/system/capacity` (ADMIN/SUPPORT) returns Proxmox node resource snapshot: `NodeSnapshot` with RAM, CPU, disk totals, reserved, and effective free values. Service: `SystemService.getCapacity(token)`.

---

## 9. Email Broadcast (F9) — Admin Only

### 9.1 Functional Requirements

- REQ-F9.1: ADMIN shall be able to select event type (MAINTENANCE, EMERGENCY, ANNOUNCEMENT), target scope (ALL, ACTIVE_VPS, EXPIRING_SOON), subject, and body.
- REQ-F9.2: ADMIN shall see broadcast history with sent_count and failed_count.

---

## 10. Global UI Requirements

- REQ-G1: All pages shall be **Mobile-First** and responsive (breakpoints: sm/md/lg/xl).
- REQ-G2: All interactive elements shall have visible focus states for keyboard navigation.
- REQ-G3: All API error responses shall be shown as toast notifications (not silently swallowed).
- REQ-G4: All data-loading states shall show skeleton loaders or spinners.
- REQ-G5: All empty states shall show a descriptive empty state component (icon + message + CTA if applicable).
- REQ-G6: All destructive actions (delete, disable, force delete VPS) shall show a confirmation dialog before proceeding.
- REQ-G7: Dates shall be displayed in `Asia/Bangkok` timezone.
- REQ-G8: Currency shall be displayed in Thai Baht (฿) format.
- REQ-G9: The app shall not expose backend error stack traces to the user.
- REQ-G10: `NEXT_PUBLIC_API_URL` must never be hardcoded; always read from env.

---

*Backend API endpoints: [cloudvps-backend/docs/Requirement.md](../../cloudvps-backend/docs/Requirement.md)*
