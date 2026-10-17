# Architecture decision records

One short file per decision that would be expensive to reverse. Each says what we decided, why,
and what would make us revisit it. Add a new record rather than editing an accepted one.

| ADR                                     | Decision                                                       |
| --------------------------------------- | -------------------------------------------------------------- |
| [0001](0001-supabase-over-firebase.md)  | Supabase (Postgres) over Firebase                              |
| [0002](0002-headless-core.md)           | All behaviour lives in a headless core package behind ports    |
| [0003](0003-screen-state.md)            | Screen state lives in Zustand vanilla screen models            |
| [0004](0004-offline-data-layer.md)      | Offline-first data through PowerSync adapters in packages/data |
| [0005](0005-vehicle-config-matching.md) | The server matches a car to its shared config                  |
| [0006](0006-nhtsa-safety-data.md)       | The database fetches NHTSA recalls and complaints itself       |
