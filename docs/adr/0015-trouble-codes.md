# 0015 Check-engine codes are looked up on the phone from a fixed table

Status: accepted, 2026-10-17

## Decision

The owner types the codes a scan tool or parts store read (such as P0420) and says whether the
light is steady or flashing. Each code comes back with what it means, how urgent it is (stop
driving, fix soon, can wait), its usual causes, a tip, and the recalls and NHTSA complaints for the
model year about the same part of the car. Ask is one tap away for any code.

- **A fixed, tested table in core** (`codes/troubleCodes.ts`) of the generic SAE J2012 codes owners
  see most, written in plain words. Codes not in it are described from their structure: the letter
  and third character say the area (emissions, transmission, ABS…), and the second character says
  whether the meaning is the manufacturer's own. Same code, same answer, offline, at no cost.
- **Urgency is ours, not a model's.** A flashing light always means stop. Otherwise the most
  urgent code sets the headline.
- **Matching recalls and complaints by NHTSA component words.** Each code area (or code) names
  the component words it relates to, such as `POWER TRAIN` for transmission codes. It is shown as
  "owners reported problems with this part", not as a diagnosis.
- **The federal emissions warranty** (8 years or 80,000 miles on catalytic converters and the
  engine computer) is pointed out when the car's model year and latest odometer reading say it may
  still apply.
- **No sharing gate.** Nothing leaves the phone unless the owner taps "Ask about", and Ask has its
  own consent.

## Why

Owners want to know how urgent a light is before they decide whether to drive to work. A typed
code is the smallest useful step (the research ranked it fourth); it needs no hardware, account or
data licence.

## What we give up

- Manufacturer-specific codes (P1xxx) get only a general description; Ask fills the gap.
- No Bluetooth OBD reading yet. That needs a native module and a new port.

## Revisit if

Owners ask for live reading from an adapter, unlisted codes are common enough to widen the table,
or a licensed code database becomes available.
