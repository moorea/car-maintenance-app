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
adb logcat -G 16M || true # TEMPORARY: keep the car3d diagnostics
# A fresh emulator's launcher sometimes stops responding, and its "isn't responding" dialog then
# covers the app and fails whichever flow is running. Hide system crash and ANR dialogs, and close
# any already showing.
adb shell settings put global hide_error_dialogs 1
adb shell settings put secure anr_show_background 0
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null || true
# The emulator sometimes drops off adb for a moment as a Maestro run launches the app ("device
# offline"), which fails that flow before it has tested anything. When every failed flow of a run
# lost the device that way, the whole run goes again once, after the device is back, so a failure
# Maestro did not log against a flow still counts.
#   run_flows <output dir> <flows>
run_flows() {
  local dir=$1 flows=$2 status failed lost
  maestro test --test-output-dir "$dir" --debug-output "$dir/debug" --flatten-debug-output "$flows"
  status=$?
  [ "$status" = 0 ] && return 0
  failed=$(grep -l 'onCommandFinished: .* FAILED$' "$dir"/debug/*/logs/maestro.log 2> /dev/null)
  # shellcheck disable=SC2086 # One log path per word.
  lost=$(grep -l 'device offline' $failed /dev/null)
  if [ -n "$failed" ] && [ "$failed" = "$lost" ]; then
    echo "The device went offline during $(sed -E 's|.*/debug/([^/]+)/logs/.*|\1|' <<< "$lost" | paste -sd " " -). Running $flows again."
    # A device that does not come back fails the job here, rather than in every later run.
    timeout 120 adb wait-for-device || exit 1
    maestro test --test-output-dir "$dir/retry" --debug-output "$dir/retry/debug" --flatten-debug-output "$flows"
    status=$?
  fi
  return "$status"
}

run_flows "$out/maestro" apps/mobile/e2e/android
status=$?
# The same screens as iOS's largest text size check, at Android's largest font scale.
trap 'adb shell settings put system font_scale 1.0' EXIT
adb shell settings put system font_scale 2.0
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null || true
run_flows "$out/maestro/large-text" apps/mobile/e2e-large-text || status=1

# takeScreenshot writes to the working directory; failure screenshots go to the output dir.
find . "$out/maestro" \( -name node_modules -o -name .expo -o -path ./apps/mobile/android \) -prune \
  -o -name '*.png' -not -name 'icon_*' -newer package.json -exec cp {} "$out/screenshots/" \; || true
adb exec-out screencap -p > "$out/screenshots/last.png" || true
adb logcat -d -v time > "$out/maestro/logcat.txt" || true
grep -E 'ReactNativeJS|AndroidRuntime|FATAL' "$out/maestro/logcat.txt" | tail -n 200 || true
grep -F '[car3d]' "$out/maestro/logcat.txt" | head -n 80 || true
[ "$status" = 0 ] || scripts/maestro-report.sh "$out/maestro"
exit "$status"
