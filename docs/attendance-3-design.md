# Attendance report preview

Route: `/admin/attendance-3`. Implementation: `app/pages/admin/attendance-3.vue`.
This is an alternative for review, within the existing admin shell and blue/gray design system.

## Research

[Zoho People attendance reports](https://help.zoho.com/portal/en/kb/people/administrator-guide/reports/articles/attendance-reports) distinguish daily headcount, early/late arrival and departure reports, and monthly employee attendance. Their reports pair actual clock times with shift times and support filters and export.

[SAP attendance documentation](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/c6c3ffd90792427a9fee1a19df5b0925/8dd4dc53b5ef424de10000000a174cb4.html) describes summarizing or expanding employee attendance and listing employees at work, absent, or late. Only the search excerpt was accessible during research.

The design adopts those conventional workflows: a daily employee table, separate monthly recap, and progressive disclosure of shift records. A calendar filled with avatars does not provide enough arrival/departure information for this task.

## Direction contract

THESIS: Answer who checked in on a given date, whether arrival was late, and what needs review using explicit text and aligned columns.

OWN-WORLD: Preserve the existing Selaras controls, blue primary role, neutral surfaces, admin shell, and light/dark themes. Color identifies exceptions; Harian/Bantuan have written labels.

STORY: Choose a date, scan employees, filter exceptions, open individual shift details; switch to monthly totals and drill back into a date.

FIRST VIEWPORT: Heading and export/refresh actions, daily/monthly controls, period label, compact headcount strip, search and filters, then the employee table. Each shift has its own aligned line.

FORM: Familiar HR report within the established application system, directly specified by the user. Code-led implementation; launcher unavailable, no seed generated. The review artifact is the working route rather than a generated composition.

FINISH: Review implementation and desktop/mobile captures; record validation and limitations here. The existing global visual system is retained.

## Reporting semantics

- An employee appears even without a check-in when no shift filter is selected. A shift filter includes employees with records for that shift type, since the API has no scheduled employee roster.
- Missing arrival records mean **No check-in**, not confirmed absence. Leave, days off, and planned shifts cannot be inferred from the existing API.
- A future date displays **No record**. Missing check-outs are flagged after a known shift end, or after the business date for records with unavailable timing.
- Attendance days count distinct business dates. Harian/Bantuan and late totals count recorded shifts. The headline attendance-day total is the sum of employee attendance days.
- Lateness uses the server's historical shift start instant where available. Shift windows use recorded start/end snapshots, falling back to current shift definitions for legacy records.
- Overnight records use the server's existing reconciliation. Completed spans count toward recorded hours; open records do not. Breaks are not deducted.
- Times use Asia/Jakarta, matching the server's default business timezone. Deployments overriding `BUSINESS_TZ` need a shared timezone setting before adopting this preview.
- The route requests the existing attendance and shift APIs; search, status/shift filters, sorting, pagination, detail expansion, date navigation, and filtered CSV export operate on their responses. English and Indonesian messages are kept locally in the isolated page for this review. Browser validation used synthetic responses, not real employee data.
- A check-out without a check-in is an **Incomplete record** (Indonesian: **Catatan tidak lengkap**), available through the status filter and included in **Needs review first** sorting. It contributes no attendance days or completed recorded hours.
- CSV export includes every filtered employee across pages; it escapes CSV content and spreadsheet formulas.

## Visual details

The report uses Selaras components throughout: `STabs`, `SDatePicker`, `SInput`, `SSelect`, `SCard`, `STable` with `SColumn`, `SBadge`, `SAvatar`, `SPagination`, `SSkeleton`, and `SButton`. Controls, table rendering, row expansion, status badges, and pagination follow the same library as the other admin pages. The month selector offers the latest 24 months and preserves a previously selected month.

Selected summary filters use the primary Selaras button's `subtle` variant, with a soft fill and full outline. Unselected filters use neutral ghost buttons. This replaces the custom bottom-edge selection indicator while preserving status colors on the totals.

Tailwind utilities handle report layout, responsive spacing, tabular numerals, and light/dark exception text. The page has no style block; Selaras component styling remains delegated to the library. Secondary text uses the Selaras muted-text token; warning and overdue text have scoped light/dark colors. Expanded details are inline, preserving the employee and date context. On mobile, controls stack and the table scrolls within its own region, rather than widening the page.

Expanded shift records use Selaras semantic badges: green for on-time arrival and completed departure, amber for late arrival and early departure, red for overdue check-outs or incomplete records, and blue for active attendance. Shift types and recap date actions also use colored library treatments. Status text remains explicit. Clicking any non-interactive cell toggles employee details; name and chevron buttons retain their keyboard behavior, and nested controls do not toggle the row twice.

## Validation

- `bun run build` passed (existing bundle-size and missing Sentry-token warnings).
- `bunx eslint app/pages/admin/attendance-3.vue` passed.
- `bun test`: 34 tests passed, zero failures.
- After the Selaras refactor, the production build and page lint passed again. Headless Chrome exercised the actual Nuxt route with browser-only synthetic API/session fixtures: daily lateness, incomplete records, overnight details, distinct attendance days, Harian/Bantuan counts, employee search, status/shift filters, and Selaras pagination passed. Mobile document overflow was checked; no page errors were recorded.
- Captures: `.impeccable/review/desktop.png`, `details.png`, `recap.png`, `mobile.png`, `mobile-table.png`, and `dark.png`. They show synthetic data and the retained admin shell.
- The installed Selaras sidebar initially consumed nearly the whole desktop panel. Desktop visual checks used a **browser-only** fixed sidebar width to isolate the new report. This override is not shipped. The captures do not certify the shared shell's sizing behavior.
- The Impeccable context/detector launcher was unavailable because its engine was not installed and its cache directory was not writable. References and repository context were inspected directly.

## Final implementation evidence

This is an ordinary extension of the incumbent visual system, scoped to the preview route. The page keeps `PageWrapper`, the admin shell, and the Selaras components listed above. No global product brief or replacement design system was created for this route.

Two independent review findings from the initial implementation were fixed: dark-theme descendant selectors place the entire selector inside `:global()` and retain the `.attendance-report` prefix; orphan check-out records receive the incomplete-record label and review controls described above. The Selaras refactor retains those fixes and delegates control theming to the library. Route-keyed `useState` preserves the date, month, daily/recap view, search, shift/status filters, and sort through the shared dashboard's mobile layout remount. Pagination and expanded details remain local state.

The six captures listed above were refreshed for the Selaras implementation. The initial independent reviewer returned **Ship** after both findings were resolved; that verdict predates the component refactor. The refactor was subsequently checked through build, lint, and browser interactions. Captures and interaction checks are browser-fixture evidence; they do not establish real-data validation or user approval. The desktop sidebar sizing override remains confined to the capture harness, and shared shell sizing has not been globally repaired. No detector result is claimed while its launcher is unavailable.
