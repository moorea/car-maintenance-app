# App Store listing

Draft copy for App Store Connect, built on the
[Marketing story](https://claude.ai/code/artifact/b9f5fbaf-c3c7-44dc-a6d5-9f7ca7798edf). Every
claim is something the app does today. `[Name]` waits on the app's name.

## Name and subtitle

| Field    | Limit | Copy                             | Length              |
| -------- | ----- | -------------------------------- | ------------------- |
| Name     | 30    | `[Name]: Car Care`               | depends on the name |
| Subtitle | 30    | `Maintenance, recalls & answers` | 30                  |

## Promotional text (170, can change without a review)

> See every recall for your model, know what is due before the shop tells you, and ask anything
> about your car in plain English. Nothing to plug in.

(146 characters)

## Description (4,000)

> Know what your car needs, what's been recalled and what tends to break on your model, and ask
> anything about it in plain English.
>
> Most of us drive a car we don't understand and pay for repairs we can't judge. [Name] knows
> your exact car and is on your side. Add it once by VIN, or by year, make and model, and it
> shows you everything that matters, with no dongle and no shop network.
>
> KNOWS YOUR CAR
> • What's due: your car's maintenance schedule, replanned from your odometer readings.
> • Recalls for your model, straight from NHTSA, with a link to check your own VIN.
> • Known problems: what other owners of the same model year report to NHTSA, grouped by part.
>
> ANSWERS YOU CAN CHECK
> • Ask anything about your car: "What's due next?", "Is that noise a known problem?"
> • Answers come from your car's schedule, your service log and federal safety data, and every
> answer shows its sources. When it doesn't know, it says so.
>
> WALK INTO THE SHOP KNOWING MORE
> • Photograph a shop's quote and see which items your car's schedule calls for, which you had
> done recently, and which match a recall.
>
> ON YOUR SIDE
> • No partner shops, no dealer, nothing to plug in.
> • Your own work counts. DIY or shop, it all goes in the service log.
> • Keep receipts, registration and insurance with the car they belong to.
> • Track warranty coverage and share a proof-of-care PDF when you sell.
>
> OUT OF YOUR WAY
> • A heads-up two weeks before a service is due, and on the day.
> • Log fill-ups and charging to see fuel economy and what the car costs to run.
> • Every car in your household in one garage.
> • Works offline. Your garage, history and reminders live on your phone and sync when there's
> signal.
> • Export everything as open CSV and JSON files, with your photos, any time.
>
> Schedules are a general maintenance baseline for your type of car until manufacturer data is
> added. Ask explains your car's records; it is not a mechanic and cannot inspect your car. For
> anything about safety, have the car checked by a professional. Recall data covers your model
> and year; use the NHTSA link to check your own VIN.

## Keywords (100)

`oil change,vin,service log,reminder,mechanic,repair,quote,nhtsa,auto,garage,warranty,receipt,mileage`

(100 characters. Words already in the name and subtitle are indexed, so they are left out.)

## Other fields

| Field                      | Value                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary category           | Utilities                                                                                                                                                                                                                  |
| Secondary category         | Lifestyle                                                                                                                                                                                                                  |
| Age rating                 | Answer the questionnaire: no objectionable content, no unrestricted web access. Ask is a chatbot limited to the car's own data, so declare it if the questionnaire asks about AI assistants. Expect 4+ (or 9+ if it does). |
| Price                      | Waits on the pricing decision. Say nothing about price in the copy until then.                                                                                                                                             |
| Availability               | United States only                                                                                                                                                                                                         |
| Support URL                | `[SUPPORT URL]` (a page or mailto with a contact address)                                                                                                                                                                  |
| Marketing URL              | Optional                                                                                                                                                                                                                   |
| Privacy policy URL         | Where [privacy-policy.md](privacy-policy.md) is hosted                                                                                                                                                                     |
| Copyright                  | `2026 [Legal name]`                                                                                                                                                                                                        |
| What's New (first version) | `Hello! Add your car to see what's due, its recalls and known problems, and ask anything about it.`                                                                                                                        |

## Screenshots

6.9" iPhone screenshots (1320 × 2868), in this order, with these captions:

1. Garage: "Every car in your household. Everything it needs."
2. Car page: "Your car's schedule, recalls and known problems in one place."
3. Ask: "Ask anything. Get answers about your car, with sources."
4. Quote check: "Walk into the shop knowing more."
5. Recalls: "Recalls and owner complaints, straight from NHTSA."
6. Reminders: "A heads-up when something's actually due."
7. Service log: "Your own work counts. DIY or shop, it's all here."

They need a real iPhone or Simulator build: the web preview's screenshots are close but not
pixel-accurate to iOS.

## Words to avoid

From the marketing story: not "your manufacturer's schedule" (the app shows a general baseline),
not "your car has a recall" (recall data is by model year, not VIN), not "AI mechanic" or
"diagnose", and nothing about price.
