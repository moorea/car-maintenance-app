#!/usr/bin/env bash
# Installs the release APK on the running emulator, runs the Maestro smoke test and collects
# screenshots and the app's log into $RUNNER_TEMP. Used by the `android` CI job.
set -uo pipefail

out="${RUNNER_TEMP:-/tmp}"
apk=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
mkdir -p "$out/screenshots" "$out/maestro"

adb install -r "$apk" || exit 1
maestro test --test-output-dir "$out/maestro" apps/mobile/e2e/android
status=$?

# takeScreenshot writes to the working directory; failure screenshots go to the output dir.
find . "$out/maestro" -name '*.png' -newer package.json \
  -not -path '*/node_modules/*' -not -path './apps/mobile/android/*' \
  -exec cp {} "$out/screenshots/" \; || true
adb exec-out screencap -p > "$out/screenshots/last.png" || true
adb logcat -d -v time > "$out/maestro/logcat.txt" || true
grep -E 'ReactNativeJS|AndroidRuntime|FATAL' "$out/maestro/logcat.txt" | tail -n 200 || true
exit "$status"
