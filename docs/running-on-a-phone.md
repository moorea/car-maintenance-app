# Running the app on a phone

Expo Go cannot run this app: PowerSync's on-device database (op-sqlite) is native code Expo Go
does not include. Every route below installs a build of the app itself. The first `eas build`
needs `eas login` and `eas init` from `apps/mobile`, which links the app to an Expo project.

## Android

Run the **Phone build** workflow from the Actions tab, download the `car-maintenance-apk`
artifact, unzip it and open `app-release.apk` on the phone (allow installing unknown apps when
asked). It needs no Google account. It runs on demo data unless the `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_POWERSYNC_URL` repository variables are set
(Settings → Secrets and variables → Actions → Variables); all three are public values.

With an Expo account instead: `eas build --profile preview --platform android` from
`apps/mobile` gives an install link.

## iPhone

Every route needs a Mac with Xcode or an Expo account, and all but the first need the Apple
Developer Program.

- **Free, from a Mac:** plug the iPhone in, then from `apps/mobile` run
  `npx expo run:ios --device --configuration Release` and pick your own Apple ID as the team in
  Xcode. Turn on Developer Mode on the phone when asked. A free Apple ID's build stops opening
  after 7 days.
- **Ad hoc, with the Developer Program and an Expo account:** `eas device:create` registers the
  phone, then `eas build --profile preview --platform ios` gives an install link.
- **TestFlight:** `eas build --platform ios` then `eas submit`. Also the path to the App Store; see
  [app-store/README.md](app-store/README.md). Raise `ios.buildNumber` in `app.json` before each
  upload; App Store Connect refuses a number it has seen.

For the real backend in an EAS build, add the three `EXPO_PUBLIC_*` values as EAS environment
variables (`eas env:create`), or put them in `apps/mobile/.env.local` for a local build.
