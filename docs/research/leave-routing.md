# Leave Routing UX Research

**Date**: 2026-05-02  
**Scope**: Options A, B, C for leave-request notification routing  
**Tenant context**: Single production-data tenant (bdff4374…), staging DB

---

## 1. Structural finding: `reporting_to` is a free-text string, not a FK

Before any journey work: the schema reveals `staff.reporting_to` is `String? @db.VarChar(200)` — a human-readable label ("Principal", "Deputy Head"), not a foreign key to a `User` or `Staff` record. Option B cannot use it as a notification target without a separate resolution step (name-to-user lookup, which would be lossy and fragile). This makes Option B fundamentally more expensive than the brief implies, and raises a new implementation risk the product-manager must account for.

Additionally, the brief confirms `reporting_to` is NULL for every active staff record in the only production-data tenant. So even if a FK were added, Option B degrades to A for 100% of current requests on day one.

---

## 2. Persona spread

### Observed data (staging, one production-data tenant)
Only one real tenant exists in staging. Heuristic reasoning fills the buckets.

| Bucket | Admin count | Staff count | Persona label | Fit to SA creche market |
|--------|-------------|-------------|---------------|------------------------|
| **Small** | 1–2 | ≤5 | Owner-operator; no HR layer | Most common for informal/community creches |
| **Mid** | 2–4 | 6–20 | Owner + 1–2 admins; possible deputy principal | Most common for registered ECD centres |
| **Large** | 4+ | 20+ | Owner + dedicated admin + principal + deputy | Larger urban franchise-style or multi-class creches |

**Dominant persona for leave routing**: Owner-operator (Small) and mid-bucket Owner + admin pair. Large is rare in SA ECD market below 80-child threshold.

### Persona sketches for this decision

**A — "Proud Phuthi, Owner-Operator"** (Small): runs the creche herself, is the only ADMIN. Notification goes to her only. Approval is hers. Zero routing complexity. Baseline success case.

**B — "Nomsa & Sipho, co-admins"** (Mid): owner Nomsa plus deputy admin Sipho. Both get leave alerts under A. Both feel some obligation but neither has clear ownership — classic bystander effect. Under B they could be routed separately, but `reporting_to` is free text ("Nomsa") not a user ID, so B can't wire to the right person without extra infrastructure.

**C — "Fiona, growing creche"** (Mid-to-Large transitioning): has 3 staff, added an admin last year, wants cleaner HR. Would configure leave routing once she understands it exists. Unlikely to discover it unprompted.

---

## 3. Journey maps

### Journey: "Staff submits leave → manager learns → approves → staff sees outcome"

#### Option A — All admins notified, any admin approves

| Step | Action | Actor's mental state | Friction risk |
|------|--------|----------------------|---------------|
| 1 | Staff submits leave request via portal | Mild anxiety — "did it go to the right person?" | Staff cannot see who will receive the alert |
| 2 | All OWNER+ADMIN users receive in-app notification | Admin A sees it; Admin B also sees it | **Mid bucket**: 3 admins all notified → diffusion of responsibility. Who acts first? |
| 3 | Admin acts (or waits for colleague to act) | First-mover acts; second admin feels irrelevant | Duplicate-action risk if two admins try to approve simultaneously (race) |
| 4 | Staff receives APPROVED/REJECTED notification | Relief or frustration | No visibility on who decided or why — outcome only |
| 5 | Staff checks leave balance | Checks portal | If mock-data fallback fires (existing UX-S-001 pattern), they see wrong balance |

**Small bucket (Proud Phuthi)**: A works perfectly. One admin, no noise, immediate accountability.  
**Mid bucket (Nomsa + Sipho)**: Notification diffusion is the core risk. With 3 admins, bystander effect means slower response times, and no clear SLA accountability.

#### Option B — Route to `reporting_to` person, fallback to admins if null

| Step | Action | Actor's mental state | Friction risk |
|------|--------|----------------------|---------------|
| 1 | Staff submits leave | "My request goes to my manager" — higher trust if correctly wired | No visible confirmation of who receives it |
| 2 | System looks up `reporting_to` (free-text string) | — | **Structural blocker**: `reporting_to` is a name string ("Mrs Dlamini"), not a User FK. System cannot resolve to a notification recipient without a separate matching layer. |
| 3 | All current records have null → fallback to all admins | Identical to A on day one | Staff believes "direct report" routing happened; actually got broadcast. Invisible degradation. |
| 4 | Even when `reporting_to` is set (future state) | Admin not in `reporting_to` gets no alert | If the named person is not an active user (e.g. left the creche), notification silently drops to fallback — staff never knows |
| 5 | Approval | Same as A | |

**Option B as specified is not implementable without first converting `reporting_to` to a User FK.** The journeys above assume that conversion has been done. Even then, the null-fallback is invisible: staff submits believing it went to their manager; it silently degraded to broadcast. This is a Nielsen Visibility of System Status violation — the user gets no feedback about which path was taken.

#### Option C — Tenant-configurable `leave_routing_mode`

| Step | Action | Actor's mental state | Friction risk |
|------|--------|----------------------|---------------|
| 1 | Owner must find and configure `leave_routing_mode` setting | — | **Discovery**: Setting buried in Tenant Settings. SA owner-operators are time-poor (mobile-first, 5–10 min/day). Most will never find it. Default (A) becomes permanent for 80%+ of tenants. |
| 2 | Owner must understand three options (ALL_ADMINS, DIRECT_REPORT, DESIGNATED_APPROVER) | Terminology is technical | "Direct Report" is HR jargon unfamiliar to small-creche owners. "Designated Approver" requires them to pick a user — another screen, another action. |
| 3 | Staff submits leave | Same as option chosen | Behaviour depends entirely on discovery + configuration step |
| 4 | On DIRECT_REPORT mode with null `reporting_to` | Same FK-resolution gap as B | Identical structural problem if not pre-solved |
| 5 | Approval routing follows chosen mode | Correct for configured tenants | For un-configured tenants (majority), silent fallback to A |

**Option C is premature.** It solves a problem that requires mid/large tenants to self-configure a setting they won't find. Small tenants (dominant) don't need it — A works for them. Large tenants (rare now) would benefit, but only after `reporting_to` is converted to a FK, which is the hard pre-requisite regardless of which option is chosen.

---

## 4. Heuristic violations by option

| Option | Heuristic | Violation | Severity |
|--------|-----------|-----------|----------|
| A (mid bucket) | #1 Visibility of system status | Staff doesn't know how many admins got the alert or who will decide | Low — acceptable for current scale |
| A (mid bucket) | #2 Match between system and real world | Broadcast to all admins doesn't map to the real-world "my manager got my leave form" mental model | Medium |
| B | #1 Visibility of system status | Null-fallback is invisible — staff believes directed routing happened | High |
| B | #5 Error prevention | Resolving free-text name to user is fragile, risks silent misdirection | High |
| C | #6 Recognition rather than recall | Owner must remember to configure routing before staff use leave | Medium |
| C | #4 Consistency and standards | "DESIGNATED_APPROVER" vs "DIRECT_REPORT" are inconsistent HR/IT dialects for a creche owner | Low |

---

## 5. Recommendation

**Option A** with one tactical improvement: on the notification body, add "Any admin can approve" so that Nomsa and Sipho both understand the broadcast intent and the first-mover resolves it without waiting for the other.

**One-line reason**: Option B requires a schema migration (`reporting_to` → User FK) and invisible fallback creates a trust-breaking UX gap; Option C adds configuration surface that owner-operators won't use — A is the correct default for the current customer base, and its only real risk (mid-bucket diffusion) is solved by copy, not code.

### Accepted friction under Option A

1. **Mid-bucket bystander effect** — 2–3 admins all notified, response time may lag. Mitigated by notification copy ("any admin can approve this").
2. **No audit trail of who received the notification** — staff cannot see confirmation of routing. Acceptable today; becomes important at Large scale.
3. **No isolation for future designated-approver workflows** — if the tenant grows and wants HR-layer routing, it requires retrofitting. Acceptable because that tenant segment doesn't exist yet.

---

## 6. Pre-requisite observation (not scoped here)

`staff.reporting_to` is `String? @db.VarChar(200)` — free text, no FK. **Before Option B or C (DIRECT_REPORT mode) can be built**, this must be converted to a `reporting_to_user_id UUID REFERENCES users(id)` column with a separate data-migration step. This is a schema-plus-migration task, not a notification-handler task. Product-manager should track this as a separate dependency if B or C is ever revisited.
