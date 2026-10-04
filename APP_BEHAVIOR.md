# APP_BEHAVIOR

## Purpose

This document defines how the attendance app must behave.

Read this file before you change the app. Many problems in this repository came
from code that did not match its intent. This document removes that gap.

Every statement carries a label:

| Label | Meaning |
| --- | --- |
| **[RULE]** | The product owner stated this. Do not change it without approval. |
| **[CODE]** | The code does this today. It may or may not be correct. |
| **[PROBLEM]** | The code does not do what a **[RULE]** requires. |
| **[OPEN]** | Nobody decided this yet. Ask before you build. |

## How to work with this file

- Keep the labels. They tell the next agent how much freedom they have.
- Add a **[RULE]** when the product owner decides something.
- Add a **[PROBLEM]** when you find a defect. Do not fix it silently.
- Do not delete a **[RULE]** because the code does something else.

---

## 1. Purpose of the app

**[RULE]** Employees clock in and clock out. Most employees use a phone.

**[RULE]** Administrators define shifts and geofences. They also read reports.

## 2. Role definitions

- **[CODE]** A `user` row has a `role` field. The value is `admin` or `user`.
- **[CODE]** A `user` who has the `admin` role reaches `/admin/*`.
- **[CODE]** `app/middleware/auth.global.ts` blocks every page by default.
- **[CODE]** `app/middleware/admin.ts` blocks `/admin/*` for all other roles.

## 3. Core concepts

### 3.1 Shift definition

A shift definition has a start time and an end time. Examples are `pagi`
(07:00 to 19:00) and `malam` (19:00 to 07:00).

- **[CODE]** The table is `shift`. Its primary key is `code`.
- **[CODE]** An administrator edits a shift in place. No history is kept.
- **[OPEN]** The owner wants shift history. See section 6.

### 3.2 Shift type

A shift type is `harian` or `bantuan`.

- **[CODE]** The database limits the value with a check constraint.
- **[CODE]** Old rows can contain `NULL`. The server reads `NULL` as `harian`.

### 3.3 Business date

- **[CODE]** The client sends its time zone offset with every clock action.
- **[CODE]** The server computes the business date. The server does not trust a
  date from the client.
- **[CODE]** A night shift belongs to the date on which it starts. A clock-in at
  02:00 on the 4th can belong to the business date of the 3rd.
- **[CODE]** `server/utils/local-date.ts` and `shared/utils/attendance-date.ts`
  implement the conversion.

### 3.4 Session

A session is one clock-in and its clock-out.

- **[CODE]** At most one session can be open at a time.
- **[CODE]** One business date can hold up to two complete sessions.

---

## 4. Attendance rules

### 4.1 Choosing a shift

**[RULE]** If an employee has not clocked in at all for the day, the employee
can choose `harian` or `bantuan`.

### 4.2 Changing a shift

**[RULE]** After an employee clocks in, the employee must not change the shift.

**[RULE]** The employee must clock out first. The employee can then choose
another shift.

### 4.3 Two shifts per day

**[RULE]** After one shift type, an employee can use the other shift type.

**[RULE]** The maximum is one `harian` and one `bantuan` per day.

**[RULE]** The order does not matter. `bantuan` can come first.

### 4.4 Clock-out

**[RULE]** The system must handle a shift that crosses midnight. Example: an
employee clocks in on the night of the 3rd and clocks out on the morning of the
4th.

**[RULE]** An employee must clock out on the same shift that they clocked in on.

### 4.5 Late arrival

**[OPEN]** Nobody decided the exact rule for late arrival. The code compares the
clock-in time with the shift start time. Confirm the tolerance and the rule for
a shift that starts at midnight.

## 5. Geofence rules

These rules come from the code. They are not confirmed.

- **[CODE]** A geofence is a `point` with a centre and a radius, or a `polygon`
  with a list of points.
- **[CODE]** Each geofence has an interaction mode: `disallow`, `allow`, or
  `allow_with_comment`.
- **[CODE]** The app compares the employee's coordinates with the nearest active
  geofence.
- **[CODE]** The app requires the browser location permission before each clock
  action.
- **[CODE]** The app blocks the clock action when the mode is `disallow` and the
  employee is outside.
- **[CODE]** The app asks for a comment when the mode is `allow_with_comment`
  and the employee is outside.

---

## 6. Shift history

**[RULE]** Shift data can change at any time. An administrator can change it in
the middle of a shift.

**[RULE]** An earlier month can show four shifts. A later month can show two
shifts. Both sets of records must remain correct.

**[RULE]** Every record must remain correct after a change to a shift.

The owner gave two examples of damage:

- **[RULE]** An employee in the middle of a shift must not be counted as late or
  as leaving early. The employee clocked in under the old shift and clocks out
  under the new shift.
- **[RULE]** An administrator report must not become wrong because a shift
  changed in the middle of the month.

### 6.1 The name for this design

The design has three common names.

- **Effective dating.** Each row carries the time from which it is valid.
- **Slowly Changing Dimension, type 2.** A change adds a new row and closes the
  old row. No row is updated.
- **Temporal table.** The table keeps every past state.

### 6.2 What the code stores today

- **[CODE]** `attendance_log` has the columns `shiftStart` and `shiftEnd`.
- **[CODE]** The server writes these columns at clock-in. The code calls this a
  snapshot.
- **[CODE]** The server does not store the shift label at clock-in.

### 6.3 Known problems with shift history

- **[PROBLEM]** `server/api/attendance/report.get.ts` reads the live `shift`
  table. It does not read the snapshot. A change to a shift makes an old report
  wrong.
- **[PROBLEM]** The client computes the early clock-out window from the live
  shift table. It does not use the snapshot.
- **[PROBLEM]** The shift table has no history. An administrator changes
  `start` or `end` and the old value is lost.

### 6.4 Recommendation

**[OPEN]** Decide the design before you build it. A safe design has these
properties:

1. A shift change adds a row. It does not change a row.
2. Each row carries `validFrom` and `validTo`.
3. A clock-in stores the shift times that were valid at that moment.
4. Every report reads the stored values. A report must not read the live table
   to describe the past.

Property 4 is the important one. The snapshot columns already exist in the
schema, but no report reads them.

---

## 7. What the server enforces today

The server is the authority. The client must not be trusted.

- **[CODE]** `server/api/attendance/clock-in.post.ts` takes a per-user database
  lock. This prevents two simultaneous clock-ins.
- **[CODE]** The server rejects a clock-in when a session is already open. It
  returns 409.
- **[CODE]** The server rejects a second session of the same shift type on the
  same business date. It returns 409.
- **[CODE]** The server reads a `NULL` shift type as `harian`.
- **[CODE]** The client disables the shift selectors while a session is open.

## 8. Known problems

Raise each problem before you fix it.

### 8.1 The clock-out button fails without a message

- **[PROBLEM]** The client clock-out button does not check the shift type. The
  server rejects the request, so the click does nothing and shows no message.

### 8.2 A date cannot hold two shift types

- **[PROBLEM]** `attendance_day.shiftType` holds one value for the whole date.
  It cannot hold both types after a second session. Read the session type from
  `attendance_log` instead.

### 8.3 The reports read live shift data

- **[PROBLEM]** `server/api/attendance/report.get.ts` reads the live `shift`
  table. It does not call `resolveHistoricalShiftTiming`. The admin endpoint
  does. See 6.3.
- **[PROBLEM]** The client computes the early clock-out window from the live
  shift table. See 6.3.

### 8.4 The shift table has no history

- **[PROBLEM]** An administrator changes `start` or `end` on the `shift` table
  and the old value is lost. See section 6.

### 8.5 The main action sits below two selectors

- **[PROBLEM]** The page shows the shift selector and the shift type selector
  above the clock button. On a phone the employee scrolls past two selectors to
  reach the main action.

### 8.6 A rule has no test

- **[PROBLEM]** All 34 tests call a pure function. No test calls an endpoint or
  the database. A change can break rule 4.1, 4.2, or 4.3 and every test stays
  green.

### 8.7 An administrator has no navigation on a small screen

- **[PROBLEM]** The admin sidebar hides below `sm`. No other navigation appears.
  An administrator on a small screen cannot reach another admin page.

### 8.8 The page `/403` does not exist

- **[PROBLEM]** Two middlewares send the employee to `/403`, but no page exists
  at that URL. `app/pages/` has no `403.vue`. Only `app/error.vue` exists.
- **[PROBLEM]** `app/middleware/admin.ts` sends a non-admin to `/403`. The
  employee sees a 404 page instead of a message about access.
- **[PROBLEM]** `app/middleware/user.ts` lists `/403` in `allowPaths` to stop a
  redirect loop. The code expects the page to exist. It does not.
- **[OPEN]** Nobody decided what this page must say.

### 8.9 Resolved problems

A problem moves here when the fix is committed. Keep the entry. It tells the
next agent what was already tried.

- A double tap on Clock In or Clock Out fired two POSTs. The buttons bound
  `:loading` to `locating`, which covers only the GPS lookup and clears before
  the request fires. Fixed in `cbc0ef3`: a `submitting` flag in
  `useAttendance` guards both `clockIn` and `clockOut` with an early return and
  a try/finally reset, and all four action buttons bind to it. The flag lives
  in the composable because both `clockIn` calls are fire-and-forget, so a
  page-level flag would clear before the POST finished. The server already
  rejected the second POST with 409, so this was never data corruption.

## 9. Interface rules

- **[RULE]** The home page is used mostly on a phone.
- **[RULE]** The home page must not look broken on a large screen.
- **[RULE]** The main action must stay easy to reach on a phone.
- **[OPEN]** Nobody decided the exact layout. Propose a design and get approval.

### 9.1 Two kinds of screen

The app has two kinds of screen. They have opposite priorities. Do not apply one
set of rules to both.

| Group | Routes | Priority |
| --- | --- | --- |
| Main app | every route except `/admin/*` | mobile first |
| Admin | `/admin/*` | desktop first |

### 9.2 Main app rules

- **[RULE]** Most employees use a phone.
- **[RULE]** Design the small screen first. Then check the large screen.
- **[RULE]** The main action must be easy to reach. Do not force the employee to
  scroll past a selector to reach it.
- **[RULE]** The screen must not look broken on a large screen.

### 9.3 Admin rules

- **[RULE]** Administrators work on a laptop.
- **[RULE]** Design the large screen first. Then check the small screen.
- **[RULE]** The admin screen must not look broken on a phone.
- **[OPEN]** Nobody decided the smallest screen the admin must support.

### 9.4 Route inventory

These are the real URLs. They are verified. Do not guess a URL from a folder
name.

| URL | Page file | Layout | Group |
| --- | --- | --- | --- |
| `/` | `app/pages/index/index.vue` | `app/layouts/user.vue` | main app |
| `/profile` | `app/pages/index/profile.vue` | `app/layouts/user.vue` | main app |
| `/report` | `app/pages/index/report.vue` | `app/layouts/user.vue` | main app |
| `/login` | `app/pages/login.vue` | `app/layouts/default.vue` | main app |
| `/register` | `app/pages/register.vue` | `app/layouts/default.vue` | main app |
| `/forgot-password` | `app/pages/forgot-password.vue` | `app/layouts/default.vue` | main app |
| `/admin` | `app/pages/admin/index.vue` | `app/layouts/admin.vue` | admin |
| `/admin/attendance` | `app/pages/admin/attendance.vue` | `app/layouts/admin.vue` | admin |
| `/admin/geofence` | `app/pages/admin/geofence.vue` | `app/layouts/admin.vue` | admin |
| `/admin/profile` | `app/pages/admin/profile.vue` | `app/layouts/admin.vue` | admin |
| `/admin/shifts` | `app/pages/admin/shifts.vue` | `app/layouts/admin.vue` | admin |
| `/admin/users` | `app/pages/admin/users.vue` | `app/layouts/admin.vue` | admin |

`/index`, `/index/profile`, and `/index/report` return 404. They are not URLs in
this app.

### 9.5 The page folder convention

This pattern is intentional. Do not "fix" it.

- **[CODE]** `app/pages/index.vue` and `app/pages/admin.vue` are not pages. They
  are parent layout routes.
- **[CODE]** Each one sets the layout and the middleware for its children.
- **[CODE]** Each child in the folder sits directly under the parent URL. So
  `app/pages/index/profile.vue` serves `/profile`, not `/index/profile`.

This is the standard Nuxt nested route layout. The same pattern applies to both
trees.

| Parent route file | Child page file | URL it serves |
| --- | --- | --- |
| `pages/index.vue` | `pages/index/index.vue` | `/` |
| `pages/index.vue` | `pages/index/profile.vue` | `/profile` |
| `pages/index.vue` | `pages/index/report.vue` | `/report` |
| `pages/admin.vue` | `pages/admin/index.vue` | `/admin` |
| `pages/admin.vue` | `pages/admin/users.vue` | `/admin/users` |

**[RULE]** Derive a URL from the folder convention in 9.5. Never from the file
path alone.

### 9.6 What the code does now

- **[CODE]** The admin shell uses a fixed left sidebar. The sidebar shows from
  `sm` and above. It hides below `sm`.
- **[CODE]** The sidebar has two widths. It is `w-64` when open and `w-15` when
  collapsed.
- **[CODE]** The admin shell has no navigation below `sm`. An administrator on a
  small screen cannot reach another admin page.
- **[CODE]** The main app shell uses a bottom drawer for navigation. The drawer
  shows below `md`.

### 9.7 Breakpoints

Tailwind provides these. Do not invent new ones.

| Name | Width |
| --- | --- |
| `sm` | 640 px |
| `md` | 768 px |
| `lg` | 1024 px |
| `xl` | 1280 px |

### 9.8 Open questions

- **[OPEN]** Nobody decided the exact layout of the home page.
- **[OPEN]** Nobody decided what an administrator sees below `sm`.
- **[OPEN]** Nobody decided how to handle a signed-in employee who opens `/admin`.
  See problem 8.8.

## 10. Technology

- Nuxt 4 and Vue 3
- Bun runs the tasks. Never install a package with Homebrew.
- PostgreSQL with Drizzle ORM
- The UI library is `@sewadah/selaras`. Its components use the `S` prefix.
- `@nuxt/ui` was removed. Do not add it again.
- Dates are stored as text in the format `YYYY-MM-DD`. They are local calendar
  dates. They are not UTC dates.

## 11. Tests

- Tests use `bun:test`. Never use Vitest or Jest.
- The repository has no type check task.
- The repository has no continuous integration. Run the tests yourself.

## 12. Deferred decisions

A decision was made. The work was not started. Do not lose this section.

### 12.1 Convert the page folders to route groups

**[RULE]** Convert both page trees to Nuxt route groups. Name each group for
the audience, not for the URL.

- **[RULE]** The main app group must be `(user)`, not `(index)`. The name must
  describe who the screen is for.
- **[RULE]** The admin group must be `(admin)`.

The target structure:

| File | URL |
| --- | --- |
| `app/pages/(user)/index.vue` | `/` |
| `app/pages/(user)/profile.vue` | `/profile` |
| `app/pages/(user)/report.vue` | `/report` |
| `app/pages/(admin)/index.vue` | `/admin` |
| `app/pages/(admin)/attendance.vue` | `/admin/attendance` |
| `app/pages/(admin)/geofence.vue` | `/admin/geofence` |
| `app/pages/(admin)/profile.vue` | `/admin/profile` |
| `app/pages/(admin)/shifts.vue` | `/admin/shifts` |
| `app/pages/(admin)/users.vue` | `/admin/users` |

A group in parentheses does not change the URL.

- **[OPEN]** Each page must set its own layout with `definePageMeta`.
- **[OPEN]** The middleware must move to each page, or to a named middleware.

### 12.2 The blocker

`app/layouts/admin.vue` receives props from the page:

```ts
const { menus, isCollapsed } = defineProps<{
  menus?: NavigationMenuItem[]
  isCollapsed: boolean
}>()
```

`app/pages/admin.vue` supplies them. When a page sets its layout through
`definePageMeta`, Nuxt renders the layout alone and passes no props. The admin
sidebar would lose `menus` and `isCollapsed`.

**[RULE]** Remove the prop passing before the move. Put `menus` inside
`app/layouts/admin.vue`. Move `isCollapsed` into a `useState` that the layout
owns.

- **[CODE]** `app/layouts/user.vue` accepts no props. The user group is safe.

### 12.3 Order of work

- **[RULE]** Do this after the Selaras migration is committed.
- **[RULE]** Do this in its own commit. Never mix it with the migration.