---
name: pzstack
description: "Read before a bug, a feature, or a proof."
---

# pzstack

The route for a ticket. Matt Pocock's skills stay his. Lauren Tan's pstack stays hers (`bin/install-pstack.sh` when a step names one of her skills). Read the one skill a step names. Do not paste a skill body into the thread.

Order of a fix: the design, then a type or a lint rule, then a test, then a sentence in a doc. A higher place that can hold the rule wins. Do not add a paragraph to the system prompt for a rule a compiler or a script can enforce.

## Bug

A check or a named repro already fails. Run it and see the failure. Fix the root in the shared code. Grep callers before editing. Re-run that check, then the cheap suite.

No spec. Hard or slow: `diagnosing-bugs`. A cheap local test the ticket asks for: Matt's `tdd`, not `pstack-tdd`.

## Feature

A caller-visible change, and no failing check yet.

1. The ticket has one reading, and the repo has a seam that can prove it. Implement the smallest change that does that. Name the data shape before the function. Do not write a spec to delay the code.
2. Two behaviors would both satisfy the ticket. Write `docs/specs/<name>.md` in the `to-spec` shape: problem, what the caller sees, decisions, the command that proves it, out of scope. Then implement that file and nothing else. Do not publish the spec to someone else's tracker.
3. The idea itself is not a ticket yet, and you are in that repo. `grill-with-docs`, then `to-spec`. A ticket that already states the behavior does not get a grill.

A fact the repo or a running app can show is not a question. Stop and ask only for the case in step 2, or for an irreversible action below.

## Done

Done means the real path ran. A test that calls the function is the proof for a library. A UI change is a click on the running app. The string in the HTML is not the click. "It compiles" is not done.

Before asking how to log in, test, or drive a feature, read `.cursor/skills/verify-*/SKILL.md` and the one feature file for this task. The file names where the secret lives. It never holds the secret. No verify skill, and the task needs a user path: say so once, then write that skill. If pstack is installed, `create-verification-skill` is the generator. If it is not, write `.cursor/skills/verify-<app>/SKILL.md` with the launch command, how you know it is up, how you drive it, and where the evidence goes.

Your own claim that the patch works is not a sign-off. CI or a second person is. Do not merge on that claim.

## Again

The same mistake twice. Put it in the design, a type, a lint rule, or a script. A note about one journey goes in that feature file.

## Do

Reversible work proceeds: the edit, the local test, the draft spec. Pause for a force-push to a shared branch, a deploy, a data delete, or a message to a customer.

## Do not

`arena`, `swarm`, an always-on outer loop, and unattended merge. Those wait until this repo has a check that runs without a person. Do not vendor pstack or rewrite Matt's skills into this file.
