# App Privacy answers

What to enter under **App Store Connect → App Privacy**. It matches what the app sends off the
phone today, the privacy manifest in `apps/mobile/app.json` (`ios.privacyManifests`) and the
[privacy policy](privacy-policy.md). Change all three together.

## Data collection

**Do you or your third-party partners collect data from this app?** Yes.

**Is any data used for tracking?** No. There is no advertising, no analytics SDK and no data
broker, so App Tracking Transparency is not needed.

## Data types

Every type below is **linked to the user** (it lives in their account), **not used for
tracking**, and used only for **App Functionality**.

| App Store category | Data type          | What it is in this app                                                                                                                                                                       |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info       | Email Address      | The sign-in address                                                                                                                                                                          |
| Identifiers        | User ID            | The account id every row is stored under                                                                                                                                                     |
| User Content       | Photos or Videos   | Receipts and documents attached to cars and services; shop quote photos sent to be read                                                                                                      |
| User Content       | Other User Content | Cars (including a VIN if entered), odometer readings, service records, fill-ups and charging, warranties, tire sets, registration, inspection and insurance dates, Ask questions and answers |

Leave everything else unchecked. In particular the app does **not** collect: location, contacts,
health, financial info (service costs are the owner's own notes, not payment details),
browsing or search history, usage data, diagnostics, purchases, sensitive info or advertising
data.

## Notes for the questionnaire

- **Third-party partners.** Supabase, PowerSync and Anthropic process data on our behalf. Apple
  counts their collection as ours, which is why it is all declared above.
- **Anthropic (Ask and quote checks).** Covered by "Photos or Videos" and "Other User Content".
  Guideline 5.1.2(i) also needs in-app consent before personal data reaches a third-party AI;
  the app asks before the first question or quote check and can be turned off in Account.
- **NHTSA VIN decoding** sends only the VIN, with nothing that identifies the person, to a public
  government service. The VIN is already declared under Other User Content.
- **Data on the phone only** (reminder settings, the intro having been seen, who allowed AI
  sharing, scheduled notifications) is not collected.
