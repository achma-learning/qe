# Releases

What users can download, now and before. History of every change: [`CHANGELOG.md`](./CHANGELOG.md). All releases: [GitHub Releases](https://github.com/achma-learning/qe/releases).

## Tracks
| Track | Release file(s) | Comes from | Version source | Tag prefix | Users get it from |
|---|---|---|---|---|---|
| Android app | `qe-bank-debug.apk` | in the repo: `android/dist/qe-bank-debug.apk`, built with `./gradlew assembleDebug` (see `android/README.md`) | `android/app/build.gradle` (`versionName` + `versionCode`) | `android-v` | GitHub Releases (sideload) · from 1.4: in-app **⬇ Mettre à jour l'app** |
| Website | — (no file) | deployed from `main` by `.github/workflows/deploy.yml` | none — every push to `main` ships | — (no tags) | <https://achma-learning.github.io/qe/> · or the repo ZIP |

The APK keeps the fixed name `qe-bank-debug.apk` on purpose: the README's download link **and the app's own update button** (`releases/latest/download/qe-bank-debug.apk`) rely on it. The update button also relies on the same signing key and a higher `versionCode` in every release — otherwise Android refuses to install the update.

## Current versions
| Track | Version | Tag | Date | Download latest | Download exactly this version |
|---|---|---|---|---|---|
| Android app | 1.5 (versionCode 6) | _pending_ `android-v1.5.0` | — | [latest APK](https://github.com/achma-learning/qe/releases/latest/download/qe-bank-debug.apk) | _pending_ |
| Android app | 1.4 (versionCode 5) | `android-v1.4.0` | 2026-10-29 | — | [1.4 APK](https://github.com/achma-learning/qe/releases/download/android-v1.4.0/qe-bank-debug.apk) |
| Website | rolling | — | every push | [live site](https://achma-learning.github.io/qe/) | [ZIP of `main`](https://github.com/achma-learning/qe/archive/refs/heads/main.zip) |

## Roll back a user
**Android:** Android refuses to install a lower `versionCode` over a higher one. To go back: uninstall the app — **this erases all saved progress** (no backup feature yet) — then install the older APK from its release page (pinned link above). Don't tap **⬇ Mettre à jour l'app** afterwards: it always fetches the newest release. Also: 1.2 and older are signed with a different key than 1.3+, so moving between them always needs an uninstall.
**Website:** no rollback for users; revert the bad commit on `main` and the site redeploys.

## How to release
Mixed mode is normal here. The agent builds the APK locally (JDK 17+, Android SDK 34) and commits it to `android/dist/` via a PR; after the merge, **the owner** runs Actions → "Release Android APK" → Run workflow (branch `main`, tag `android-vX.Y.0`) — the agent's git proxy can't push tags (403). The workflow creates the tag + Release and attaches that APK. Signing key: `android/qe-debug.keystore` (committed on purpose, password in `android/app/build.gradle`) — **never change it**, or users must uninstall and lose progress.

## Release checklist
- [ ] Android assets re-synced from the site (copy steps in `android/README.md`)
- [ ] `node tools/check-data.js --strict` clean; `./gradlew assembleDebug` builds; APK copied to `android/dist/`
- [ ] `versionCode` +1 and `versionName` bumped; CHANGELOG `[android vX.Y]` section dated
- [ ] `apksigner verify --print-certs` shows `CN=QE MCQ Bank (debug)`; SHA-256 noted
- [ ] Same certificate digest as the previous release (`9dbe19ac…`) and a higher `versionCode` — or the in-app update fails
- [ ] Release workflow run on `main` with the new tag; release page lists `qe-bank-debug.apk` (~16 MB), download works, CHANGELOG ✅, this file updated

## Release history
Newest first.
| Date | Tag | Commit | Files | Notes |
|---|---|---|---|---|
| _pending_ | `android-v1.5.0` | — | `qe-bank-debug.apk` | 1.5: 🎯 Focus button back, in the lower row away from Next |
| 2026-10-29 | `android-v1.4.0` | `caeba61` | `qe-bank-debug.apk` (SHA-256 `375002c2…62ed`) | 1.4: volume buttons move between questions, in-app update button, touch layout against mis-taps — verified: asset 16,810,147 bytes, `latest` link serves it, same key as 1.3 |
| 2026-10-29 | `android-v1.3.0` | `c98b689` | `qe-bank-debug.apk` (SHA-256 `60f69624…b78a`) | 1.3: lesson filter, Focus/Auto buttons, tablet layout, fixed signing key — verified: asset 16,748,930 bytes, `latest` link serves it |
| 2026-09-09 | `android-v20260909-100947` | `c9591ee` | `qe-bank-debug.apk` | 1.2: high-yield docs open in a real viewer |
| 2026-09-06 | `android-v20260906-195533` | `26c25a5` | `qe-bank-debug.apk` | 1.1: focus mode by default |
| 2026-09-06 | `android-v20260906-171508` | `62fcfdf` | `qe-bank-debug.apk` | 1.0: first Android app |
