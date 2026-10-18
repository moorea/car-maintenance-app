#!/usr/bin/env bash
# Lets the iOS and Android CI jobs skip the native build when a change is JavaScript only. A native
# build is kept in the Actions cache under a key from @expo/fingerprint, which hashes everything
# that goes into the native project (native packages, app.json, config plugins). A later run with
# the same key takes that build and swaps in its own JavaScript bundle and assets, which is what
# the native build would have done. Pushes to main always build from scratch and save the result
# as the newest entry for their key, so a fingerprint that missed something fails there and the
# next main build replaces the entry.
#
#   reuse-native-build.sh bundle <ios|android> <dir>   Bundles this commit's JavaScript into <dir>.
#   reuse-native-build.sh key <ios|android> <dir>      Prints the cache key prefix for this commit.
#   reuse-native-build.sh keep <ios|android> <dir>     Copies a fresh native build into <dir>.
#   reuse-native-build.sh apply <ios|android> <dir> <bundle dir>
#                                                      Swaps the bundle into the cached build.
set -euo pipefail

command=$1 platform=$2 dir=$3
root="$(cd "$(dirname "$0")/.." && pwd)"
mobile="$root/apps/mobile"
# Bump to drop every cached build, for example after changing how the native build is made.
version=v1

# Hermes bytecode starts with an 8-byte magic number, then the bytecode version.
magic=c61fbc03c103191f
header() { od -A n -t x1 -N 12 "$1" | tr -d ' \n'; }

# The compiler in the hermes-compiler package, which the Android build uses.
npm_hermesc() {
  (cd "$mobile" && node --print "require('path').join(require('path').dirname(require.resolve('hermes-compiler/package.json', { paths: [require.resolve('react-native/package.json')] })), 'hermesc', '$1', 'hermesc')")
}

bundle_name() { if [ "$platform" = ios ]; then echo main.jsbundle; else echo index.android.bundle; fi; }

case "$command" in
  bundle)
    # The same command the native build runs (react-native-xcode.sh on iOS, the React Native
    # Gradle plugin on Android): Hermes compiles the result, so Metro does not minify it.
    rm -rf "$dir" && mkdir -p "$dir/assets"
    cd "$mobile"
    entry=$(node -e "require('expo/scripts/resolveAppEntry')" "$mobile" "$platform" absolute)
    npx expo export:embed --platform "$platform" --dev false --minify false --reset-cache \
      --entry-file "$entry" --bundle-output "$dir/$(bundle_name)" --assets-dest "$dir/assets"
    ;;

  key)
    cd "$mobile"
    fingerprint=$(node -e "
      const { createFingerprintAsync } = require(require.resolve('@expo/fingerprint', { paths: [require.resolve('expo/package.json')] }))
      createFingerprintAsync('.', { platforms: ['$platform'] }).then((f) => console.log(f.hash))")
    # How the build is made, and the version fields the fingerprint leaves out, so a change to
    # either builds afresh rather than testing an old build.
    recipe="$root/.github/workflows/ci.yml $root/scripts/reuse-native-build.sh $mobile/app.json"
    if [ "$platform" = ios ]; then
      # shellcheck disable=SC2086
      inputs=$({ xcodebuild -version; cat $recipe; } | shasum -a 256 | cut -c1-12)
      echo "ios-app-$version-$fingerprint-$inputs"
    else
      # Android compiles image assets into its resource table, which a swap cannot change, so a
      # change to any asset needs a new build.
      assets=$(cd "$dir/assets" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum)
      # shellcheck disable=SC2086
      inputs=$({ java -version 2>&1; cat $recipe; echo "$assets"; } | sha256sum | cut -c1-12)
      echo "android-apk-$version-$fingerprint-$inputs"
    fi
    ;;

  keep)
    rm -rf "$dir" && mkdir -p "$dir"
    if [ "$platform" = ios ]; then
      cp -R "$RUNNER_TEMP/derived/Build/Products/Release-iphonesimulator/CarMaintenance.app" "$dir/"
      # The compiler the build used, since the bytecode must match the Hermes in the app.
      hermesc="$mobile/ios/Pods/hermes-engine/destroot/bin/hermesc"
      [ -f "$hermesc" ] || hermesc=$(npm_hermesc osx-bin)
      cp "$hermesc" "$dir/hermesc"
    else
      cp "$mobile/android/app/build/outputs/apk/release/app-release.apk" "$dir/"
      cp "$mobile/android/app/debug.keystore" "$dir/"
    fi
    ;;

  apply)
    js=$4
    bundle="$js/$(bundle_name)"
    if [ "$platform" = ios ]; then
      app="$dir/CarMaintenance.app"
      hermesc="$dir/hermesc"
      # RCTUseAssetCatalog builds images into a compiled catalog that a swap cannot update.
      if /usr/libexec/PlistBuddy -c 'Print :RCTUseAssetCatalog' "$app/Info.plist" > /dev/null 2>&1; then
        echo "The app uses an asset catalog"
        exit 1
      fi
      old="$app/main.jsbundle"
    else
      apk="$dir/app-release.apk"
      hermesc=$(npm_hermesc linux64-bin)
      work=$(mktemp -d)
      unzip -q "$apk" assets/index.android.bundle -d "$work/old"
      old="$work/old/assets/index.android.bundle"
    fi

    compiled="$js/compiled.bundle"
    "$hermesc" -w -emit-binary -max-diagnostic-width=80 -O -out "$compiled" "$bundle"
    # Same magic and bytecode version as the build it goes into, or the app could not load it.
    [ "$(header "$old" | cut -c1-16)" = "$magic" ] || { echo "The cached bundle is not Hermes bytecode"; exit 1; }
    [ "$(header "$compiled")" = "$(header "$old")" ] || {
      echo "Bytecode $(header "$compiled") does not match the cached build's $(header "$old")"
      exit 1
    }

    if [ "$platform" = ios ]; then
      # Simulator builds are not code signed, so the bundle and assets can be replaced in place.
      rm -rf "$app/assets"
      cp -R "$js/assets/." "$app/"
      cp "$compiled" "$app/main.jsbundle"
      cmp "$compiled" "$app/main.jsbundle"
    else
      tools=$(printf '%s\n' "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)
      mkdir -p "$work/new/assets"
      cp "$compiled" "$work/new/assets/index.android.bundle"
      cp "$apk" "$work/unsigned.apk"
      # Keep the entry stored or compressed as the build packaged it.
      if unzip -v "$apk" assets/index.android.bundle | grep -q ' Stored '; then level=-0; else level=-9; fi
      (cd "$work/new" && zip -q "$level" "$work/unsigned.apk" assets/index.android.bundle)
      zip -q -d "$work/unsigned.apk" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/MANIFEST.MF' > /dev/null 2>&1 || true
      "$tools/zipalign" -f -P 16 4 "$work/unsigned.apk" "$work/aligned.apk"
      # The release build is signed with the debug key `expo prebuild` generates; see ci.yml.
      "$tools/apksigner" sign --ks "$dir/debug.keystore" --ks-pass pass:android \
        --ks-key-alias androiddebugkey --key-pass pass:android \
        --out "$dir/app.apk" "$work/aligned.apk"
      "$tools/apksigner" verify "$dir/app.apk"
      unzip -p "$dir/app.apk" assets/index.android.bundle | cmp - "$compiled"
      rm -rf "$work"
    fi
    echo "Reused the native build with this commit's JavaScript."
    ;;

  *)
    echo "Unknown command $command" >&2
    exit 2
    ;;
esac
