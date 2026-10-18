import { describe, expect, it } from 'vitest'
import type { Bulletin, MaintenanceItem, Recall, ServiceRecord } from '../domain/types'
import { checkQuote, type QuoteCheckInput } from './checkQuote'

const item = (kind: string, task: string, fields: Partial<MaintenanceItem>): MaintenanceItem => ({
  id: kind,
  configId: 'c1',
  kind,
  task,
  source: 'baseline',
  ...fields,
})

const schedule: MaintenanceItem[] = [
  item('engine-oil', 'Oil & filter change', {
    intervalMiles: 5_000,
    intervalMonths: 6,
    severeMiles: 3_000,
    severeMonths: 6,
  }),
  item('tire-rotation', 'Tire rotation', { intervalMiles: 5_000, intervalMonths: 6 }),
  item('cabin-air-filter', 'Cabin air filter', { intervalMiles: 15_000, intervalMonths: 12 }),
  item('brake-fluid', 'Brake fluid', { intervalMiles: 30_000, intervalMonths: 24 }),
  item('spark-plugs', 'Spark plugs', { intervalMiles: 60_000 }),
  item('transmission-fluid', 'Transmission fluid', { intervalMiles: 60_000, severeMiles: 30_000 }),
  item('engine-air-filter', 'Engine air filter', {
    intervalMiles: 15_000,
    intervalMonths: 24,
    severeMiles: 7_500,
    severeMonths: 12,
  }),
]

const record = (itemId: string, performedOn: string, odometerMiles: number): ServiceRecord => ({
  id: `r-${itemId}`,
  vehicleId: 'v1',
  itemId,
  performedOn,
  odometerMiles,
})

const recall: Recall = {
  id: 'rc1',
  configId: 'c1',
  campaign: '24V123000',
  component: 'ELECTRICAL SYSTEM: WIRING: HARNESS',
  summary: 'A harness may short.',
  parkIt: false,
  parkOutside: false,
  overTheAir: false,
}

// A 2021 car driven about 60 miles a day, at roughly 36,200 miles today.
const base: Omit<QuoteCheckInput, 'lines'> = {
  vehicle: { id: 'v1', year: 2021, make: 'Toyota', severeDuty: false },
  items: schedule,
  records: [
    record('engine-oil', '2026-07-01', 30_000),
    record('cabin-air-filter', '2026-09-01', 33_000),
    record('engine-air-filter', '2026-06-01', 28_000),
  ],
  readings: [
    { vehicleId: 'v1', date: '2026-04-02', miles: 24_150 },
    { vehicleId: 'v1', date: '2026-10-10', miles: 35_780 },
  ],
  recalls: [recall],
  today: '2026-10-17',
}

const check = (texts: string[], input: Partial<QuoteCheckInput> = {}) =>
  checkQuote({ ...base, lines: texts.map((text) => ({ text })), ...input })

const only = (text: string, input: Partial<QuoteCheckInput> = {}) => {
  const line = check([text], input).lines[0]
  if (!line) throw new Error('No line')
  return line
}

describe('checking a shop quote', () => {
  it('says scheduled work that is due is due, with when it was last done', () => {
    expect(only('Oil change')).toMatchObject({
      verdict: 'due',
      label: 'Overdue',
      detail: 'Done Jul 1 at 30,000 mi, so it is due already.',
      questionable: false,
    })
  })

  it('says work already done recently is not due again, and when it next is', () => {
    expect(only('Cabin air filter $79.95')).toMatchObject({
      verdict: 'done',
      label: 'Done already',
      detail: 'Done Sep 1 at 33,000 mi. Next due at 48,000 mi.',
      questionable: true,
    })
  })

  it('calls out work due only on the severe schedule the car does not follow', () => {
    expect(only('Transmission fluid exchange')).toMatchObject({
      verdict: 'severe-only',
      detail: expect.stringContaining('first due at 60,000 mi'),
      questionable: true,
    })
    expect(only('Engine air filter')).toMatchObject({
      verdict: 'severe-only',
      detail: expect.stringContaining('next due at 43,000 mi'),
    })
  })

  it('treats severe-schedule work as due on a car set to severe driving', () => {
    const severe = { vehicle: { ...base.vehicle, severeDuty: true } }
    expect(only('Transmission fluid exchange', severe).verdict).toBe('no-record')
    expect(only('Engine air filter', severe).verdict).toBe('due')
  })

  it('says a first interval the car has not reached yet is not due', () => {
    expect(only('Replace spark plugs')).toMatchObject({
      verdict: 'not-due',
      detail: 'First due at 60,000 mi. Your car is at about 36,230 mi.',
    })
  })

  it('leaves it to the owner when the log has no record of work the car is old enough for', () => {
    expect(only('Brake fluid flush')).toMatchObject({ verdict: 'no-record', questionable: false })
  })

  it('counts work due within a few weeks or 1,000 miles as due now', () => {
    const rotated = { records: [record('tire-rotation', '2026-05-01', 31_500)] }
    // Due at 36,500 mi, about 300 miles away.
    expect(only('Tire rotation', rotated)).toMatchObject({ verdict: 'due', label: 'Due now' })
  })

  it('flags common add-ons that are not on the schedule, saying why', () => {
    expect(only('Fuel injection service')).toMatchObject({
      verdict: 'not-scheduled',
      detail: expect.stringContaining('not on manufacturer schedules'),
      questionable: true,
    })
    expect(only('Front and rear differential fluid').verdict).toBe('not-scheduled')
  })

  it('uses the car’s own schedule for a job it does list', () => {
    const diff = item('differential-fluid', 'Differential fluid', { intervalMiles: 30_000 })
    expect(only('Differential fluid', { items: [...schedule, diff] }).verdict).toBe('no-record')
  })

  it('flags a scheduled kind this car’s schedule leaves out', () => {
    expect(only('Timing belt')).toMatchObject({ verdict: 'not-scheduled', questionable: true })
  })

  it('asks for proof on wear parts and repairs rather than judging them', () => {
    expect(only('Front brake pads')).toMatchObject({ verdict: 'condition', questionable: false })
    expect(only('Oil leak at valve cover gasket')).toMatchObject({
      verdict: 'condition',
      label: 'Repair',
    })
  })

  it('says recall work is free, naming the recall when the line gives its campaign', () => {
    expect(only('Recall 24V123000 $120')).toMatchObject({ verdict: 'recall', questionable: false })
    const charged = check(['Recall 24V123000'], {
      lines: [{ text: 'Recall 24V123000', priceCents: 12_000 }],
    }).lines[0]
    expect(charged).toMatchObject({
      verdict: 'recall',
      detail:
        'Recall 24V123000: Electrical system: wiring. Recall fixes are free at any Toyota dealer.',
      questionable: true,
    })
  })

  it('says when time-based work is next due, from the newest record', () => {
    const battery = item('battery-test', '12-volt battery test', { intervalMonths: 12 })
    const result = only('Battery test', {
      items: [...schedule, battery],
      records: [
        ...base.records,
        record('battery-test', '2025-03-01', 15_000),
        { ...record('battery-test', '2026-09-01', 33_000), id: 'r-newer' },
      ],
    })
    expect(result).toMatchObject({
      verdict: 'done',
      detail: 'Done Sep 1 at 33,000 mi. Next due in Sep 2027.',
    })
  })

  it('does not question mileage-only work on a car with no odometer reading', () => {
    const result = check(['Transmission fluid exchange'], {
      records: [
        { id: 'r1', vehicleId: 'v1', itemId: 'transmission-fluid', performedOn: '2022-01-01' },
      ],
      readings: [],
    })
    expect(result.lines[0]).toMatchObject({
      verdict: 'unknown',
      label: 'Needs your mileage',
      detail: 'Done Jan 1, 2022. Add your mileage to see whether it is due.',
      questionable: false,
    })
  })

  it('cannot judge a scheduled item that has no interval', () => {
    const asNeeded = item('wiper-blades', 'Wiper blades', {})
    expect(only('Wiper blades', { items: [...schedule, asNeeded] })).toMatchObject({
      verdict: 'unknown',
      label: 'As needed',
    })
  })

  it('cannot check anything against a car with no schedule', () => {
    expect(only('Timing belt', { items: [] })).toMatchObject({ verdict: 'unknown' })
  })

  it('cannot check a line it does not recognise', () => {
    expect(only('Multi-point inspection')).toMatchObject({
      verdict: 'unknown',
      questionable: false,
    })
  })

  it('sums up how many lines and how much money are worth questioning', () => {
    const result = checkQuote({
      ...base,
      lines: [
        { text: 'Oil change', priceCents: 8_995 },
        { text: 'Cabin air filter', priceCents: 7_995 },
        { text: 'Fuel injection service', priceCents: 18_900 },
        { text: 'Multi-point inspection' },
      ],
    })
    expect(result.headline).toBe('2 of 4 lines aren’t needed now')
    expect(result.savings).toBe('$268.95 of $358.90 is worth questioning')
  })

  it('says so when nothing on the quote looks unneeded', () => {
    expect(check(['Oil change']).headline).toBe('Nothing here looks unneeded')
    expect(check(['Oil change']).savings).toBeUndefined()
  })

  it('lists recalls the quote does not mention, since their fixes are free', () => {
    expect(check(['Oil change']).recalls).toEqual([
      { campaign: '24V123000', title: 'Electrical system: wiring' },
    ])
    expect(check(['Recall 24V123000']).recalls).toEqual([])
  })

  it('says a line with several jobs is needed when any of them is, giving each one’s verdict', () => {
    const result = check(['Oil change + tire rotation $120'], {
      records: [
        record('engine-oil', '2026-10-01', 35_500),
        record('tire-rotation', '2026-01-10', 20_000),
      ],
    })
    expect(result.lines[0]).toMatchObject({
      verdict: 'due',
      label: 'Overdue',
      questionable: false,
    })
    expect(result.lines[0]?.detail).toMatch(
      /^Oil & filter change: (?!overdue).*Tire rotation: overdue\./,
    )
    expect(result.savings).toBeUndefined()
    expect(result.alsoDue).toEqual([])
  })

  it('questions a line with several jobs when none of them is needed', () => {
    expect(only('Cabin & engine air filters $140')).toMatchObject({
      verdict: 'done',
      questionable: true,
    })
  })

  it('treats balancing and quick checks as needed only when shown, not as unscheduled', () => {
    expect(only('Tire balance')).toMatchObject({ verdict: 'condition', questionable: false })
    expect(only('Clean battery terminals')).toMatchObject({
      verdict: 'condition',
      label: 'Quick job',
      questionable: false,
    })
  })

  it('recognises a recall however its number is written', () => {
    for (const text of ['Recall 24V-123', 'Recall 24v123', 'Safety recall 24V-123-000']) {
      const result = check([text])
      expect(result.lines[0]?.detail).toContain('Recall 24V123000')
      expect(result.recalls).toEqual([])
    }
  })

  it('lists scheduled work that is due but missing from the quote', () => {
    const result = check(['Oil change'], {
      records: [...base.records, record('tire-rotation', '2026-01-10', 20_000)],
    })
    expect(result.alsoDue).toEqual(['Tire rotation'])
  })

  it('says when the schedule it checked against is general guidance', () => {
    expect(check(['Oil change']).generalSchedule).toBe(true)
    const own = schedule.map((i) => ({ ...i, source: 'dataone' }))
    expect(check(['Oil change'], { items: own }).generalSchedule).toBe(false)
  })

  const bulletin = (nhtsaId: number, extra: Partial<Bulletin>): Bulletin => ({
    id: `b${nhtsaId}`,
    configId: 'c1',
    nhtsaId,
    kind: 'bulletin',
    components: ['ENGINE'],
    summary: 'Coolant may leak from the water pump. Replace the pump.',
    ...extra,
  })

  it('names a warranty extension that may make a repair free', () => {
    const [line] = check(['Replace water pump'], {
      bulletins: [
        bulletin(1, { documentId: 'T-SB-0101' }),
        bulletin(2, {
          kind: 'warranty',
          documentId: 'ZJT',
          components: ['ENGINE AND ENGINE COOLING'],
        }),
      ],
    }).lines
    expect(line?.bulletins.map((b) => [b.name, b.mayBeFree])).toEqual([
      ['Warranty extension ZJT', true],
      ['Service bulletin T-SB-0101', false],
    ])
    expect(line?.detail).toContain(
      "Toyota's warranty extension ZJT may cover this: ask the shop before paying.",
    )
  })

  it('shows bulletins only beside repairs, not scheduled maintenance', () => {
    const result = check(['Oil change', 'Replace water pump'], {
      bulletins: [bulletin(1, { components: ['ENGINE'] })],
    })
    expect(result.lines[0]?.bulletins).toEqual([])
    expect(result.lines[1]?.bulletins).toHaveLength(1)
  })

  it('shows no bulletins about other parts of the car', () => {
    const [line] = check(['Replace water pump'], {
      bulletins: [bulletin(1, { components: ['SERVICE BRAKES'] })],
    }).lines
    expect(line?.bulletins).toEqual([])
    expect(line?.detail).not.toContain('may cover')
  })
})
