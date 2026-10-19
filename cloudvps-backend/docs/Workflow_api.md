# CloudVPS Backend — API Workflow Documentation

**อัพเดตล่าสุด:** 2026-05-19 (Phase 8 — Complete ✅)
**Phase ปัจจุบัน:** Phase 6 In Progress 🔧 | Phase 8 ✅ | Phase 9 ✅

---

## ภาพรวม Middleware Pipeline

ทุก request ผ่าน pipeline นี้ตามลำดับ:

```
Request
  → CORS (origin whitelist)
  → onError handler (VALIDATION → 400, NOT_FOUND → 404, else → 500)
  → GET /health  [ออกที่นี่ถ้า path ตรง — async deep check: DB + Redis + Proxmox]
  → authMiddleware (derive user: AuthUser | null จาก Bearer token)
  → /api group
      → Rate Limit (ตาม route group)
      → RBAC guard (requireAuth / requireRoles)
      → Controller handler
```

### Auth Middleware — ลำดับการทำงาน

```
1. อ่าน Authorization header
2. ไม่มี "Bearer " prefix → user = null (ผ่าน — public routes ไม่ถูก block)
3. verifyAccess(token) → fail → user = null + log error
4. payload.type !== "access" → user = null
5. ตรวจ Redis blocklist "token_block:{token}" — ถ้า hit → user = null (AUTH-SEC-1)
6. ตรวจ Redis cache "user_status:{id}" (TTL 30s)
   - cache hit  → ใช้ค่าที่ cache
   - cache miss → query DB → set cache
   - Redis/DB error → fail open (user ผ่านได้ถ้า JWT valid)
7. status = false → user = null
8. inject user: AuthUser ใน context
```

### Rate Limit

| กลุ่ม | limit | window | keyPrefix | เส้นทาง |
|---|---|---|---|---|
| auth (ทั่วไป) | 10 req | 60s | `auth` | `/api/auth/*` |
| login (เฉพาะ) | 5 req | 900s (15 min) | `login` | `POST /api/auth/login` |
| payment | 5 req | 60s | `payment` | `POST /api/transactions` |
| vps actions | 10 req | 60s | `vps` | `POST /api/vps/:id/start\|stop\|reboot\|renew`, `PATCH /api/vps/:id/auto-renew` |
| vps provision | 10 req | 60s | `vps_provision` | `POST /api/vps/provision/:orderId` |
| broadcast | 5 req | 3600s (1h) | `broadcast` | `POST /api/broadcasts` |

---

## Module 1 — Auth (`/api/auth`)

### POST /api/auth/register

**Access:** Public  
**Rate limit:** 10/min

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "first_name": "สมชาย",
  "last_name": "ใจดี",
  "phone": "0812345678",
  "address1": "123/45 ถ.สุขุมวิท",
  "address2": "ห้อง 101",
  "address3": "แขวงคลองเตย",
  "address4": "เขตคลองเตย",
  "address5": "10110",
  "address6": "กรุงเทพมหานคร",
  "policy_ids": [1, 2]
}
```

**Business logic:**
1. ตรวจ email ซ้ำ → 409 ถ้าซ้ำ
2. ดึง active policies → ตรวจว่า `policy_ids` ครอบคลุมทุก active policy → 400 ถ้าขาด
3. หา role `"users"` จาก DB
4. `hashPassword()` bcrypt cost 10
5. `prisma.$transaction` → สร้าง `users` + `users_info` + `consents` พร้อมกัน
6. `signEmailVerify()` → `sendVerification()` (fire, ถ้า email fail → log เท่านั้น ไม่ rollback)
7. log: `logger.auth("register", ...)`

**Success:** `201`
```json
{ "success": true, "message": "Registration successful. Please verify your email." }
```

**Errors:**
| code | message |
|---|---|
| 400 | You must accept all active policies. |
| 409 | Email already registered. |
| 500 | Server configuration error. (roles ไม่ถูก seed) |

---

### POST /api/auth/login

**Access:** Public  
**Rate limit:** 10/min (auth) + 5/15min (login)

**Request body:**
```json
{ "email": "user@example.com", "password": "mypassword" }
```

**Business logic:**
1. `findUnique` by email (include role)
2. ไม่พบ user → 401 (same message กับ wrong password เพื่อกัน user enumeration)
3. `status = false` → 403
4. `verifyPassword()` → 401 ถ้า wrong
5. `Promise.all([signAccess(), signRefresh()])` — parallel
6. `redis.setex("rt:{userId}", 604800, refreshToken)` — overwrite single session
7. ดึง active policies → เทียบกับ consents ของ user → คำนวณ `pending_policy_ids`
8. log: `logger.auth("login_success", ...)`

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "user": { "id": 1, "email": "...", "role": "users", "is_verify": true },
    "pending_policy_ids": []
  }
}
```

> `pending_policy_ids` ไม่ว่าง → frontend ต้อง prompt ให้ user ยอมรับ policy ใหม่ก่อนดำเนินการต่อ

**Errors:**
| code | message |
|---|---|
| 401 | Invalid email or password. |
| 403 | Your account has been disabled. |

---

### POST /api/auth/refresh

**Access:** Public

**Request body:**
```json
{ "refresh_token": "eyJ..." }
```

**Business logic:**
1. `verifyRefresh(token)` → 401 ถ้า invalid/expired
2. ดึง `redis.get("rt:{userId}")` → เทียบ token ต้องตรงกัน (single session)
3. `signAccess()` → return access token ใหม่

**Success:** `200`
```json
{ "success": true, "data": { "access_token": "eyJ..." } }
```

**Errors:**
| code | message |
|---|---|
| 401 | Invalid or expired refresh token. |

---

### GET /api/auth/verify/:token

**Access:** Public

**Business logic:**
1. `verifyAccess(token)` → 400 ถ้า invalid
2. `payload.type !== "email_verify"` → 400
3. `prisma.users.update({ is_verify: true })`
4. log: `logger.auth("email_verified", ...)`

**Success:** `200`
```json
{ "success": true, "message": "Email verified successfully." }
```

---

### POST /api/auth/logout

**Access:** Authenticated (requireAuth)

**Business logic:**
1. `redis.del("rt:{userId}")` — invalidate refresh token ทันที
2. decode access token payload → คำนวณ TTL ที่เหลือ → `redis.set("token_block:{token}", "1", EX, ttl)` — blocklist จนกว่า token จะ expire ตามธรรมชาติ (AUTH-SEC-1 fix)
3. log: `logger.auth("logout", ...)`

**Success:** `200`
```json
{ "success": true, "message": "Logged out successfully." }
```

---

### GET /api/auth/me

**Access:** Authenticated (requireAuth)

**Business logic:**
1. `prisma.users.findUnique` by `user.id` (include role)
2. return AuthUser shape

**Success:** `200`
```json
{
  "success": true,
  "data": { "id": 1, "email": "...", "role": "users", "status": true, "is_verify": true }
}
```

---

## Module 2 — Users (`/api/users`)

### GET /api/users/me

**Access:** Authenticated (requireAuth)

**Business logic:**
1. query `users` + join `users_info` + `role` by `user.id`

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "id": 1, "email": "...", "status": true, "is_verify": true, "created_at": "...",
    "role": { "role_name": "users" },
    "users_info": { "first_name": "สมชาย", "last_name": "ใจดี", "phone": "...", ... }
  }
}
```

---

### PUT /api/users/me

**Access:** Authenticated (requireAuth)

**Request body:** (ทุก field เป็น optional)
```json
{
  "first_name": "สมหญิง",
  "phone": "0898765432"
}
```

**Business logic:**
1. destructure + filter `undefined` fields (whitelist ป้องกัน mass assignment)
2. `prisma.users_info.update` where `user_id = user.id`

**Success:** `200` — คืน users_info ที่อัพเดตแล้ว

---

### PUT /api/users/me/password

**Access:** Authenticated (requireAuth)

**Request body:**
```json
{ "current_password": "oldpass", "new_password": "newpass123" }
```

**Business logic:**
1. `findUnique` — ตรวจว่ามี password (OAuth account ไม่มี) → 400 ถ้าไม่มี
2. `verifyPassword(current_password, hash)` → 401 ถ้าผิด
3. `hashPassword(new_password)` → `users.update`

**Success:** `200`
```json
{ "success": true, "message": "Password changed successfully." }
```

---

### PUT /api/users/me/email

**Access:** Authenticated (requireAuth)

**Request body:**
```json
{ "email": "newemail@example.com" }
```

**Business logic:**
1. ตรวจ email ซ้ำ → 409 ถ้าซ้ำ
2. `users.update({ email, is_verify: false })`
3. `redis.del("rt:{userId}")` — force re-login
4. `signEmailVerify()` → `sendVerification()` ไปยัง email ใหม่

**Success:** `200`
```json
{ "success": true, "message": "Email updated. Please verify your new email address. You have been logged out." }
```

---

### GET /api/users

**Access:** ADMIN, SUPPORT  
**Query params:** `page` (default 1), `limit` (default 20, max 100)

**Business logic:**
1. `Promise.all([findMany, count])` — parallel
2. return paginated list (ไม่รวม password, users_info)

**Success:** `200`
```json
{
  "success": true,
  "data": { "users": [...], "total": 42, "page": 1, "limit": 20 }
}
```

---

### GET /api/users/:id

**Access:** ADMIN, SUPPORT

**Business logic:**
1. `parseInt(id)` + `isNaN` check → 400 ถ้า invalid
2. `findUnique` include role + users_info → 404 ถ้าไม่พบ

**Success:** `200` — profile เต็ม (เหมือน GET /me)

---

### PUT /api/users/:id

**Access:** ADMIN, SUPPORT

**Request body:** เหมือน PUT /me (optional fields)

**Business logic:**
1. validate id
2. whitelist fields → `users_info.update` where `user_id = id`

---

### PATCH /api/users/:id/status

**Access:** ADMIN  
**Audit:** DISABLE / ENABLE USER (fire-and-forget)

**Business logic:**
1. validate id
2. `findUnique({ status })` → 404 ถ้าไม่พบ
3. `users.update({ status: !current })` 
4. `redis.del("user_status:{id}")` — invalidate cache ทันที

**Success:** `200`
```json
{ "success": true, "data": { "id": 1, "email": "...", "status": false } }
```

---

### PATCH /api/users/:id/role

**Access:** ADMIN  
**Audit:** ROLE_CHANGE USER (fire-and-forget)

**Request body:**
```json
{ "role_name": "support" }
```
> ค่าที่ valid: `"admin"` | `"support"` | `"users"`

**Business logic:**
1. validate id
2. `roles.findFirst({ role_name })` → 400 ถ้าไม่พบ
3. `users.update({ role_id })`

**Success:** `200`
```json
{ "success": true, "data": { "id": 1, "email": "...", "role": { "role_name": "support" } } }
```

---

## Module 3 — Policies (`/api/policies`)

### GET /api/policies/active

**Access:** Public

**Business logic:**
1. `policies.findMany({ status: true })` order by type asc, created_at desc
2. return id, title, type, version, detail

**Success:** `200`

---

### GET /api/policies

**Access:** ADMIN

**Business logic:**
1. `policies.findMany()` — ทุก version ทุก status
2. order by type asc, version desc

**Success:** `200`

---

### POST /api/policies

**Access:** ADMIN  
**Audit:** CREATE POLICY (fire-and-forget)

**Request body:**
```json
{
  "policie_title": "นโยบายความเป็นส่วนตัว v2",
  "policies_detail": "เนื้อหา...",
  "policies_type": "PDPA",
  "version": "2.0"
}
```

**Business logic:**
1. `policies.create({ ...body, status: true })`
2. `auditService.record({ action: "CREATE", entity: "POLICY", ... })`

**Success:** `201`

---

### PUT /api/policies/:id

**Access:** ADMIN  
**Audit:** UPDATE POLICY

**Request body:** (optional fields)
```json
{ "policie_title": "ชื่อใหม่", "version": "2.1" }
```

**Business logic:**
1. validate id → `findUnique` → 404 ถ้าไม่พบ
2. `policies.update(filtered fields)`
3. audit record

---

### PATCH /api/policies/:id/status

**Access:** ADMIN  
**Audit:** ENABLE / DISABLE POLICY

**Business logic:**
1. validate id → `findUnique({ status })` → 404 ถ้าไม่พบ
2. `policies.update({ status: !current })`
3. audit record — action ตาม new status (`ENABLE` ถ้า status ใหม่ = true)

> ⚠️ การ toggle policy เป็น active จะทำให้ user ที่ login ครั้งถัดไปเห็น `pending_policy_ids`

---

### POST /api/policies/consents

**Access:** Authenticated (requireAuth)

**Request body:**
```json
{ "policy_id": 1 }
```

**Business logic:**
1. `policies.findUnique` → 400 ถ้าไม่พบหรือ status = false
2. `consents.findFirst` ตรวจซ้ำ → **409** ถ้า consent นั้นมีแล้ว
3. `consents.create` → log: `logger.auth("consent_accepted", ...)`

**Success:** `201`

**Errors:**
| code | message |
|---|---|
| 400 | Policy not found / Policy is not active |
| 409 | Consent already accepted. |

---

### GET /api/policies/consents/me

**Access:** Authenticated (requireAuth)

**Business logic:**
1. `consents.findMany({ users_id })` include policy title/type/version
2. order by accepted_at desc

**Success:** `200`

---

## Module 4 — Packages (`/api/packages`, `/os`, `/vm`)

### GET /api/packages

**Access:** Public

**Business logic:**
1. `packages.findMany({ status: true })` include os + vm
2. Fetch `capacityService.getSnapshot()` (Redis cache 30 s) — fail open if Proxmox unreachable
3. Each package annotated with `available: boolean` — `true` if node has sufficient RAM + disk, `false` otherwise; always `true` if snapshot unavailable or `capacity.check_enabled=false`

**Success:** `200`
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Starter", "price": 299, "available": true, "vm": { ... }, "os": { ... } },
    { "id": 2, "name": "Pro",     "price": 599, "available": false, "vm": { ... }, "os": { ... } }
  ]
}
```

---

### GET /api/packages/:id

**Access:** Public

**Business logic:**
1. validate id → `packages.findUnique` include os + vm → 404 ถ้าไม่พบ

**Success:** `200`

---

### POST /api/packages

**Access:** ADMIN  
**Audit:** CREATE PACKAGE

**Request body:**
```json
{ "name": "Basic VPS", "description": "...", "price": 299, "period": 30, "os_id": 1, "vm_id": 1 }
```

**Business logic:**
1. ตรวจ os_id และ vm_id ว่ามีใน DB
2. `packages.create`
3. audit record

**Success:** `201`

---

### PUT /api/packages/:id

**Access:** ADMIN  
**Audit:** UPDATE PACKAGE

**Request body:** (optional fields — price, period, name, description, os_id, vm_id)

---

### PATCH /api/packages/:id/status

**Access:** ADMIN  
**Audit:** ENABLE / DISABLE PACKAGE

---

### GET /api/packages/os

**Access:** ADMIN

---

### POST /api/packages/os

**Access:** ADMIN  
**Audit:** CREATE OS_TEMPLATE

**Request body:**
```json
{ "os_name": "Ubuntu", "os_version": "22.04 LTS", "vmid": 21024 }
```

---

### PUT /api/packages/os/:id

**Access:** ADMIN  
**Audit:** UPDATE OS_TEMPLATE

---

### GET /api/packages/vm

**Access:** ADMIN

---

### POST /api/packages/vm

**Access:** ADMIN  
**Audit:** CREATE VM_SPEC

**Request body:**
```json
{ "core": 2, "memory": "4GB", "size": "40GB" }
```

---

### PUT /api/packages/vm/:id

**Access:** ADMIN  
**Audit:** UPDATE VM_SPEC

---

## Module 5 — Promotions (`/api/promotions`)

### POST /api/promotions/validate

**Access:** Authenticated (requireAuth)

**Request body:**
```json
{ "code": "NEWUSER50" }
```

**Business logic:**
1. `promotions.findUnique({ code_name })` → 400 ถ้าไม่พบ
2. `status = false` → 400
3. `expired_at < now` → 400
4. return promotion detail

**Success:** `200`
```json
{
  "success": true,
  "data": { "id": 1, "code_name": "NEWUSER50", "type": "PERCENT", "discount": 10, "description": "..." }
}
```

---

### GET /api/promotions

**Access:** ADMIN

**Business logic:**
1. `promotions.findMany()` order by created_at desc

---

### POST /api/promotions

**Access:** ADMIN  
**Audit:** CREATE PROMOTION

**Request body:**
```json
{
  "code_name": "SAVE100",
  "description": "ลด 100 บาท",
  "type": "DISCOUNT",
  "discount": 100,
  "expired_at": "2026-12-31T23:59:59Z"
}
```

**Business logic:**
1. `promotions.findUnique({ code_name })` → **409** ถ้า code ซ้ำ
2. `promotions.create({ status: true, ... })`
3. audit record

**Success:** `201`

---

### PUT /api/promotions/:id

**Access:** ADMIN  
**Audit:** UPDATE PROMOTION

**Request body:** (optional fields — code_name, description, type, discount, expired_at)

> `expired_at: null` — ลบวันหมดอายุ (promo ไม่มีวันหมดอายุ)

---

### PATCH /api/promotions/:id/status

**Access:** ADMIN  
**Audit:** ENABLE / DISABLE PROMOTION

---

## Module 6 — Orders (`/api/orders`)

### POST /api/orders

**Access:** Authenticated (requireAuth)

**Request body:**
```json
{ "package_id": 1, "promo_code": "SAVE100", "force": false }
```
`force` — optional boolean, ADMIN only. Bypasses capacity check (e.g., manual override). Ignored for USER/SUPPORT.

**Business logic:**
1. `packages.findUnique({ status: true })` → 404 ถ้าไม่พบ / 400 ถ้า inactive
2. Capacity check (Phase 14) — `capacityService.check(packageId, force, userId, userRole)` → 409 ถ้าทรัพยากรไม่พอ; skipped if `capacity.check_enabled=false`, Proxmox unreachable, or renewal order
3. ถ้ามี `promo_code` → ตรวจ status + expired_at → คำนวณ `finalAmount` (DISCOUNT = ลดแบบ flat, PERCENT = ลด %)
4. `Math.round(finalAmount)` — amount เป็น Int, คำนวณ server-side เสมอ (SEC-6.6)
5. `orders.create({ ref_no: "QC-YYYYMMDD-XXXXXX", status: PENDING, expired_at: now+24h })`

**Success:** `201`
```json
{
  "success": true,
  "data": { "id": 1, "ref_no": "QC-20260501-A1B2C3", "amount": 299, "status": "PENDING", ... }
}
```

**Errors:**
| code | message |
|---|---|
| 400 | Package is not available. / Invalid or inactive promotion code. / Promotion code has expired. |
| 404 | Package not found. |
| 409 `INSUFFICIENT_RESOURCES` | Node RAM/disk insufficient — response includes `detail: { required_ram_mb, available_ram_mb, required_disk_gb, available_disk_gb }` |

---

### GET /api/orders

**Access:** Authenticated (requireAuth)  
**Query params:** `page`, `limit`

**Business logic:**
1. USER → `where: { users_id }` — เห็นเฉพาะของตัวเอง
2. ADMIN / SUPPORT → `where: {}` — เห็นทั้งหมด
3. include package (name, price, period) + promotion

**Success:** `200`
```json
{ "success": true, "data": { "orders": [...], "total": 10, "page": 1, "limit": 20 } }
```

---

### GET /api/orders/:id

**Access:** Authenticated (requireAuth)

**Business logic:**
1. `orders.findUnique` include package, promotion, transactions
2. USER ที่ไม่ใช่เจ้าของ → 403

---

### PATCH /api/orders/:id/cancel

**Access:** Authenticated (requireAuth)  
**Audit:** CANCEL ORDER (เฉพาะ ADMIN/SUPPORT ที่ cancel แทน user)

**Business logic:**
1. ตรวจ ownership (USER ต้องเป็นเจ้าของ)
2. Upgrade order (`upgrade_vps_id != null`) ที่ PAID แล้ว → 403 `CANNOT_CANCEL_UPGRADE` (upgrade ถูก apply กับ VPS ไปแล้ว ย้อนกลับไม่ได้)
3. ตรวจ status: PAID → 400, CANCEL → 400, EXPIRE → 400
4. `orders.update({ status: CANCEL })` — ถ้าเป็น upgrade order ที่ยัง PENDING จะ mark `vps_upgrade_logs` เป็น failed (`fail_reason: "Cancelled by user"`) ใน transaction เดียวกัน
5. audit record ถ้า actor เป็น ADMIN หรือ SUPPORT

**Errors:**
| code | message |
|---|---|
| 400 | Cannot cancel a paid order. / Order is already cancelled. / Cannot cancel an expired order. |
| 403 | Access denied. / This upgrade has already been applied and cannot be cancelled. |
| 404 | Order not found. |

---

## Module 7 — Transactions (`/api/transactions`)

### POST /api/transactions

**Access:** Authenticated (requireAuth)  
**Rate limit:** 5 req/min (SEC-G9)

**Request body:**
```json
{
  "order_id": 1,
  "payment_method": "TRUEMONEY",
  "voucher_code": "ABCDEF123",
  "slip_image": null
}
```
> `voucher_code` — required สำหรับ TRUEMONEY  
> `slip_image` — required สำหรับ SLIP (base64 หรือ data URI, max 5MB) | optional สำหรับ PROMPTPAY

**Business logic:**
1. ตรวจ order ownership + status PENDING + ไม่ expired
2. ตรวจ SUCCESSFUL transaction ซ้ำ → 409 ถ้ามีแล้ว (SEC-6.4)
3. PROMPTPAY: ตรวจ PENDING transaction ซ้ำ → 409 ถ้ามี PENDING อยู่แล้ว (TX-DUP-1 fix)
4. ตาม payment_method:

| Method | ขั้นตอน |
|---|---|
| TRUEMONEY | `truemoneyService.redeem(voucherCode)` → URL: `POST {TRUEMONEY_API_URL}/{voucherCode}/redeem` body: `{mobile}` → ตรวจ amount ≥ order.amount → `$transaction` (create tx SUCCESSFUL + order PAID + temp_vps) |
| SLIP | validate size ≤ 5MB → `slipokService.verify(slipBase64, order.amount)` → SlipOK API: `POST /api/line/apikey/{branchId}` body: `{files, log: true, amount}` header: `x-authorization` → ตรวจ error codes (1013=AMOUNT_MISMATCH, 1012=DUPLICATE, 1014=WRONG_RECEIVER) → `$transaction` (create tx SUCCESSFUL + order PAID + temp_vps) |
| PROMPTPAY | create tx PENDING (slip_image optional, `slip_url: slipImage ?? null`) — รอ Admin/Support approve |

**Success:** `201`
```json
{ "success": true, "data": { "id": 1, "status": "SUCCESSFUL", "payment_method": "TRUEMONEY", ... } }
```

**Errors:**
| code | message |
|---|---|
| 400 | Order is not in pending state. / Amount mismatch. / Slip too large. |
| 402 | Payment verification failed. (พร้อม detail จาก provider) |
| 403 | Access denied. |
| 404 | Order not found. |
| 409 | Order already has a successful payment. |

---

### GET /api/transactions

**Access:** Authenticated (requireAuth)

**Business logic:**
1. USER → filter ผ่าน `order.users_id`
2. ADMIN/SUPPORT → เห็นทั้งหมด
3. include order (ref_no, users_id, status)

---

### PATCH /api/transactions/:id/approve

**Access:** ADMIN, SUPPORT  
**Audit:** APPROVE TRANSACTION

**Business logic:**
1. ตรวจ tx exists + status PENDING + payment_method PROMPTPAY
2. ตรวจ race condition: ไม่มี SUCCESSFUL tx อื่นสำหรับ order นี้
3. `$transaction` (tx → SUCCESSFUL + order → PAID + create temp_vps)
4. audit record: `{ payment_method, amount, order_ref }`

---

### PATCH /api/transactions/:id/reject

**Access:** ADMIN, SUPPORT  
**Audit:** REJECT TRANSACTION

**Request body:**
```json
{ "reason": "slip ไม่ชัด" }
```

**Business logic:**
1. ตรวจ tx exists + status PENDING + payment_method PROMPTPAY
2. `transactions.update({ status: REJECT })`
3. audit record: `{ reason, payment_method, amount, order_ref }`

---

## Audit Log Pattern

งาน write ทั้งหมดใน package/promotion/policy controllers เรียก `auditService.record()` แบบ **fire-and-forget**:

```
Controller completes main operation
  → auditService.record({ actorId, actorRole, action, entity, entityId, metadata, ipAddress })
      → prisma.admin_audit_logs.create()  [async, ไม่ await ใน main flow]
      → ถ้า fail → log error เท่านั้น (ไม่ throw, ไม่ rollback)
```

**Action mapping ทั้งหมด (Phase 1–4):**

| Controller | Action | Entity | Priority | Note |
|---|---|---|---|---|
| userController.toggleUserStatus | DISABLE / ENABLE | USER | P1 | |
| userController.changeUserRole | ROLE_CHANGE | USER | P1 | |
| transactionController.approve | APPROVE | TRANSACTION | P1 | |
| transactionController.reject | REJECT | TRANSACTION | P1 | |
| orderController.cancel (Admin) | CANCEL | ORDER | P1 | |
| vpsController.start | START | VPS | P2 | admin/support only — user self-service ไม่ audit |
| vpsController.stop | STOP | VPS | P2 | admin/support only |
| vpsController.reboot | REBOOT | VPS | P2 | admin/support only |
| packageController.toggleStatus | ENABLE / DISABLE | PACKAGE | P2 | |
| packageController.update | UPDATE | PACKAGE | P2 | |
| promotionController.toggleStatus | ENABLE / DISABLE | PROMOTION | P2 | |
| policyController.toggleStatus | ENABLE / DISABLE | POLICY | P3 | |
| packageController.create | CREATE | PACKAGE | P3 | |
| packageController.createOs | CREATE | OS_TEMPLATE | P3 | |
| packageController.updateOs | UPDATE | OS_TEMPLATE | P3 | |
| packageController.createVm | CREATE | VM_SPEC | P3 | |
| packageController.updateVm | UPDATE | VM_SPEC | P3 | |
| promotionController.create | CREATE | PROMOTION | P3 | |
| promotionController.update | UPDATE | PROMOTION | P3 | |
| policyController.create | CREATE | POLICY | P3 | |
| policyController.update | UPDATE | POLICY | P3 | |
| ipController.create | CREATE | IP_POOL | P3 | |
| ipController.update | UPDATE | IP_POOL | P3 | |
| ipController.toggleStatus | ENABLE / DISABLE | IP_POOL | P3 | |
| cronJob.stopExpiredVps | EXPIRE | VPS | system | fire-and-forget, actor = system (no actorId) — log only via `logger.vps` |
| cronJob.deleteExpiredVps | EXPIRE | VPS | system | grace period ended — log only via `logger.vps` |

---

---

## Module 8 — VPS (`/api/vps`)

### GET /api/vps

**Access:** Authenticated (requireAuth)  
**Query params:** `page` (default 1), `limit` (default 20, max 100)

**Business logic:**
1. USER → `where: { order: { users_id } }` — เห็นเฉพาะของตัวเอง
2. ADMIN/SUPPORT → `where: {}` — เห็นทั้งหมด
3. include order (ref_no, package name), ip_assignment (ip)

**Success:** `200`
```json
{
  "success": true,
  "data": { "vps": [...], "total": 5, "page": 1, "limit": 20 }
}
```

---

### GET /api/vps/queue

**Access:** ADMIN, SUPPORT

**Business logic:**
1. query `temp_vps.findMany()` ทั้งหมด — temp_vps ที่ยังอยู่หมายถึง provisioning pending/failed (ลบทิ้งอัตโนมัติหลัง provision สำเร็จ)
2. include order → package (os, vm), user (id, email)
3. return เรียง created_at asc (เก่าสุดก่อน)

**Success:** `200`
```json
{
  "success": true,
  "data": [
    {
      "id": 3,
      "order_id": 5,
      "created_at": "2026-05-02T10:00:00Z",
      "order": {
        "user": { "id": 2, "email": "user@example.com" },
        "package": { "name": "Basic VPS", "os": { "os_name": "Ubuntu", "vmid": 21024 }, "vm": { "core": 2, "memory": "4GB" } }
      }
    }
  ]
}
```

---

### GET /api/vps/:id

**Access:** Authenticated (requireAuth)

**Business logic:**
1. `parseInt(id)` + `isNaN` check → 400
2. `vps.findUnique` include ip_assignment → ip_pool, order → package, user
3. USER ที่ไม่ใช่เจ้าของ (order.users_id ≠ user.id) → 403
4. ADMIN/SUPPORT ผ่านได้ทุก VPS

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "id": 1, "name": "cloudvps-1", "vmid": 201,
    "status": true,
    "ip": "198.51.100.10",
    "created_at": "...", "expired_at": "...",
    "order": { "ref_no": "QC-...", "package": { "name": "Basic VPS" } },
    "live_status": { "status": "running", "cpu": 0.02, "mem": 524288000, "maxmem": 2147483648, "uptime": 3600 },
    "nat": null
  }
}
```

> `nat` field: `null` for Public IP VPS. For Private IP VPS with NAT, returns `{ nat_allocation: {...}, port_rules: [...] }` — same structure as `GET /api/vps/:id/port-rules`.

```json
```

---

### POST /api/vps/provision/:orderId

**Access:** ADMIN, SUPPORT

**Business logic:**
1. `parseInt(orderId)` + isNaN check → 400
2. เรียก `vpsService.provision(orderId)` แบบ **fire-and-forget** (ไม่ await) — non-blocking เหมือนกับ auto-provision หลัง payment
3. ตอบ 202 ทันที — ผล provision ดูได้จาก `GET /api/vps` หลัง provision เสร็จ

> ถ้า provision ล้มเหลว ดูได้จาก `GET /api/vps/queue` ว่า temp_vps ยังอยู่ และตรวจ logs/YYYY-MM-DD/vps.log

**Success:** `202`
```json
{ "success": true, "message": "Provisioning started." }
```

**Errors:**
| code | message |
|---|---|
| 400 | Invalid order ID. |

---

### POST /api/vps/:id/start

**Access:** Authenticated (requireAuth)  
**Audit:** START VPS (เฉพาะ ADMIN/SUPPORT — fire-and-forget)

**Business logic:**
1. `parseInt(id)` + isNaN → 400
2. `vps.findUnique` (include order.users_id) → 404 ถ้าไม่พบหรือ deleted_at มีค่า
3. USER ที่ไม่ใช่เจ้าของ (order.users_id ≠ user.id) → 403
4. `proxmox.startVm(vmid)` → pollTask(60s) → `vps.update({ status: true })`
5. Proxmox error → 502
6. audit ถ้า actor เป็น ADMIN หรือ SUPPORT: `{ action: START, entity: VPS, targetUserId: order.users_id }`

**Success:** `200`
```json
{ "success": true, "data": { "id": 1, "vmid": 10001, "status": "running" } }
```

**Errors:**
| code | message |
|---|---|
| 400 | Invalid VPS ID. |
| 403 | Access denied. |
| 404 | VPS not found. |
| 502 | Proxmox error. {detail} |

---

### POST /api/vps/:id/stop

**Access:** Authenticated (requireAuth)  
**Audit:** STOP VPS (เฉพาะ ADMIN/SUPPORT)

**Business logic:**
1. `parseInt(id)` + isNaN → 400
2. `vps.findUnique` → 404 ถ้าไม่พบหรือ deleted
3. USER ownership check → 403
4. `proxmox.stopVm(vmid)` (graceful shutdown) → pollTask(**120s**) → `vps.update({ status: false })` — timeout ขยายเป็น 120s (PROX-OBS-2 fix: graceful shutdown อาจใช้เวลา >60s)
5. Proxmox error → 502
6. audit ถ้า actor เป็น ADMIN หรือ SUPPORT

**Success:** `200`
```json
{ "success": true, "data": { "id": 1, "vmid": 10001, "status": "stopped" } }
```

**Errors:** เหมือน start

---

### POST /api/vps/:id/reboot

**Access:** Authenticated (requireAuth)  
**Audit:** REBOOT VPS (เฉพาะ ADMIN/SUPPORT)

**Business logic:**
1. `parseInt(id)` + isNaN → 400
2. `vps.findUnique` → 404 ถ้าไม่พบหรือ deleted
3. USER ownership check → 403
4. `proxmox.rebootVm(vmid)` → pollTask(60s)
5. Proxmox error → 502
6. audit ถ้า actor เป็น ADMIN หรือ SUPPORT

**Success:** `200`
```json
{ "success": true, "data": { "id": 1, "vmid": 10001, "status": "running" } }
```

**Errors:** เหมือน start

---

### POST /api/vps/:id/renew

**Access:** Authenticated (requireAuth)  
**Rate limit:** 10 req/min (vps group)

**Body (optional):**
```json
{ "promo_code": "SAVE10" }
```

**Business logic:**
1. `parseInt(id)` + isNaN → 400
2. `vpsService.getById(id)` — ตรวจ existence + ownership → 404 / 403
3. ดึง `vps.order.packages_id`
4. `orderService.create({ userId, packageId, renewalVpsId: id, promoCode? })` → สร้าง renewal order (status PENDING, `renewal_vps_id = id`)
5. F1 limit checks: `PROMO_LIMIT_REACHED` / `PROMO_USER_LIMIT_REACHED` → 409
6. return order — user ใช้ flow payment ปกติ (POST /api/transactions) เพื่อชำระ
7. เมื่อ transaction PAID/approved → `transaction.service` ตรวจ `order.renewal_vps_id` → เรียก `vpsService.renew()` แทน `provision()`

> VPS ที่ `deleted_at` มีค่าแล้ว (ลบถาวร) → `vpsService.getById()` return NOT_FOUND → 404

**Success:** `201`
```json
{
  "success": true,
  "data": {
    "id": 99, "ref_no": "QC-20260601-XYZ123",
    "amount": 299, "status": "PENDING",
    "renewal_vps_id": 5,
    "expired_at": "2026-06-02T..."
  }
}
```

**Errors:**
| code | message |
|---|---|
| 400 | Invalid VPS ID. / Package is no longer available. / INVALID_PROMO / PROMO_EXPIRED |
| 403 | Access denied. |
| 404 | VPS not found. |
| 409 | A pending renewal order already exists for this VPS. / PROMO_LIMIT_REACHED / PROMO_USER_LIMIT_REACHED |

**Case example:**

| กรณี | สถานะ VPS ก่อน renew | ผลหลัง vpsService.renew() |
|------|---------------------|--------------------------|
| ต่ออายุก่อนหมด | status=true, order.status=PAID | `expired_at += period` — ไม่ restart |
| ต่ออายุระหว่าง grace period | status=false, order.status=EXPIRE | `expired_at = now + period` + startVm → status=true |
| หมด grace period (ถูกลบแล้ว) | deleted_at มีค่า | 404 — ต้อง create new order ปกติ |

---

### PATCH /api/vps/:id/auto-renew

**Access:** Authenticated (requireAuth)  
**Rate limit:** 10 req/min (vps group)

**Body:**
```json
{ "auto_renew": true, "locked_promo_id": 3 }
```
`locked_promo_id` is optional; pass `null` to clear.

**Business logic:**
1. `parseInt(id)` + isNaN → 400
2. `vpsService.getById(id)` — ownership check → 404 / 403
3. If `locked_promo_id` provided: validate promo exists + active → 400 if not
4. `vps.update({ auto_renew, locked_promo_id })`

**Auto-renew behavior (cron at 02:20 Asia/Bangkok):**
- Finds VPS with `auto_renew=true, deleted_at=null, expired_at ≤ 3 days away`
- Creates renewal order via `orderService.create()` with `locked_promo.code_name` (if promo still active)
- If promo disabled/expired: creates order at full price (graceful degradation)
- Skips if `RENEWAL_PENDING` (existing pending renewal order — avoids duplicates)
- Sends `sendAutoRenewalReminder()` email on success

**Success:** `200`
```json
{ "success": true, "data": { "id": 5, "auto_renew": true, "locked_promo_id": 3, ... } }
```

**Errors:**
| code | message |
|---|---|
| 400 | Invalid VPS ID. / Promo not found or inactive. |
| 403 | Access denied. |
| 404 | VPS not found. |

---

### DELETE /api/vps/:id

**Access:** ADMIN only  
**Rate limit:** ไม่มี (admin action)  
**Audit:** EXPIRE VPS (fire-and-forget, `metadata: { reason: "force_delete", vmid }`)

**Business logic:**
1. `parseInt(id)` + isNaN → 400
2. `vps.findUnique` → 404 ถ้าไม่พบหรือ `deleted_at` มีค่าแล้ว
3. `proxmox.stopVm(vmid)` → pollTask(**60s**) — **best-effort** (catch+log ถ้าล้มเหลว ไม่ block)
4. `proxmox.deleteVm(vmid)` — **best-effort** (catch+log ถ้าล้มเหลว ไม่ block)
5. `ipService.release(ip_assignments_id)` — **hard fail** ถ้าล้มเหลว → 500 (ป้องกัน IP leak)
6. `prisma.$transaction`: `vps.deleted_at = now`, `vps.status = false`, `orders.status = EXPIRE` (ถ้ายังไม่เป็น EXPIRE)
7. `emailService.sendForceDeleted(user.email, vps.name)` — best-effort (catch+log)
8. auditService.record → `{ action: EXPIRE, entity: VPS, metadata: { reason: "force_delete", vmid } }`
9. return 200

> ข้ามกระบวนการ grace period ปกติ (7 วัน) — ลบทันที ใช้ในกรณี VPS ที่ใช้งานผิดกฎ, ค้างจาก provision ล้มเหลว, หรือ cleanup

**Success:** `200`
```json
{ "success": true, "message": "VPS deleted successfully." }
```

**Errors:**
| code | message |
|---|---|
| 400 | Invalid VPS ID. |
| 404 | VPS not found. |
| 500 | ipService.release fail (IP leak prevention) |

---

## Module 9 — IP Pools (`/api/ip-pools`)

### GET /api/ip-pools

**Access:** ADMIN  
**Query params:** `page` (default 1), `limit` (default 50, max 100)

**Business logic:**
1. `ip_pools.findMany()` include `ip_assignments` where `status: true` (active assignments count)
2. order by id asc

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "pools": [
      {
        "id": 1, "ip": "198.51.100.10", "type": "PUBLIC", "status": true,
        "ip_assignments": [{ "id": 5 }]
      }
    ],
    "total": 5, "page": 1, "limit": 50
  }
}
```
> `ip_assignments` array ที่ return = active assignments เท่านั้น — ถ้า array ว่าง = IP ว่างอยู่

---

### POST /api/ip-pools

**Access:** ADMIN  
**Audit:** CREATE IP_POOL

**Request body:**
```json
{ "ip": "198.51.100.20", "type": "PUBLIC" }
```

**Body validation:** `ip` minLength 7 maxLength 45, `type` = "PUBLIC" | "PRIVATE"

**Business logic:**
1. `ip_pools.create({ ip, type, status: true })`
2. audit record: `{ ip, type }`

> PostgreSQL จะ throw error ถ้า ip ไม่ใช่ format inet ที่ valid — client จะได้รับ 500

**Success:** `201`

---

### POST /api/ip-pools/range

**Access:** ADMIN  
**Audit:** CREATE IP_POOL (1 record, metadata includes range + added/skipped counts)

**Request body:**
```json
{ "ip_start": "192.168.1.100", "ip_end": "192.168.1.200", "type": "PUBLIC" }
```

**Body validation:** `ip_start` / `ip_end` = IPv4 only (7–15 chars), `type` = "PUBLIC" | "PRIVATE"

**Business logic:**
1. `ipToNum(ip_start)` > `ipToNum(ip_end)` → 400
2. range size > 256 → 400 "Range too large. Maximum 256 IPs per request."
3. expand range to string array
4. `ip_pools.findMany({ where: { ip: { in: ips } } })` → build skip set
5. `ip_pools.createMany({ data: newIps })` (skip duplicates)
6. audit: `{ range, type, added, skipped }`

**Success:** `201 { added: N, skipped: N, ips: [...] }`

---

### PATCH /api/ip-pools/:id

**Access:** ADMIN  
**Audit:** UPDATE IP_POOL

**Request body:** (optional fields)
```json
{ "ip": "198.51.100.21", "type": "PRIVATE" }
```

**Business logic:**
1. validate id → `findUnique` → 404
2. `ip_pools.update({ ip: body.ip ?? existing.ip, type: body.type ?? existing.type })`
3. audit record: `{ before: { ip, type }, after: { ip, type } }`

---

### PATCH /api/ip-pools/:id/status

**Access:** ADMIN  
**Audit:** ENABLE / DISABLE IP_POOL

**Business logic:**
1. validate id → `findUnique({ status })` → 404
2. `ip_pools.update({ status: !current })`
3. audit record — action = ENABLE ถ้า status ใหม่ = true, DISABLE ถ้า false

---

## Module 10 — System Config (`/api/system-configs`)

**หมายเหตุ:** ค่าที่แก้ผ่าน API จะมีผลทันที (อ่านผ่าน Redis cache TTL 60s) โดยไม่ต้อง restart server

### GET /api/system-configs/pricing

**Access:** Authenticated ทุก role (users, support, admin)

ใช้สำหรับ client-side upgrade cost preview

**Response:** `200`
```json
{
  "success": true,
  "data": { "cpu_per_core": 150, "ram_per_gib": 100, "disk_per_gb": 5 }
}
```
ค่าอ่านจาก config keys: `pricing.cpu_per_core`, `pricing.ram_per_gib`, `pricing.disk_per_gb` (ค่าเป็น `null` ถ้าไม่ตั้งค่า)

---

### GET /api/system-configs/payment-info

**Access:** Authenticated ทุก role (users, support, admin)

ใช้แสดงข้อมูลชำระเงินหน้า checkout (PromptPay QR / โอนธนาคาร)

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "promptpay_id": "0812345678",
    "bank": { "code": "KBANK", "account_no": "1234567890", "account_name": "Cloud VPS Co., Ltd." }
  }
}
```
- `promptpay_id` — จาก `payment.promptpay_id` (เบอร์ 10 หลัก หรือเลขบัตร 13 หลัก); `null` ถ้าไม่ตั้งค่า
- `bank` — จาก `payment.bank_code` / `payment.bank_account_no` / `payment.bank_account_name`; เป็น `null` ถ้าไม่ตั้งค่าเลยสักตัว

---

### GET /api/system-configs

**Access:** ADMIN, SUPPORT  
**หมายเหตุ:** `is_secret=true` → value แสดงเป็น `"***"`

**Response:** `200`
```json
{
  "success": true,
  "data": [
    { "id": 1, "key": "proxmox.host", "value": "10.0.0.1", "category": "proxmox", "is_secret": false, "description": "...", "updater": null },
    { "id": 3, "key": "proxmox.token_secret", "value": "***", "category": "proxmox", "is_secret": true, "description": "..." }
  ]
}
```

---

### GET /api/system-configs/:key

**Access:** ADMIN, SUPPORT

**Success:** `200` — single config entry (secret masked)  
**Not found:** `404`

---

### PUT /api/system-configs/:key

**Access:** ADMIN only  
**Audit:** UPDATE SYSTEM_CONFIG

**Request body:**
```json
{ "value": "10.0.0.2" }
```
ส่ง `value: null` เพื่อ reset กลับไปใช้ env var fallback

**Business logic:**
1. ตรวจ key exists ใน `system_configs` — 404 ถ้าไม่มี (ป้องกันสร้าง key ใหม่ตามใจ)
2. `system_configs.update({ value, updated_by })`
3. `redis.del("syscfg:{key}")` — invalidate cache ทันที
4. audit record: `{ key, category, is_secret }`

**Success:** `200 { success: true, message: "Config updated." }`

---

### DELETE /api/system-configs/cache/flush

**Access:** ADMIN only  
**Audit:** UPDATE SYSTEM_CONFIG (metadata: `{ action: "redis_flush", deleted, patterns }`)

**Request body:** ไม่มี

**Business logic:**
1. สแกนและลบ Redis keys ตาม 4 patterns: `rl:*`, `syscfg:*`, `user_status:*`, `provision_lock:*`
2. ข้าม `rt:*` (refresh tokens) และ `token_block:*` (auth blocklist) — ไม่ลบเด็ดขาด
3. นับ `deleted` keys รวมทุก pattern
4. audit record: `{ action: "redis_flush", deleted: N, patterns: [...] }`

**Success:** `200`
```json
{
  "success": true,
  "message": "Flushed 12 Redis key(s).",
  "data": {
    "deleted": 12,
    "patterns": ["rl:*", "syscfg:*", "user_status:*", "provision_lock:*"]
  }
}
```

> ใช้เมื่อ: rate limit ติดค้าง, config cache เก่า, user status cache ไม่อัพเดต, provision lock ค้าง

---

### Config Keys ที่รองรับ (10 keys — proxmox เท่านั้น)

| Key | Category | Secret | หน้าที่ |
|-----|----------|--------|---------|
| `proxmox.host` | proxmox | ❌ | Proxmox VE host/IP |
| `proxmox.token_id` | proxmox | ❌ | API token ID |
| `proxmox.token_secret` | proxmox | ✅ | API token secret |
| `proxmox.node` | proxmox | ❌ | Proxmox node name |
| `proxmox.storage` | proxmox | ❌ | Storage pool for VM disk |
| `proxmox.bridge` | proxmox | ❌ | Network bridge |
| `proxmox.gateway_public` | proxmox | ❌ | Gateway for PUBLIC IPs |
| `proxmox.gateway_private` | proxmox | ❌ | Gateway for PRIVATE IPs |
| `proxmox.subnet` | proxmox | ❌ | Subnet prefix length |
| `proxmox.default_user` | proxmox | ❌ | cloud-init OS user |

**หมายเหตุ:** SMTP และ payment credentials อยู่ใน `.env` เท่านั้น — ดู `.env.example`

---

---

## Module 11 — Broadcasts (`/api/broadcasts`)

> Phase 5 — Complete ✅. Admin ส่ง notification email ถึง user กลุ่มต่าง ๆ สำหรับเหตุการณ์สำคัญ

### POST /api/broadcasts

**Access:** ADMIN only  
**Rate limit:** 5 req/3600s (1h) — keyPrefix `broadcast`  
**Audit:** BROADCAST EMAIL_BROADCAST (fire-and-forget)

**Request body:**
```json
{
  "subject": "[แจ้งปิดปรับปรุง] CloudVPS — 10 พ.ค. 2026",
  "body": "ระบบจะปิดปรับปรุงในวันที่ 10 พ.ค. 2026 เวลา 02:00–04:00 น.",
  "type": "MAINTENANCE",
  "target": "ACTIVE_VPS"
}
```

> `type` — `MAINTENANCE` | `EMERGENCY` | `ANNOUNCEMENT`  
> `target` — `ALL` (status=true + is_verify=true) | `ACTIVE_VPS` (VPS ที่ status=true + deleted_at=null → unique user emails) | `EXPIRING_SOON` (VPS ที่ expired_at ระหว่าง now ถึง now+14d → unique user emails)  
> `subject` — หัวเรื่อง email (1–200 ตัวอักษร)  
> `body` — เนื้อหา plain text; `\n` → `<br>` อัตโนมัติใน HTML template

**Business logic:**
1. validate `type` (MAINTENANCE | EMERGENCY | ANNOUNCEMENT) + `target` (ALL | ACTIVE_VPS | EXPIRING_SOON) — Elysia schema validation → 400
2. `resolveTargetEmails(target)` query recipients พร้อม dedup (`Set`)
3. `buildHtml(type, subject, body)` — inject เข้า HTML template ตาม type (สี header: MAINTENANCE=#f59e0b, EMERGENCY=#ef4444, ANNOUNCEMENT=#7c3aed)
4. `Promise.allSettled(emails.map(email => emailService.sendRaw(email, subject, html)))` — fail per-recipient ไม่ throw
5. นับ `sentCount`, `failedCount` จาก allSettled results
6. `email_broadcasts.create({ subject, body, type, target, sent_by, sent_count, failed_count })`
7. `auditService.record({ action: "BROADCAST", entity: "EMAIL_BROADCAST", entityId: broadcastId, metadata: { type, target, sentCount, failedCount } })`

**Success:** `201`
```json
{
  "success": true,
  "data": {
    "broadcastId": 1,
    "sentCount": 42,
    "failedCount": 0
  }
}
```

**Errors:**
| code | message |
|------|---------|
| 429 | Too many broadcast requests. |
| 500 | Broadcast failed. |

---

### GET /api/broadcasts

**Access:** ADMIN only  
**Query params:** `page` (default 1), `limit` (default 20, max 100)

**Business logic:**
1. `email_broadcasts.findMany()` include `sender` (id, email)
2. order by `created_at` desc
3. paginate

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "broadcasts": [
      {
        "id": 1,
        "type": "MAINTENANCE",
        "subject": "[แจ้งปิดปรับปรุง] CloudVPS — 10 พ.ค. 2026",
        "body": "ระบบจะปิดปรับปรุง...",
        "target": "ACTIVE_VPS",
        "sent_count": 42,
        "failed_count": 0,
        "created_at": "2026-05-10T10:00:00Z",
        "sender": { "id": 1, "email": "admin@cloudvps.io" }
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /api/broadcasts/:id

**Access:** ADMIN only

**Business logic:**
1. `parseInt(id)` + isNaN check → 400
2. `email_broadcasts.findUnique({ where: { id }, include: { sender } })` → 404 ถ้าไม่พบ

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "type": "MAINTENANCE",
    "subject": "[แจ้งปิดปรับปรุง] CloudVPS — 10 พ.ค. 2026",
    "body": "ระบบจะปิดปรับปรุง...",
    "target": "ACTIVE_VPS",
    "sent_count": 42,
    "failed_count": 0,
    "created_at": "2026-05-10T10:00:00Z",
    "sender": { "id": 1, "email": "admin@cloudvps.io" }
  }
}
```

**Errors:**
| code | message |
|------|---------|
| 400 | Invalid broadcast id. |
| 404 | Broadcast not found. |

---

## Module 12 — Audit Logs (`/api/audit-logs`)

> Phase 5 — Complete ✅. Admin ดู log การกระทำของ Admin/Support ทั้งหมดในระบบ

### GET /api/audit-logs

**Access:** ADMIN only  
**Query params:** `page` (default 1), `limit` (default 20, max 100) + filters below

| Query param | ชนิด | ความหมาย |
|-------------|------|---------|
| `actor_id` | number (optional) | filter by admin/support user ID ที่ทำ action |
| `target_user_id` | number (optional) | filter by user ที่ถูกกระทำ |
| `entity` | string (optional) | filter by entity type (USER, VPS, ORDER, TRANSACTION, ...) |
| `action` | string (optional) | filter by action (CREATE, UPDATE, ENABLE, DISABLE, ...) |
| `from` | YYYY-MM-DD (optional) | filter created_at >= date |
| `to` | YYYY-MM-DD (optional) | filter created_at <= date |

**Business logic:**
1. build dynamic Prisma `where` จาก query params
2. validate `from` / `to` ด้วย `isNaN(d.getTime())` → 400 ถ้า format ผิด
3. `Promise.all([findMany, count])` — parallel
4. include `actor` (id, email) + `target_user` (id, email)
5. order by `created_at` desc

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "actor_id": 1,
        "actor_role": "admin",
        "action": "DISABLE",
        "entity": "USER",
        "entity_id": 5,
        "target_user_id": 5,
        "metadata": null,
        "ip_address": "127.0.0.1",
        "created_at": "2026-05-10T10:00:00Z",
        "actor": { "id": 1, "email": "admin@cloudvps.com" },
        "target_user": { "id": 5, "email": "user@test.com" }
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

**Errors:**
| code | message |
|------|---------|
| 400 | Invalid 'from' date format. Use YYYY-MM-DD. |
| 400 | Invalid 'to' date format. Use YYYY-MM-DD. |

---

## Audit Log Pattern (เพิ่มเติม Phase 5)

| Controller | Action | Entity | Priority | Note |
|---|---|---|---|---|
| broadcastController.send | BROADCAST | EMAIL_BROADCAST | P1 | metadata: type, target, sentCount, failedCount |

---

## HTTP Status Code Summary

| Code | ใช้เมื่อ |
|---|---|
| 200 | Success (GET, PUT, PATCH, POST ที่ไม่ได้ create) |
| 201 | Created (POST ที่สร้าง resource ใหม่) |
| 400 | Validation error / business rule fail |
| 401 | ไม่มี token หรือ token invalid |
| 403 | มี token แต่ role ไม่มีสิทธิ์ / account disabled |
| 404 | ไม่พบ resource |
| 409 | Conflict (email ซ้ำ, code ซ้ำ, consent ซ้ำ) |
| 410 | Gone (VPS ถูกลบถาวรแล้ว — ไม่สามารถต่ออายุได้) |
| 429 | Rate limit exceeded |
| 500 | Unhandled server error |

---

## Module 13 — VM Upgrade (`/api/vps/:id/upgrade`) *(Phase 9 ✅)*

Rate limit: POST endpoints 5 req/min per IP.

### POST /api/vps/:id/upgrade/package

**Access:** Users (own VPS), Admin, Support  
**Body:** `{ "package_id": number }`

Switch VPS to a different package (same OS required). Upgrade = pro-rate charge for remaining days. Downgrade = free (amount=0, auto-approved).

**Response (201):**
```json
{
  "success": true,
  "data": {
    "order": { "id": 10, "ref_no": "QC-20260516-ABCDEF", "amount": 150, "status": "PENDING" },
    "auto_approved": false,
    "direction": "UPGRADE",
    "before": { "cores": 2, "memory_gib": 4, "disk_gb": 50, "monthly_price": 499 },
    "after":  { "cores": 4, "memory_gib": 8, "disk_gb": 100, "monthly_price": 799 },
    "amount_charged": 150
  }
}
```

| Code | Error |
|------|-------|
| 404 | VPS_NOT_FOUND / PACKAGE_NOT_FOUND |
| 403 | FORBIDDEN |
| 409 | UPGRADE_PENDING |
| 400 | PACKAGE_INACTIVE / OS_MISMATCH / NO_CHANGE |

### POST /api/vps/:id/upgrade/custom

**Access:** Users (own VPS), Admin, Support  
**Body:** `{ "cores"?: number, "memory_gib"?: number, "disk_gb"?: number }` (at least 1 field)

Custom resource change at unit prices from system_configs. Added resources charge pro-rate; reduced resources free. Disk cannot shrink.

**Response (201):** same structure as package upgrade (without `direction`).

| Code | Error |
|------|-------|
| 400 | NO_CHANGE / DISK_SHRINK_NOT_ALLOWED |
| 500 | CONFIG_MISSING (pricing keys not set by admin) |

### GET /api/vps/:id/upgrade/history

**Access:** Users (own VPS), Admin, Support  
**Query:** `page`, `limit`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1, "upgrade_type": "PACKAGE",
        "before_cores": 2, "before_memory_gib": 4, "before_disk_gb": 50, "before_monthly_price": 499,
        "after_cores": 4,  "after_memory_gib": 8,  "after_disk_gb": 100, "after_monthly_price": 799,
        "amount_charged": 150, "applied_at": "2026-05-16T10:00:00.000Z", "failed_at": null,
        "order": { "ref_no": "QC-20260516-ABCDEF", "status": "PAID" }
      }
    ],
    "total": 1, "page": 1, "limit": 20
  }
}
```

---

## Module 14 — Port Rules (`/api/vps/:id/port-rules`) *(Phase 8 ✅)*

> Only applies to VPS provisioned from a package with `port_count > 0` (Private IP packages). Public IP VPS returns 404.

### GET /api/vps/:id/port-rules

**Access:** Users (own VPS), Support (any VPS), Admin (any VPS)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "nat_allocation": {
      "public_ip": "203.0.113.10",
      "port_start": 20000,
      "port_end": 20009,
      "used_count": 2,
      "available_count": 8
    },
    "port_rules": [
      { "id": 1, "public_port": 20000, "private_port": 22, "protocol": "TCP", "is_system": true },
      { "id": 2, "public_port": 20001, "private_port": 8080, "protocol": "TCP", "is_system": false }
    ]
  }
}
```

| Code | Error |
|------|-------|
| 401 | Unauthorized |
| 403 | FORBIDDEN (users accessing another user's VPS) |
| 404 | NAT_NOT_FOUND (VPS has no active NAT allocation) |

---

### POST /api/vps/:id/port-rules

**Access:** Users (own VPS), Admin (any VPS) — Support is read-only

**Body:**
```json
{ "privateIp": "172.16.1.1", "privatePort": 8080, "protocol": "TCP" }
```
`protocol`: `"TCP"` | `"UDP"` | `"BOTH"` (BOTH creates 2 MikroTik rules)

**Business logic:**
1. Ownership check for `users` role
2. `natService.addRule()` — finds next free port in block
3. Creates MikroTik DST-NAT rule(s) (best-effort — graceful failure if MikroTik unreachable)
4. Persists `nat_port_rules` record with `mikrotik_ids` array

**Success:** `201` — `{ "success": true, "data": { ...created nat_port_rules record } }`

| Code | Error |
|------|-------|
| 400 | Validation error (invalid IP, port range, protocol) |
| 403 | FORBIDDEN |
| 404 | NAT_NOT_FOUND |
| 409 | PORT_LIMIT_REACHED (all ports in block used) |

---

### DELETE /api/vps/:id/port-rules/:ruleId

**Access:** Users (own VPS, non-system rules only), Admin (any VPS + system rules) — Support is read-only

**Business logic:**
1. Validates rule belongs to the given VPS
2. System rules (`is_system=true`) can only be deleted by Admin
3. Deletes MikroTik rule(s) by stored IDs (best-effort)
4. Sets `nat_port_rules.is_active = false`

**Success:** `200 { "success": true }`

| Code | Error |
|------|-------|
| 403 | FORBIDDEN / SYSTEM_RULE (non-admin tries to delete system rule) |
| 404 | NOT_FOUND |

> ทุก endpoint ใน module นี้ error response เป็น `{ "success": false, "error": "<CODE>" }`

---

## Module 15 — System (`/api/system`)

### GET /api/system/capacity

**Access:** ADMIN, SUPPORT  
**Auth:** Bearer token required

Fetches live Proxmox node resource snapshot (same Redis-cached data used by package availability check, TTL 30 s).

**Business logic:**
1. `capacityService.getNodeSnapshot()` — reads Redis cache if fresh, else fetches from Proxmox + stores
2. `reserved_*` = sum of active `temp_vps` rows (paid orders not yet live in Proxmox)
3. `effective_free_*` = Proxmox reported free − reserved

**Success:** `200`
```json
{
  "success": true,
  "data": {
    "maxmem_mb": 65536,
    "mem_mb": 32768,
    "cpu_pct": 0.12,
    "total_disk_gb": 1000,
    "avail_disk_gb": 600,
    "reserved_ram_mb": 8192,
    "reserved_disk_gb": 160,
    "effective_free_ram_mb": 24576,
    "effective_free_disk_gb": 440
  }
}
```

**Errors:**
| Code | Condition |
|------|-----------|
| 503 | Proxmox unreachable or not configured |

---

## Health Check — `GET /health`

**Access:** Public (no auth required)

Runs 3 checks in parallel. Returns overall status + per-service latency.

**Response shape:**

```json
{
  "status": "ok" | "degraded",
  "ts": "2026-06-30T12:00:00.000Z",
  "services": {
    "db":      { "status": "ok" | "error", "latencyMs": 12 },
    "redis":   { "status": "ok" | "error", "latencyMs": 2 },
    "proxmox": { "status": "ok" | "error", "latencyMs": 85 }
  }
}
```

| HTTP | Condition |
|------|-----------|
| 200 | All 3 services healthy |
| 503 | At least 1 service is `"error"` |

**Service checks:**

| Service | Method | What it does |
|---------|--------|--------------|
| `db` | `prisma.$queryRaw\`SELECT 1\`` | Verifies PostgreSQL connectivity |
| `redis` | `redis.ping()` | Verifies Redis connectivity (triggers lazy connect) |
| `proxmox` | `GET /api2/json/version` | Verifies Proxmox API reachability + token auth |

**Notes:**
- Each check is independently try/caught — one failure does not abort others
- Proxmox `"error"` includes misconfigured credentials (missing env/system_configs)
- Used by Docker Compose healthcheck (`curl -f http://localhost:{PORT}/health`)
