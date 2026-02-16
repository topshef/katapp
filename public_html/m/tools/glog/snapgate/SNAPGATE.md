# SNAPGATE

_Rapid release with ease_

# 🚀 Release TL;DR

- 🛠 **Build stuff** in `src/`, test via `/working/`, commit freely

- 🔢 **Bump version** in `package.json` when ready to release

- 📝 Run `./changelog.sh --write` to draft changelog

- ✏️ Tidy `CHANGELOG.md` if needed

- 💾 Commit `package.json` + `CHANGELOG.md` together

- 🚀 Run `./release.sh`

- 🏷 Tag + `dist/<version>` created + `latest` updated

****Golden rule:** 🧼 Release only from a clean tree where the *last commit is the version bump* — no extra commits after it.

---

## Overview

Development happens continuously in `src/`.

Releases are created manually using:

- `package.json` (source of truth for version)

- `changelog.sh` (changelog draft)

- `release.sh` (deployment + tagging)

The release process is intentionally simple and explicit.

---

## Development Workflow

### 1. 🛠Make Changes

- Edit files in `src/`

- Test using the `/working/` path (maps directly to `src/`)

- Commit changes normally

- Repeat as needed

You can commit as many times as you like without releasing.

---

## When You Want to Release

### 2. 🔢Increment Version

Open `package.json` and increment:

```json
"version": "0.0.X"
```

Do not run `release.sh` yet.

---

### 3.📝 Generate Draft Changelog

Run:

```bash
./changelog.sh --write
```

This will:

- Collect all commits since the last release

- Insert a draft section into `CHANGELOG.md`

---

### 4. ✏️Review and Edit Changelog

Open `CHANGELOG.md` and:

- Tidy wording

- Remove unnecessary commits

- Adjust headings if needed

- Remove "(unreleased)" text if appropriate

This is your final opportunity to curate release notes.

---

### 5. 💾Commit Version + Changelog

Stage and commit both:

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): X.Y.Z"
```

At this point:

- The working tree must be clean

- The version number and changelog are aligned

---

### 6. 👀Inspect Release Readiness

Run:

`./release.sh`

This performs validation only and confirms whether the release is ready. Optionally you can simulate the release process also:

`./release.sh -- dry-run`

### 7. 🚀Run Release Script

```bash
./release.sh --run
```

This will:

- Read the version from `package.json`

- Create `dist/<version>/`

- Copy source files into that folder

- Copy `package.json` into the release folder

- Update `dist/latest` symlink

- Create an annotated git tag

- Push the tag to origin

Release complete.

---

##📌 Important Rules

- `release.sh` requires a clean working tree.

- The version bump and changelog must be committed before running `release.sh`.

- Tags represent a fully committed, immutable release state.

- A version bump commit represents release intent. You must release from that commit. If additional commits are made, the version must be bumped again.

---

## Mental Model

A release consists of:

- Code

- Version number

- Finalised changelog

- Immutable dist snapshot

- Git tag pointing to that exact state

Everything should match.

---

This is the current release process.  
It may evolve over time, but this is the authoritative workflow as of 16 February 2026.

---
