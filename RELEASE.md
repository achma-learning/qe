# Releases

What users can download, now and before. History of every change: [`CHANGELOG.md`](./CHANGELOG.md). All releases: [GitHub Releases](https://github.com/achma-learning/qe/releases).

## Tracks
| Track | Release file(s) | Comes from | Version source | Tag prefix | Users get it from |
|---|---|---|---|---|---|
| Android app | `qe-bank-debug.apk` | in the repo: `android/dist/qe-bank-debug.apk`, built with `./gradlew assembleDebug` (see `android/README.md`) | `android/app/build.gradle` (`versionName` + `versionCode`) | `android-v` | GitHub Releases (sideload) |
| Website | — (no file) | deployed from `main` by `.github/workflows/deploy.yml` | none — every push to `main` ships | — (no tags) | <https://achma-learning.github.io/qe/> · or the repo ZIP |

The APK keeps the fixed name `qe-bank-debug.apk` on purpose: the README's download link (`releases/latest/download/qe-bank-debug.apk`) relies on it.

## Current versions
| Track | Version | Tag | Date | Download latest | Download exactly this version |
|---|---|---|---|---|---|
| Android app | 1.3 (versionCode 4) | _pending_ `android-v1.3.0` | — | [latest APK](https://github.com/achma-learning/qe/releases/latest/download/qe-bank-debug.apk) | _pending_ |
| Android app | 1.2 (versionCode 3) | `android-v20260909-100947` | 2026-09-09 | — | [1.2 APK](https://github.com/achma-learning/qe/releases/download/android-v20260909-100947/qe-bank-debug.apk) |
| Website | rolling | — | every push | [live site](https://achma-learning.github.io/qe/) | [ZIP of `main`](https://github.com/achma-learning/qe/archive/refs/heads/main.zip) |

## Roll back a user
**Android:** Android refuses to install a lower `versionCode` over a higher one. To go back: export nothing (no backup feature yet), uninstall the app — **this erases all saved progress** — then install the older APK from its release page. Also: 1.2 and older are signed with a different key than 1.3+, so moving between them always needs an uninstall.
**Website:** no rollback for users; revert the bad commit on `main` and the site redeploys.

## How to release
🤖 Agent mode is normal here. The APK is built locally (JDK 17+, Android SDK 34) and committed to `android/dist/`; pushing a tag `android-v*` runs `.github/workflows/release-apk.yml`, which creates the GitHub Release and attaches that APK. Signing key: `android/qe-debug.keystore` (committed on purpose, password in `android/app/build.gradle`) — **never change it**, or users must uninstall and lose progress.

## Release checklist
- [ ] Android assets re-synced from the site (copy steps in `android/README.md`)
- [ ] `node tools/check-data.js --strict` clean; `./gradlew assembleDebug` builds; APK copied to `android/dist/`
- [ ] `versionCode` +1 and `versionName` bumped; CHANGELOG `[android vX.Y]` section dated
- [ ] `apksigner verify --print-certs` shows `CN=QE MCQ Bank (debug)`; SHA-256 noted
- [ ] Tag pushed on `main`, release page lists `qe-bank-debug.apk` (~16 MB), download works, CHANGELOG ✅, this file updated

## Release history
Newest first.
| Date | Tag | Commit | Files | Notes |
|---|---|---|---|---|
| _pending_ | `android-v1.3.0` | — | `qe-bank-debug.apk` | 1.3: lesson filter, Focus/Auto buttons, tablet layout, fixed signing key |
| 2026-09-09 | `android-v20260909-100947` | `c9591ee` | `qe-bank-debug.apk` | 1.2: high-yield docs open in a real viewer |
| 2026-09-06 | `android-v20260906-195533` | `26c25a5` | `qe-bank-debug.apk` | 1.1: focus mode by default |
| 2026-09-06 | `android-v20260906-171508` | `62fcfdf` | `qe-bank-debug.apk` | 1.0: first Android app |
