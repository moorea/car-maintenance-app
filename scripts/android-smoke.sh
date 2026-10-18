#!/usr/bin/env bash
# Installs the release APK on the running emulator, runs the Maestro flows at normal and largest
# text size, and collects screenshots and the app's log into $RUNNER_TEMP. Used by the `android`
# CI job.
set -uo pipefail

out="${RUNNER_TEMP:-/tmp}"
# APK is set when CI reused a cached build instead of building one.
apk=${APK:-apps/mobile/android/app/build/outputs/apk/release/app-release.apk}
mkdir -p "$out/screenshots" "$out/maestro"

adb install -r "$apk" || exit 1
# A fresh emulator's launcher sometimes stops responding, and its "isn't responding" dialog then
# covers the app and fails whichever flow is running. Hide system crash and ANR dialogs, and close
# any already showing.
adb shell settings put global hide_error_dialogs 1
adb shell settings put secure anr_show_background 0
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null || true
maestro test --test-output-dir "$out/maestro" apps/mobile/e2e/android
status=$?
# The same screens as iOS's largest text size check, at Android's largest font scale.
trap 'adb shell settings put system font_scale 1.0' EXIT
adb shell settings put system font_scale 2.0
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null || true
maestro test --test-output-dir "$out/maestro/large-text" apps/mobile/e2e-large-text || status=1

# takeScreenshot writes to the working directory; failure screenshots go to the output dir.
find . "$out/maestro" \( -name node_modules -o -name .expo -o -path ./apps/mobile/android \) -prune \
  -o -name '*.png' -not -name 'icon_*' -newer package.json -exec cp {} "$out/screenshots/" \; || true
adb exec-out screencap -p > "$out/screenshots/last.png" || true
adb logcat -d -v time > "$out/maestro/logcat.txt" || true
grep -E 'ReactNativeJS|AndroidRuntime|FATAL' "$out/maestro/logcat.txt" | tail -n 200 || true
exit "$status"
