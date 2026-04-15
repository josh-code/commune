# Commune — People Management & Rostering Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Scope:** Phase 1 MVP — People Management, Rostering, Team Features, Logistics, Sunday School, Member Metrics, Practice Polls, Notifications

---

## 1. Overview

Commune is a church management platform (PWA — web + mobile-friendly) targeting mid-size churches. Primary competitor: Planning Center. This spec covers the first two core modules: **People Management** and **Rostering**, plus supporting modules that emerged from requirements gathering.

**Platform:** Next.js 14 (App Router) + TypeScript, PWA via `next-pwa`, hosted on Vercel.
**Backend:** Supabase (Postgres, Auth, Storage, RLS, Edge Functions).
**UI:** Tailwind CSS + shadcn/ui.
**WhatsApp:** 360dialog WhatsApp Business API. Notifications only sent to users with `status = active`.

---

## 2. User Roles

### 2.1 System Roles (`profiles.role`)

| Role | Access |
|---|---|
| `admin` | Full access — all people, all teams, all rosters, all modules |
| `member` | Views own schedule, confirms/declines, marks unavailability, edits own profile |
| `logistics` | Access to Logistics/Inventory module only — not part of rostering |

A person holds exactly one system role. `team_leader` is **not** a system role — team leadership is determined per-team by `team_member_positions.team_role`.

### 2.2 Team Role (`team_member_positions.team_role`)

| Team Role | Access |
|---|---|
| `leader` | Manages their specific team — roster slots, setlist, hospitality, practice polls, projection brief |
| `member` | Rostered member of the team — views team content, confirms/declines assignments |

A person with `team_role = leader` in the Worship team has no elevated access outside that team. They retain their system role (`member`) everywhere else.

---

## 3. People Management

### 3.1 Profile Fields (`profiles` table)

Extends Supabase `auth.users`.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | FK to `auth.users` |
| `first_name` | text | |
| `last_name` | text | |
| `email` | text | unique |
| `phone` | text | WhatsApp number (e.g. +27...) |
| `photo_url` | text | Supabase Storage |
| `role` | enum | `admin`, `member`, `logistics` |
| `status` | enum | `invited`, `active`, `on_leave`, `left` |
| `on_leave_until` | date | nullable — expected return date when `status = on_leave` |
| `invite_token` | uuid | single-use, nulled after activation |
| `invite_expires_at` | timestamp | 7-day expiry |
| `date_of_birth` | date | |
| `gender` | enum | `male`, `female`, `prefer_not_to_say` |
| `address` | text | optional |
| `marital_status` | enum | `single`, `married`, `widowed`, `divorced` |
| `membership_status` | enum | `visitor`, `regular_attendee`, `member` |
| `membership_date` | date | when they formally joined |
| `emergency_contact_name` | text | |
| `emergency_contact_phone` | text | |
| `notes` | text | private admin notes — not visible to member |
| `church_id` | uuid | future multi-church support |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Member status rules:**
- `invited` — created but not yet activated. No notifications sent.
- `active` — fully onboarded. Eligible for rostering and notifications.
- `on_leave` — temporarily away. Not rostered, no notifications. `on_leave_until` date is optional. Admin can manually move back to `active`.
- `left` — permanently left. Hidden from rosters and all notifications. Profile retained for history.

### 3.2 Family (`families` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | e.g. "The Smith Family" |
| `shared_address` | text | optional — family-level address |
| `church_id` | uuid | |

A profile is linked to a family exclusively through the `family_members` join table — no `family_id` on `profiles` itself. Each profile can have their own `address` field, or inherit from `families.shared_address` if their own address is blank.

Family relationships are captured in a join table:

**`family_members` table**

| Field | Type | Notes |
|---|---|---|
| `profile_id` | uuid | |
| `family_id` | uuid | |
| `relationship` | enum | `head`, `spouse`, `child`, `other` |

On a person's profile page, their family members are shown with relationship labels. Admin can create a family, add/remove members, and set relationships.

### 3.3 How People Enter the System

1. **Bulk CSV import** — admin uploads CSV, maps columns to profile fields, system creates profiles with `status = invited`. Roles may need manual assignment post-import. Parsed client-side using Papa Parse, batch-inserted via Supabase admin API.
2. **Manual add** — admin fills a form to create a single profile.
3. **Invite link** — admin sends a one-time invite link tied to the person's email. Link expires in 7 days. Single-use token invalidated on activation. No self-registration without an invite.

On activation, the person sets a password, their `status` moves to `active`, and the invite token is nulled.

### 3.4 Birthday Notifications

A Supabase Edge Function runs daily. It checks `profiles.date_of_birth` for today's date (month + day match). For each match where `status = active`, a WhatsApp notification is sent to the admin(s): _"Today is [Name]'s birthday 🎂"_. Added to the notification triggers table with `type = birthday_reminder`.

### 3.5 Profile Editing

- Members can edit their own: name, photo, phone number, address, emergency contact.
- Admin can edit all fields on any profile, including role, membership status, and private notes.

### 3.6 Unavailability Calendar (`unavailability` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `profile_id` | uuid | |
| `start_date` | date | |
| `end_date` | date | single day = start equals end |
| `reason` | text | optional |
| `created_at` | timestamp | |

Members set themselves as unavailable for any future date or date range. This is visible to admins when building rosters.

---

## 4. Teams & Positions

### 4.1 Teams (`teams` table)

| Field | Type |
|---|---|
| `id` | uuid |
| `name` | text |
| `type` | enum: `worship`, `hospitality`, `hosting`, `sound`, `media`, `communion`, `preaching`, `welcome`, `sunday_school_small_children`, `sunday_school_big_children` |
| `church_id` | uuid |

No default positions are seeded — admin creates all positions from scratch.

### 4.2 Positions (`team_positions` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `team_id` | uuid | |
| `name` | text | e.g. "Bass", "Acoustic", "Projection", "Camera" |
| `order` | int | display ordering |

Positions are fully editable and deletable by admin.

### 4.3 Team Member Positions (`team_member_positions` table)

A person is on a team by virtue of being assigned at least one position in it.

| Field | Type | Notes |
|---|---|---|
| `profile_id` | uuid | |
| `team_id` | uuid | denormalized for fast queries |
| `position_id` | uuid | |
| `team_role` | enum | `leader`, `member` — determines team management access |

- A person can hold multiple positions across different teams.
- A person with `team_role = leader` in a team can manage that team's roster, setlist, hospitality needs, practice polls, and projection brief for their team.
- When admin builds a roster and fills a position slot, the system shows only members assigned to that position.

---

## 5. Rostering

### 5.1 Services (`services` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | e.g. "Sunday 20 Apr", "Good Friday Service" |
| `date` | date | |
| `type` | enum | `regular_sunday`, `special_event` |
| `status` | enum | `draft`, `published`, `completed` |
| `church_id` | uuid | |

Multi-service Sundays (e.g. 9am + 11am) are out of scope for Phase 1 but the data model supports it — each service is an independent record.

**Service status transitions:**
- `draft` → admin is building the roster, not yet sent
- `published` → roster sent, members confirming/declining
- `completed` → admin manually marks complete after the service date. Any `roster_slots` still `pending` at this point are treated as `no_response` for metrics purposes (status field is not changed — the `completed` service status is the signal).

### 5.2 Roster Slots (`roster_slots` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `service_id` | uuid | |
| `team_id` | uuid | |
| `position_id` | uuid | FK → team_positions |
| `profile_id` | uuid | nullable until assigned |
| `status` | enum | `unassigned`, `pending`, `confirmed`, `declined` |
| `notified_at` | timestamp | |
| `responded_at` | timestamp | |

**Conflict rule:** A person cannot be assigned to more than one position on the same service date. When admin assigns someone, the system checks for existing `roster_slots` for that `profile_id` and `service_id`. If a conflict exists, the assignment is blocked with a warning.

### 5.3 Roster Builder Flow

1. Admin creates a Service (name, date, type).
2. Admin opens the roster builder — all teams shown with their positions.
3. Each position slot shows a filtered list of eligible members (from `team_member_positions`) with availability indicators:
   - Green — no unavailability set for that date
   - Red — unavailability covers that date
   - Grey — no availability data
4. Admin assigns members to slots → saved as `draft`.
5. Admin publishes → `status → published` → WhatsApp notifications fire to active assigned members.
6. Members tap the link → confirm or decline.
7. Decline → admin and team leader notified → slot returns to `unassigned`.

### 5.4 Swap Requests (`swap_requests` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `roster_slot_id` | uuid | the slot being handed off |
| `requester_id` | uuid | person wanting to swap |
| `proposed_replacement_id` | uuid | nullable — open request if null |
| `status` | enum | `pending`, `accepted`, `rejected`, `cancelled` |
| `created_at` | timestamp | |

Flow: Member A requests swap → picks Member B from same team → B gets WhatsApp notification → B accepts/declines → admin sees final state.

If `proposed_replacement_id` is null (open request), the swap request is visible to all active members assigned to the same position/team for that service. Any of them can accept it.

### 5.5 Sunday School Rostering

Sunday School runs as two teams (`sunday_school_small_children`, `sunday_school_big_children`) using the same `roster_slots` system as all other teams.

Additionally, a monthly "in charge" person is assigned per group:

**`sunday_school_monthly_leads` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `group` | enum | `sunday_school_small_children`, `sunday_school_big_children` |
| `profile_id` | uuid | |
| `month` | date | first day of the month |
| `church_id` | uuid | |

The monthly lead is displayed prominently on the Sunday School roster view.

If the monthly lead is unavailable for a specific Sunday, admin can assign a fill-in for that service only:

**`sunday_school_lead_fillins` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `monthly_lead_id` | uuid | FK → `sunday_school_monthly_leads` |
| `service_id` | uuid | the specific Sunday being covered |
| `fillin_profile_id` | uuid | FK → profiles |

The roster view shows the fill-in person (not the monthly lead) for that Sunday, with a "Fill-in" badge.

---

## 6. Team-Specific Features

### 6.1 Worship — Song Bank & Setlists

**`songs` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | text | |
| `artist` | text | optional |
| `original_key` | text | e.g. "G" — always visible to team |
| `original_tempo` | int | BPM — always visible to team |
| `church_id` | uuid | |

**`song_versions` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `song_id` | uuid | |
| `label` | text | e.g. "Live", "Acoustic", "Studio" |
| `default_key` | text | |
| `video_url` | text | YouTube or other link |
| `chord_sheet_url` | text | PDF upload or external link |

**`setlists` table**

| Field | Type |
|---|---|
| `id` | uuid |
| `service_id` | uuid |
| `created_by` | uuid |
| `notes` | text |

**`setlist_songs` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `setlist_id` | uuid | |
| `song_version_id` | uuid | FK → song_versions |
| `order` | int | |
| `key_taken` | text | key chosen for this service |
| `is_communion` | boolean | marks as the communion song |
| `notes` | text | e.g. "key change at bridge" |

**Key behaviours:**
- Worship leader picks a song version and sets a key. The UI shows: original key + BPM (always visible), plus the keys that **this specific leader** has used for this version before (from their past `setlist_songs` rows only — not other leaders').
- `is_communion = true` songs display at the bottom of the setlist with a "Communion" label.
- Song bank is shared across the church. Any worship leader can add songs.
- The full team (all confirmed Worship members for that service) can view the setlist.

### 6.2 Hospitality — Needs List (`hospitality_needs` table)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `service_id` | uuid | |
| `item` | text | e.g. "Milk", "Cups" |
| `quantity` | text | e.g. "2 litres", "100" |
| `assigned_to` | uuid | nullable FK → profiles |
| `status` | enum | `needed`, `fulfilled` |
| `notes` | text | optional |

Assigned person receives a WhatsApp notification. Items can be marked fulfilled.

### 6.3 Projection Brief — Sermon & Worship Submission

**`service_briefs` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `service_id` | uuid | |
| `deadline` | timestamp | movable by admin/team leader |
| `sermon_title` | text | submitted by Preaching team |
| `sermon_notes` | text | |
| `default_bible_version` | text | e.g. "NIV", "ESV", "KJV" — applies to all verses unless overridden |
| `worship_notes` | text | extra worship notes beyond setlist |
| `sermon_submitted_at` | timestamp | |
| `worship_submitted_at` | timestamp | |
| `status` | enum | `pending`, `partial`, `complete`, `late` |

**`brief_verses` table** — Bible references (multiple per brief)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `brief_id` | uuid | |
| `book` | text | e.g. "John", "Romans" |
| `chapter` | int | |
| `verse_start` | int | |
| `verse_end` | int | nullable — single verse if null |
| `version_override` | text | nullable — inherits `default_bible_version` from brief if blank |
| `order` | int | |

Bible book/chapter/verse structure stored as a static JSON file on the client. No external Bible API needed. Supported versions include NIV, ESV, KJV, NKJV, NLT, AMP, MSG (editable list).

**`brief_attachments` table** — presentations and files

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `brief_id` | uuid | |
| `file_url` | text | Supabase Storage |
| `file_name` | text | |
| `uploaded_by` | uuid | |
| `type` | enum | `presentation`, `notes`, `other` |

**Flow:** Preaching leader fills sermon details + uploads presentations. Worship leader links setlist + adds notes. Projection team sees a single brief view with everything. WhatsApp reminders sent before deadline. Overdue briefs flagged to admin.

---

## 7. Logistics — Inventory Management

Not part of rostering. Access is controlled by a `logistics` role assigned per-profile. Admins always have full access.

### 7.1 Access Control

The `logistics` role on `profiles.role` grants read + write access to the inventory module. Admin can additionally approve/reject purchase requests and has an overview dashboard of all inventory. Regular `member` role profiles (regardless of team leadership) have no access to this module.

### 7.2 Categories & Items

**`inventory_categories` table** — Sound, Media, Music, Housekeeping, Furniture (admin-editable, not hardcoded)

**`inventory_items` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `category_id` | uuid | |
| `name` | text | |
| `description` | text | optional |
| `serial_number` | text | optional |
| `purchase_date` | date | optional |
| `purchase_price` | numeric | optional |
| `condition` | enum | `new`, `good`, `fair`, `poor` |
| `status` | enum | `available`, `checked_out`, `missing`, `under_repair`, `decommissioned` |
| `notes` | text | |
| `church_id` | uuid | |
| `created_by` | uuid | FK → profiles — who added the item |
| `created_at` | timestamp | |

### 7.3 Checkouts

**`inventory_checkouts` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `item_id` | uuid | |
| `checked_out_by` | uuid | FK → profiles |
| `checked_out_at` | timestamp | |
| `expected_return` | date | optional |
| `returned_at` | timestamp | nullable |
| `purpose` | text | reason for checkout |
| `checked_in_by` | uuid | who marked it returned |

### 7.4 Purchase Requests

**`purchase_requests` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `item_name` | text | |
| `category_id` | uuid | |
| `quantity` | int | |
| `estimated_cost` | numeric | optional |
| `requested_by` | uuid | |
| `reason` | text | |
| `status` | enum | `pending`, `approved`, `rejected`, `purchased` |
| `reviewed_by` | uuid | admin who approved/rejected |
| `reviewed_at` | timestamp | |
| `admin_notes` | text | admin's comment on the decision |
| `purchased_at` | timestamp | nullable — set when item is actually bought |

Admin/Pastor sees all pending purchase requests in a dedicated overview panel and can approve, reject, or mark as purchased with a note.

### 7.5 Audit Log

Every create, edit, status change, checkout, or return on an inventory item is recorded:

**`inventory_audit_log` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `item_id` | uuid | nullable (purchase requests have their own log) |
| `purchase_request_id` | uuid | nullable |
| `action` | enum | `created`, `edited`, `status_changed`, `checked_out`, `returned`, `marked_missing`, `decommissioned`, `purchase_requested`, `purchase_approved`, `purchase_rejected`, `purchase_completed` |
| `performed_by` | uuid | FK → profiles |
| `performed_at` | timestamp | |
| `old_values` | jsonb | snapshot before change |
| `new_values` | jsonb | snapshot after change |

The item detail page shows a full chronological audit trail. This is read-only — logs are never edited or deleted.

---

## 8. Member Behaviour Metrics

### 8.1 Practice Attendance Tracking

To support practice attendance metrics, a new table is needed:

**`practice_attendance` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `poll_id` | uuid | FK → `practice_polls` (only for confirmed polls) |
| `profile_id` | uuid | |
| `attended` | boolean | |
| `marked_by` | uuid | team leader who recorded attendance |
| `marked_at` | timestamp | |

After a practice session, the team leader marks attendance for their team members. This feeds into the metrics.

### 8.2 Metrics View (`member_stats`)

Computed from existing data as a database view — no separate storage:

| Metric | Source |
|---|---|
| Total times rostered | count of `roster_slots` where `profile_id` matches |
| Confirmed rate | confirmed ÷ total assigned |
| Declined rate | declined ÷ total assigned |
| No-response rate | pending ÷ total assigned |
| Practice sessions invited | count of confirmed `practice_polls` for their team (one poll = one session) |
| Practice attendance rate | attended ÷ total practice sessions invited |
| Availability entries set | count of `unavailability` rows — measures proactive engagement |

Visible on each member's profile page (admin view) and on an admin summary dashboard — sortable table of all members by any metric.

---

## 9. Practice Polls

**`practice_polls` table**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `service_id` | uuid | required — practice is tied to a specific service |
| `team_id` | uuid | |
| `title` | text | e.g. "Worship Practice — Apr 20 Service" |
| `created_by` | uuid | |
| `status` | enum | `open`, `closed`, `confirmed`, `cancelled` |
| `confirmed_date` | timestamp | set when leader picks the winning date |

**`practice_poll_options` table**

| Field | Type |
|---|---|
| `id` | uuid |
| `poll_id` | uuid |
| `datetime` | timestamp |

**`practice_votes` table**

| Field | Type |
|---|---|
| `id` | uuid |
| `poll_option_id` | uuid |
| `profile_id` | uuid |

**Flow:**
1. Team leader creates a poll linked to a service, adds 2–5 date/time options.
2. WhatsApp notification sent to active team members.
3. Members vote in-app — bar chart shows live vote counts.
4. Leader closes poll, picks a confirmed date.
5. WhatsApp notification sent confirming the practice date/time.

Practice polls are visible in context on the service detail page for the relevant team.

---

## 10. Notification System

All WhatsApp notifications are sent via 360dialog. **Only sent to users with `status = active`.**

| Trigger | Recipient(s) | Message summary |
|---|---|---|
| Roster published | All assigned active members | Rostered for [Position] on [Date] — confirm or decline link |
| Member declines | Admin + Team Leader | [Name] declined [Position] on [Date] — reassignment needed |
| Swap requested | Proposed replacement | [Name A] requests swap for [Position] on [Date] — accept or decline |
| Swap accepted | Requester + Admin | Swap confirmed for [Date] |
| Saturday reminder | Confirmed members only | Serving reminder for tomorrow + brief link |
| Invite sent | New member | One-time invite link (expires 7 days) |
| Hospitality item assigned | Assigned person | Bring [Item] for Sunday [Date] |
| Brief deadline reminder | Preaching + Worship leaders | Projection brief due by [Deadline] |
| Brief overdue | Admin + Team Leaders | Projection brief for [Date] is overdue |
| Practice poll created | Active team members | Vote on practice time for [Service Date] |
| Practice date confirmed | Active team members | Practice confirmed [Date & Time] |
| Birthday | Admin(s) | Today is [Name]'s birthday |

**`notifications` table**

| Field | Type |
|---|---|
| `id` | uuid |
| `profile_id` | uuid |
| `type` | enum (all triggers above) |
| `payload` | jsonb |
| `status` | enum: `pending`, `sent`, `failed` |
| `whatsapp_message_id` | text |
| `sent_at` | timestamp |

Failed notifications are retried once after 10 minutes, then marked `failed` with visibility in admin dashboard.

---

## 11. Implementation Phases

### Phase 1 (Core)
- People management (CSV import, invite system, profiles, teams/positions)
- Rostering (services, roster builder, confirm/decline, swap requests)
- Unavailability calendar
- WhatsApp notifications (roster + invite flows)
- Worship setlist + song bank
- Hospitality needs list

### Phase 2
- Projection brief + Bible verse picker
- Sunday School monthly leads
- Logistics / Inventory management
- Member behaviour metrics dashboard
- Practice polls
- Remaining WhatsApp triggers (brief reminders, practice polls)

---

## 12. Out of Scope (for now)

- Multi-site / multi-church
- Multi-service Sundays (data model supports it, UI deferred)
- Giving / financial management
- Public-facing website
- Native iOS/Android app (PWA covers mobile for now)
- Sermon media / podcast publishing
