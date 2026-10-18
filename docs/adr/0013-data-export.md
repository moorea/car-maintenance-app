# 0013 Owners can export all their data as an open zip, and import it again

Status: accepted, 2026-10-17

## Decision

Account → Your data exports everything stored about the owner's cars as one zip, and imports such
a zip into the signed-in account.

- **The zip is in open formats.** `car-data.json` holds everything (cars, odometer readings,
  services, warranties, fill-ups, tire sets, renewal dates and documents) with a `format` and `version`, and is what import reads.
  `cars.csv`, `service-log.csv`, `odometer.csv`, `warranties.csv`, `fill-ups.csv`,
  `tires.csv`, `renewals.csv` and `documents.csv` hold the
  same data for a spreadsheet (UTF-8 with a byte order mark, so Excel reads it, and money in
  dollars). `documents/<car>/` holds every attached photo and PDF under its own name. A README
  says what each file is.
- **It is built on the phone**, in core (`portability/`), from the same repositories the screens
  read, with fflate. Files this phone has no copy of are downloaded first; one that cannot be
  (offline) is listed with a null file, and the owner is told to export again online. The zip
  goes to the share sheet, so it can be saved to Files, mailed or AirDropped.
- **Import adds, it never overwrites.** It shows which cars it would add before adding any. A car
  already in the garage (same VIN, or for a car without one, the same year, make, model and
  nickname) is left as it is, so importing the same zip twice adds nothing twice. Everything gets
  new ids, since the originals may still exist in another account, and is saved like anything the
  owner adds: offline, then uploaded.
- **Service links to the schedule survive where they can.** A service keeps its schedule item id,
  which is stable for a configuration (ADR 0010), and the car is matched to the same configuration
  again. The upload drops a link the server does not know rather than the service. The export
  also names each item and its kind, for readers without the app's ids.
- Reminders are left out (they are planned from the schedule and log on each phone), and so are
  assistant conversations.

## Why

- Owners of competing apps complain most about data they cannot get out, or lost with the app.
  An export in formats any spreadsheet opens is the answer, and an import makes it a backup too.
- Building on the phone works offline for everything already on it and needs no server job,
  storage for finished exports, or download links to secure.

## Revisit if

- Garages with many large files make the zip too big to hold in memory: stream it to a file.
- Owners want to restore over existing cars, or merge services into a car already in the garage.
