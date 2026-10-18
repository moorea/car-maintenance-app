# Architecture decision records

One short file per decision that would be expensive to reverse. Each says what we decided, why,
and what would make us revisit it. Add a new record rather than editing an accepted one.

| ADR                                     | Decision                                                          |
| --------------------------------------- | ----------------------------------------------------------------- |
| [0001](0001-supabase-over-firebase.md)  | Supabase (Postgres) over Firebase                                 |
| [0002](0002-headless-core.md)           | All behaviour lives in a headless core package behind ports       |
| [0003](0003-screen-state.md)            | Screen state lives in Zustand vanilla screen models               |
| [0004](0004-offline-data-layer.md)      | Offline-first data through PowerSync adapters in packages/data    |
| [0005](0005-vehicle-config-matching.md) | The server matches a car to its shared config                     |
| [0006](0006-nhtsa-safety-data.md)       | The database fetches NHTSA recalls and complaints itself          |
| [0007](0007-semantic-colors.md)         | Colours come from one semantic theme                              |
| [0008](0008-local-reminders.md)         | Reminders are local notifications planned on the phone            |
| [0009](0009-grounded-assistant.md)      | The assistant answers only from the car's stored data, cited      |
| [0010](0010-schedule-providers.md)      | Schedules come from providers, with a general baseline            |
| [0011](0011-quote-checker.md)           | Shop quotes are checked on the phone; only photos use the server  |
| [0012](0012-attachments.md)             | Attachments live in Storage; their details sync with PowerSync    |
| [0013](0013-data-export.md)             | Owners can export all their data as an open zip, and import it    |
| [0014](0014-fill-ups.md)                | Fill-ups are editable; their mileage is read as odometer readings |
| [0015](0015-bulletins-and-mileage.md)   | Bulletins and complaint mileages come from NHTSA's bulk files     |
| [0015](0015-trouble-codes.md)           | Check-engine codes are looked up on the phone from a fixed table  |
| [0016](0016-renewals.md)                | Paperwork dates are owner-typed and reminded on the phone         |
| [0017](0017-tire-sets.md)               | Tire age comes from the DOT code; each set keeps its own miles    |
