# Quit rules

Written 12 August 2026. Judgement day: **10 November 2026**.

This document exists so that the decision to keep going or stop is made now,
while nothing is at stake, instead of in November while looking at a number and
arguing with it. Two halves: what is being counted, and the three rules that
read the count.

---

## Part 1 — the instrument

### What is counted

One event, `app_opened`, sent once each time the app starts. It carries one
property, `surface` (`app` or `web`). There is no second event. The code is
[`src/services/analytics.ts`](../src/services/analytics.ts) and
[`src/runtime/analyticsRuntime.ts`](../src/runtime/analyticsRuntime.ts); the
promise made to users about it is on the privacy page under "Usage counting".

### Turning it on

The app counts nothing until a key exists. Four steps, once:

1. Create a PostHog account and a project (posthog.com). The free tier covers a
   million events a month; this app sends roughly one per person per day.
2. Copy **Project Settings → Project API key** (it starts with `phc_`).
3. Put it in `.env`, in the Cloudflare Pages build environment, and in the CI
   that builds the native apps — a key that only exists on your laptop counts
   only your laptop:

   ```
   VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxx
   ```

   If the project is in the EU region, also set
   `VITE_POSTHOG_HOST=https://eu.i.posthog.com`.
4. In **Project Settings → Discard client IP data**, switch it on. The privacy
   page tells users the address is discarded; this is the switch that makes
   that sentence true.

Verify: open the app, then look at PostHog → Activity for one `app_opened`
event. If nothing arrives, Settings → Data in the app states the reason in
plain words — no key, switched off, or the browser sends Do Not Track.

### What the numbers are not

- **They are a floor, not a total.** Anyone who switches counting off, sends Do
  Not Track or Global Privacy Control, or runs a content blocker is invisible.
  Assume the real figure is higher than the measured one, and never round the
  measured one up to compensate — the rules below are written against the floor
  on purpose.
- **A device is not a person.** The count is per browser profile and per
  installed app. One person on a laptop and a phone counts as two.
- **The clock starts when the data does.** If the key is not live by
  **19 August 2026**, move every date below forward by the number of days it
  slipped, write the new dates in, and change nothing else.

---

## Part 2 — the three rules

Each rule is one number, one date, one action. All three are read on
**10 November 2026**, from PostHog, in one sitting.

The thresholds are deliberately low. They are not targets — they are the line
under which continuing is a decision made against the evidence. Missing one is
not a verdict on the work; it is a verdict on this way of getting the work in
front of people.

### Rule 1 — Nobody arrives

> If fewer than **200 distinct people** have opened Grovepad at least once
> between 12 August 2026 and 10 November 2026, **stop spending money and
> scheduled time on it.** The app keeps running and stays free; it stops being
> the thing that gets the next three months.

How to read it: PostHog → Insights → unique users of `app_opened` over the
window.

Why 200: below that, no retention or habit number computed from it means
anything — the sample is too small to tell a product problem from noise. A
launch video, a store listing on two platforms, and 90 days that together
cannot produce 200 first opens is a distribution result, and that is an honest
place to stop.

### Rule 2 — They arrive and never come back

> Of the people who first opened Grovepad in the first 60 days (12 August –
> 11 October 2026), if fewer than **15%** open it again in any later week,
> **stop adding features for one month** and work only on the first ten minutes
> of the product. If the same number has not moved by 10 December 2026, stop.

How to read it: PostHog → Retention, event `app_opened` for both the first-time
and the returning event, weekly, cohorts starting inside the first 60 days;
read week 1 and later.

Why 15%: this is the rule that separates "nobody heard about it" from "people
saw it and it was not worth coming back to". Those two failures look identical
in a total-users chart and need opposite responses, which is why reach and
return are two rules instead of one.

Why one extra month rather than an immediate stop: a weak first ten minutes is
the one cause of a low return rate that is genuinely fixable, and it is worth
exactly one attempt — bounded, dated, and not renewable.

### Rule 3 — Nobody keeps it

> If fewer than **40 people** open Grovepad during the last 7 days before
> 10 November 2026 (3–10 November), **stop.** Archive the repository, leave the
> app up, and take the lesson.

How to read it: PostHog → Insights → unique users of `app_opened`, last 7 days.

Why 40: a canvas note app lives or dies on weekly habit. Forty people choosing
to open it in the same week, three months in, is the smallest number that is a
real if tiny habit rather than curiosity and drift. This is the rule most
likely to be argued with in November, which is why it is the one written most
plainly now.

---

## What "stop" means

So that the word cannot be reinterpreted later:

- No new features, no new skins, no new widgets.
- The hosted app stays up and free, and export keeps working. Nobody who
  trusted their notes to it loses them.
- Any paid plan stops taking new subscriptions; existing ones are cancelled and
  refunded pro rata.
- The decision is written into this file, with the actual numbers next to the
  thresholds, on the day — before any explanation of them is attempted.

## Rules for the rules

- **The thresholds can be changed until 19 August 2026, and not after.** A
  threshold edited in November is not a threshold.
- **A rule is only read if its instrument was live for the whole window.** If
  counting broke for a stretch, the window extends by that stretch. Note the
  outage here when it happens, not afterwards.
- **Two of three failing is failing.** There is no aggregate score and no
  averaging between rules; each is read on its own terms.
- Put "read the quit rules" in the calendar for 10 November 2026 now. A rule
  nobody is reminded of is a wish.

## Result

Filled in on 10 November 2026:

| Rule | Threshold | Actual | Pass? |
|---|---|---|---|
| 1 — first opens, 12 Aug – 10 Nov | 200 people | | |
| 2 — week-1+ return, first-60-day cohort | 15% | | |
| 3 — people in the last 7 days | 40 people | | |

Decision: _(written on the day)_
