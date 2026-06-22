# Leave Routing — Notification Copy Improvement

## Goal

Add clarity copy to the `STAFF_LEAVE_REQUESTED` in-app notification body so that any admin who receives it knows immediately that they are empowered to act, reducing bystander-effect delays in multi-admin tenants.

## In scope

- The `body` string of the `STAFF_LEAVE_REQUESTED` notification emitted by `StaffEventsHandler.handleLeaveRequested`
- The `body` string MAY optionally include a count of other admin recipients (open question — see below)

## Out of scope

- Changing who receives the notification (fan-out to all OWNER + ADMIN users remains unchanged)
- Manager assignment: converting `staff.reporting_to` from `String? VARCHAR(200)` to a `User` FK (separate prerequisite ticket)
- Tenant-level configurable leave routing mode (`leave_routing_mode` / Option C)
- Designated-approver workflows
- Any change to the approve/reject endpoint authorization
- Any change to the `STAFF_LEAVE_DECISION` notification (sent to the staff member after a decision)
- Any database migration, data backfill, or feature flag

## User stories

- As a staff member submitting a leave request, I want to know that my request has been received by someone who can act on it, so that I am not left wondering whether it reached the right person.
- As an admin receiving a leave request notification, I want to know immediately that I have the authority to approve or reject it without waiting for a colleague, so that requests are not silently deferred.
- As one of several admins at a mid-sized creche (2–4 admins), I want the notification to signal that any one of us can act, so that we avoid the bystander effect where nobody approves because everyone assumes someone else will.

## Acceptance criteria

- [ ] When a leave request is created and the `staff.leave.requested` event fires, the notification `body` sent to each OWNER and ADMIN user contains text indicating that any admin can approve the request (e.g. includes the phrase "Any admin can approve" or a functional equivalent).
- [ ] The existing fan-out behavior is unchanged: the notification is still delivered to every user in the tenant whose role is `OWNER` or `ADMIN` and whose `isActive` is `true`. No recipients are added or removed.
- [ ] The notification `type` remains `STAFF_LEAVE_REQUESTED`. No new notification type is introduced.
- [ ] The `PATCH /api/v1/staff/leave/:leaveRequestId/approve` endpoint continues to require `OWNER` or `ADMIN` role (via `RolesGuard`). No change to authorization behavior.
- [ ] The `PATCH /api/v1/staff/leave/:leaveRequestId/reject` endpoint continues to require `OWNER` or `ADMIN` role (via `RolesGuard`). No change to authorization behavior.
- [ ] The `title` of the notification (`"Leave request: {staffName}"`) is unchanged.
- [ ] The `actionUrl` (`/staff/leave`) is unchanged.
- [ ] The `metadata` payload on the notification is unchanged.
- [ ] The change is backwards compatible: existing consumers that render the `body` string (in-app notification bell, any future push or email channel) continue to function without modification — the body is still a plain string.

## Constraints

- `staff.reporting_to` is currently `String? @db.VarChar(200)` (free text, e.g. "Principal") — it is NOT a foreign key to any user record and is NULL for every active staff member in the production-data tenant. Any future direct-report routing (Option B) or configurable routing (Option C) is gated on first converting this column to a `reporting_to_user_id UUID REFERENCES users(id)`. Document this clearly; do not attempt to use `reporting_to` for routing in this ticket.
- No database migration is required for this change.
- No feature flag is required for this change.
- No data backfill is required for this change.
- The `body` string is plain text. Do not introduce HTML or markdown unless the in-app renderer already supports it (verify before implementing — see Open questions).
- The change is entirely within `apps/api/src/notifications/handlers/staff-events.handler.ts`, method `handleLeaveRequested`. No other files should need modification.

## Open questions

1. **Recipient count in copy**: Should the notification body include a count of other admin recipients, e.g. "(also sent to 2 other admins)"? This requires `handleLeaveRequested` to query or receive the count of OWNER+ADMIN users — currently the count is determined inside `NotificationEmitter.notifyAdmins` after the handler returns the `params` object. Adding the count either means: (a) doing a pre-count query in the handler before building the body, or (b) passing a recipient-count argument through from the emitter back to the body template (architectural change to `NotificationEmitter`). Engineering should assess implementation cost and decide whether the benefit justifies the additional query. If the count is omitted, the body should read unambiguously without it.

2. **In-app notification renderer markup support**: Does the current in-app notification renderer (web frontend bell component) support any markup in the `body` field (bold, line breaks), or is it plain-text only? The copy should be authored for the actual rendering context. Engineering should confirm before writing the final string.

## Migration path

Trivial — this is a copy-only change to a single string template in one handler method. No database migration, no data backfill, no feature flag, no API contract change, no breaking changes to notification consumers. Deploy via normal staging-first workflow.

## Future work / Dependent ticket

Converting `staff.reporting_to` from `String? VARCHAR(200)` to `reporting_to_user_id UUID REFERENCES users(id)` (with a data migration to resolve existing free-text values to user IDs) is the gating prerequisite for:
- Option B: route leave notifications to the staff member's direct-report manager only
- Option C: tenant-configurable `leave_routing_mode` (ALL_ADMINS / DIRECT_REPORT / DESIGNATED_APPROVER)

Neither Option B nor Option C should be scoped until that schema migration ticket is created, estimated, and scheduled.
