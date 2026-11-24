---
name: day
description: "Devdeep's daily route for a bug, a feature, or a proof. Read before editing."
disable-model-invocation: true
---

# Day

Matt Pocock owns the build path. pstack owns the proof path. This file only picks the path and the stop. Read the named `SKILL.md` before following it. Do not paste a skill body into the reply.

## Bug

A failing check or a named repro exists. Run it and confirm the failure. Fix the root in the shared code; grep callers first. Re-run that check, then the repo suite when it is cheap. No spec. Hard or slow: `diagnosing-bugs`. A cheap local test that was asked for: Matt's `tdd`, not `pstack-tdd`.

## Feature

A visitor-visible change, and no failing check yet.

1. A `docs/specs/<name>.md` that defines done: implement that and nothing else. `implement`.
2. No spec: write one in the `to-spec` shape (problem, solution, stories, decisions, tests, out of scope) to `docs/specs/`. Do not publish it to someone else's tracker.
3. Two acceptable behaviors: stop and ask. A fact the repo can show: do not ask.

## Proof

Before asking how to log in, test, or drive a feature, read `.cursor/skills/verify-*/SKILL.md` and the one feature file for this task. The file names where credentials live. It never holds a password. No verify skill, and the task needs a user path: say so once, then `create-verification-skill`.

Done means the check ran on the real path. `principle-prove-it-works`. A UI change is clicked. Finding the string in HTML is not the click.

## Again

The same mistake twice: a lint, a type, or a script. `principle-encode-lessons-in-structure`. A journey note goes in that feature file. Do not add a paragraph to the system prompt.

## Stop

`arena`, `swarm`, an outer loop, unattended shipping, and `setup-pstack` model rules. Those wait until the repo has a check that runs without a person.
