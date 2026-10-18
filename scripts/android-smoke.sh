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
maestro test --test-output-dir "$out/maestro" --debug-output "$out/maestro/debug" --flatten-debug-output apps/mobile/e2e/android
status=$?
# The emulator sometimes drops off adb for a moment while the first flow launches the app
# ("device offline"), which fails that flow before it has tested anything. When that is the only
# kind of failure, run those flows again once, after the device is back.
if [ "$status" != 0 ]; then
  failed=$(grep -l 'onCommandFinished: .* FAILED$' "$out"/maestro/debug/*/logs/maestro.log 2> /dev/null)
  # shellcheck disable=SC2086 # One log path per word.
  lost=$(grep -l 'device offline' $failed /dev/null)
  if [ -n "$failed" ] && [ "$failed" = "$lost" ]; then
    flows=$(sed -E 's|.*/debug/([^/]+)/logs/maestro.log|apps/mobile/e2e/android/\1.yaml|' <<< "$lost")
    echo "The device went offline during $(tr '\n' ' ' <<< "$flows"); running them again."
    adb wait-for-device
    # shellcheck disable=SC2086 # One flow path per word.
    maestro test --test-output-dir "$out/maestro/retry" --debug-output "$out/maestro/retry/debug" \
      --flatten-debug-output $flows
    status=$?
  fi
fi
# The same screens as iOS's largest text size check, at Android's largest font scale.
trap 'adb shell settings put system font_scale 1.0' EXIT
adb shell settings put system font_scale 2.0
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null || true
maestro test --test-output-dir "$out/maestro/large-text" --debug-output "$out/maestro/large-text/debug" --flatten-debug-output \
  apps/mobile/e2e-large-text || status=1

# takeScreenshot writes to the working directory; failure screenshots go to the output dir.
find . "$out/maestro" \( -name node_modules -o -name .expo -o -path ./apps/mobile/android \) -prune \
  -o -name '*.png' -not -name 'icon_*' -newer package.json -exec cp {} "$out/screenshots/" \; || true
adb exec-out screencap -p > "$out/screenshots/last.png" || true
adb logcat -d -v time > "$out/maestro/logcat.txt" || true
grep -E 'ReactNativeJS|AndroidRuntime|FATAL' "$out/maestro/logcat.txt" | tail -n 200 || true
[ "$status" = 0 ] || scripts/maestro-report.sh "$out/maestro"
exit "$status"
