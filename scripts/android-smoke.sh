#!/usr/bin/env bash
# Installs the release APK on the running emulator, runs the Maestro smoke test and collects
# screenshots and the app's log into $RUNNER_TEMP. Used by the `android` CI job.
set -uo pipefail

out="${RUNNER_TEMP:-/tmp}"
# APK is set when CI reused a cached build instead of building one.
apk=${APK:-apps/mobile/android/app/build/outputs/apk/release/app-release.apk}
mkdir -p "$out/screenshots" "$out/maestro"

adb install -r "$apk" || exit 1
maestro test --test-output-dir "$out/maestro" apps/mobile/e2e/android
status=$?

# takeScreenshot writes to the working directory; failure screenshots go to the output dir.
find . "$out/maestro" \( -name node_modules -o -name .expo -o -path ./apps/mobile/android \) -prune \
  -o -name '*.png' -not -name 'icon_*' -newer package.json -exec cp {} "$out/screenshots/" \; || true
adb exec-out screencap -p > "$out/screenshots/last.png" || true
adb logcat -d -v time > "$out/maestro/logcat.txt" || true
grep -E 'ReactNativeJS|AndroidRuntime|FATAL' "$out/maestro/logcat.txt" | tail -n 200 || true
exit "$status"
