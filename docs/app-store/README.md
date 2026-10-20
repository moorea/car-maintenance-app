# App Store submission

Everything needed to submit the iOS app, apart from what only the account holder can do. The
other files here are the [privacy policy](privacy-policy.md), the
[App Privacy answers](privacy-labels.md) and the [listing copy](listing.md).

## What needs Andrew

In the order they block submission:

1. **Apple Developer Program membership** ($99/year), as an individual or, to show a company
   name as the seller, an organization (needs a D-U-N-S number).
2. **The app's name.** It sets the App Store name, the home-screen name (`expo.name` in
   `apps/mobile/app.json`) and the copy in [listing.md](listing.md). The bundle identifier is
   `com.moorea.carmaintenance`; change it before the first upload if you want another, since it
   can never change after.
3. **Production sign-in email.** Supabase's built-in mailer only sends to the project's team, so
   reviewers and real owners get no code until custom SMTP is set up (Resend, Postmark or SES),
   then run the Deploy auth emails workflow.
4. **A contact address and the policy's open details.** Fill in `[CONTACT EMAIL]`, `[REGION]`
   (the Supabase and PowerSync dashboards show it) and `[BACKUP PERIOD]` (set by the Supabase
   plan) in [privacy-policy.md](privacy-policy.md).
   The contact address also becomes the support page's email, and the site build warns while
   any blank is left.
5. **Turn on GitHub Pages** (one switch): Settings → Pages → Source: GitHub Actions, then run the
   Deploy site workflow. `apps/site` then publishes the landing page, privacy policy and support
   page at <https://moorea.github.io/car-maintenance-app/>, which the listing already links to.
   Once the privacy page loads there, point the app's default privacy link
   (`apps/mobile/src/bootstrap/links.ts`) at it before the build that goes to review; until then
   the app links to the policy in this repository. For a domain of your own, add it in
   Settings → Pages and set the `SITE_URL` repository variable and
   `EXPO_PUBLIC_PRIVACY_POLICY_URL` to match.
6. **Pricing.** The listing says nothing about price until it is decided.
7. **App Store Connect:** create the app, paste the [App Privacy answers](privacy-labels.md) and
   [listing](listing.md), set availability to the United States, answer the age rating
   questionnaire, and add the review notes below.
8. **Build and upload.** First, once, create the signing credentials from your own computer:
   `cd apps/mobile && npx eas-cli@25.2.0 credentials -p ios`, pick the production profile and let
   it set everything up with your Apple account. Then run **Release to TestFlight** from the
   Actions tab once its settings are in (listed at the top of `.github/workflows/testflight.yml`:
   an Expo access token, an App Store Connect API key, the team id, the app's Apple ID and the
   three public backend settings). It builds on EAS against the live backend and sends the build
   to TestFlight. Screenshots come from that build.

## Audit against the App Review Guidelines

| Guideline                                 | What it asks                                              | Status                                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 App completeness                      | Reviewers can sign in and reach every feature             | Sign-up is open: any email gets a code. Blocked on production email (item 3). Reviewers sometimes reject when there is no demo account or the code is slow to arrive; a fixed-code review account would remove that risk. |
| 2.3 Accurate metadata                     | Listing matches the app                                   | Listing only claims shipped features and keeps the marketing story's "don't say" list.                                                                                                                                    |
| 2.3.8 / 4 Design                          | Real icon, no placeholder                                 | Icon added in `apps/mobile/assets` (light and dark). A designer's icon can replace it.                                                                                                                                    |
| 2.5.1 Public APIs                         | No private APIs                                           | Expo and React Native only.                                                                                                                                                                                               |
| 4.8 Login services                        | Sign in with Apple when offering third-party sign-in      | Not needed: email codes only, no Google or Facebook sign-in.                                                                                                                                                              |
| 5.1.1(i) Privacy policy                   | Linked in App Store Connect and inside the app            | Drafted; linked from sign-in, Account and the AI sharing screen.                                                                                                                                                          |
| 5.1.1(ii) Permission                      | Purpose strings that say why                              | Camera and photo library (image picker plugin), saving to photos (`infoPlist`). Notifications ask in context from the Reminders switch.                                                                                   |
| 5.1.1(v) Account deletion                 | Delete the account in the app                             | Account → Delete account, which deletes everything on the server.                                                                                                                                                         |
| 5.1.2(i) Data sharing with third-party AI | Say what is shared with which AI and get permission first | Added: Ask, the quote checker and odometer photos ask before the first send, per account, and can be turned off in Account → Privacy. Core refuses to send without it, whichever screen asks.                             |
| 5.1.2 Tracking                            | ATT if tracking                                           | No tracking, no ads, no analytics.                                                                                                                                                                                        |
| 1.4.1 Physical harm                       | No risky advice                                           | Ask sends safety questions to a mechanic, and the listing says it is not a mechanic.                                                                                                                                      |
| Privacy manifest                          | Required-reason APIs and collected data                   | `ios.privacyManifests` in `app.json`, matching the App Privacy answers.                                                                                                                                                   |
| Export compliance                         | Encryption question on every upload                       | `usesNonExemptEncryption: false`: only standard HTTPS.                                                                                                                                                                    |

## Review notes (paste into App Store Connect)

> Sign in with any email address you can read: the app emails a six-digit code, and the first
> sign-in creates the account. Add any car to see every feature, for example a 2021 Toyota
> RAV4 chosen by year, make and model.
>
> Ask, the quote checker and reading the odometer from a photo (Car → Update → Take photo) use
> Anthropic's Claude. The first time any of them is used, the app explains what is sent and asks
> for permission; it can be turned off in Account → Privacy.
> Account deletion is in Account → Delete account.

## Worth doing before launch, not required by review

- Editing and deleting service records and cars. Today only warranties and documents can be
  edited, so mistakes need an email.
- A Sign in with Apple option, which reviewers and owners like even though email codes are
  allowed.
- A splash screen in the brand colour (`expo-splash-screen` plugin).
