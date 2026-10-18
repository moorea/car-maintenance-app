# 0017 Owners add their own schedule items and set their own intervals

Status: accepted, 2026-10-18

## Decision

Owners change a car's schedule in `custom_items`: an item the schedule doesn't have (wiper blades,
a timing belt, a trailer's bearings), or their own interval for an item it does (oil every 5,000
miles where the schedule says 10,000). CARFAX Car Care owners complain that only oil and tire
rotation can be reminded and only at fixed intervals; this answers both.

- **Applied in one place.** `withCustomItems` wraps the configuration's schedule, so
  `ScheduleRepo.itemsForVehicle` is the schedule the car follows for every screen, the reminder
  planner, the quote checker, the care report, export and Ask's server. A replacement keeps the
  schedule item's id, name and source, so services logged against it still count and baseline
  items still read as general guidance elsewhere; Ask is told the interval is the owner's.
- **One interval for all driving.** The owner's interval replaces the schedule's normal and severe
  ones: they typed what they want to follow, whichever way they drive. Typing the schedule's own
  interval back in, or "Use the schedule's interval", deletes the replacement.
- **Editable**, like warranties and renewals: PUT, PATCH and DELETE upload, and RLS lets owners
  write rows on their own cars only. A replacement goes when a schedule update drops its item
  (`on delete cascade`). If two phones replaced the same item before syncing, both apply the one
  with the lower id, so they agree without a unique constraint that would drop an offline write.
- **A service can count as an owner's item.** `service_records.item_id` no longer has a foreign key
  to `maintenance_items`; a trigger accepts a schedule item or one of the same car's own items,
  and fails anything else with the foreign key's code (23503), so the uploader still keeps the
  service without the link. Deleting an owner's item keeps its services, named by their notes.
- An unmatched car (not synced back with a configuration) can have its owner's items before its
  schedule arrives.

## Revisit when

Owners want to hide schedule items they never do, or schedules come per VIN with items the owner
has already replaced under another id.
