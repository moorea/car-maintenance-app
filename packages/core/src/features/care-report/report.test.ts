import { describe, expect, it } from 'vitest'
import type { MaintenanceItem, ServiceRecord, Vehicle } from '../../domain/types'
import { buildCareReport, countLateGaps } from './report'
import { escapeHtml, renderCareReportHtml, type ReportColors } from './html'

const car: Vehicle = {
  id: 'v1',
  configId: 'c1',
  vin: 'JTMB1RFV5MD000001',
  year: 2021,
  make: 'Toyota',
  model: 'RAV4',
  trim: 'XLE',
  drivetrain: 'AWD',
  nickname: 'RAV',
  severeDuty: false,
}

const oil: MaintenanceItem = {
  id: 'oil',
  configId: 'c1',
  task: 'Oil change',
  intervalMiles: 5_000,
  intervalMonths: 6,
  source: 'baseline',
}
const rotation: MaintenanceItem = { ...oil, id: 'rot', task: 'Tire rotation' }
const { intervalMonths: _months, ...milesOnly } = oil
const plugs: MaintenanceItem = {
  ...milesOnly,
  id: 'plugs',
  task: 'Spark plugs',
  intervalMiles: 60_000,
}

const service = (
  id: string,
  itemId: string | undefined,
  performedOn: string,
  odometerMiles: number,
  extra: Partial<ServiceRecord> = {},
): ServiceRecord => ({
  id,
  vehicleId: 'v1',
  ...(itemId !== undefined && { itemId }),
  performedOn,
  odometerMiles,
  ...extra,
})

const records = [
  service('r1', 'oil', '2025-01-10', 10_000, { shop: 'Main St Auto', costCents: 7_500 }),
  service('r2', 'oil', '2025-07-01', 14_800, { notes: 'Synthetic 0W-20' }),
  // Ten months later: past six months by more than the tolerance.
  service('r3', 'oil', '2026-05-01', 19_500, { shop: 'Main St Auto', costCents: 8_000 }),
  service('r4', 'rot', '2026-05-01', 19_500, { shop: 'Main St Auto' }),
  service('r5', undefined, '2026-06-01', 20_400, { notes: 'Wiper blades', costCents: 2_999 }),
]

const report = () =>
  buildCareReport({
    vehicle: car,
    items: [oil, rotation, plugs],
    records,
    readings: [{ vehicleId: 'v1', date: '2026-10-17', miles: 24_000 }],
    warranties: [
      {
        id: 'w1',
        vehicleId: 'v1',
        kind: 'powertrain',
        provider: 'Toyota',
        startsOn: '2021-03-01',
        months: 60,
        endMiles: 60_000,
      },
    ],
    today: '2026-10-17',
  })

describe('care report', () => {
  it('describes the car and when it was prepared', () => {
    const r = report()
    expect(r.title).toBe('2021 Toyota RAV4')
    expect(r.subtitle).toBe('XLE · AWD')
    expect(r.vin).toBe('JTMB1RFV5MD000001')
    expect(r.odometer).toBe('24,000 mi')
    expect(r.preparedOn).toBe('Oct 17, 2026')
    expect(r.fileName).toBe('Care report 2021 Toyota RAV4 2026-10-17')
  })

  it('totals the services, the work the owner did and the money spent', () => {
    expect(report().summary).toEqual({
      services: 5,
      diy: 2,
      spent: '$184.99',
      span: 'Jan 10, 2025 to Jun 1, 2026',
    })
  })

  it('lists the history newest first, with work the owner did marked as theirs', () => {
    const history = report().history
    expect(history.map((h) => h.what)).toEqual([
      'Wiper blades',
      'Tire rotation',
      'Oil change',
      'Oil change',
      'Oil change',
    ])
    expect(history[0]).toMatchObject({ by: 'Owner', diy: true, cost: '$29.99', notes: undefined })
    expect(history.find((h) => h.id === 'r2')).toMatchObject({
      by: 'Owner',
      notes: 'Synthetic 0W-20',
      miles: '14,800 mi',
    })
  })

  it('marks each scheduled item by how it was kept up', () => {
    expect(report().schedule.map((s) => [s.task, s.statusLabel, s.times])).toEqual([
      ['Oil change', 'Late once', 3],
      ['Spark plugs', 'Not in the log', 0],
      ['Tire rotation', 'On schedule', 1],
    ])
    expect(report().schedule[0]?.lastDone).toBe('May 1, 2026 at 19,500 mi')
  })

  it('says an item is overdue when it is due now and not done', () => {
    const late = buildCareReport({
      vehicle: car,
      items: [rotation],
      records: [service('r4', 'rot', '2025-01-01', 10_000)],
      readings: [{ vehicleId: 'v1', date: '2026-10-17', miles: 24_000 }],
      warranties: [],
      today: '2026-10-17',
    })
    expect(late.schedule[0]).toMatchObject({ status: 'overdue', statusLabel: 'Overdue' })
  })

  it('counts a gap as late by miles as well as by time', () => {
    const twice = [
      service('a', 'oil', '2026-01-01', 10_000),
      service('b', 'oil', '2026-03-01', 16_000),
    ]
    expect(countLateGaps(oil, twice, false)).toBe(1)
    // Severe driving does not change an item with no severe interval.
    expect(countLateGaps(oil, twice, true)).toBe(1)
    const onTime = [
      service('a', 'oil', '2026-01-01', 10_000),
      service('b', 'oil', '2026-07-01', 15_400),
    ]
    expect(countLateGaps(oil, onTime, false)).toBe(0)
  })

  it('shows each warranty with its term and where it stands', () => {
    expect(report().warranties).toEqual([
      {
        id: 'w1',
        coverage: 'Powertrain',
        provider: 'Toyota',
        term: 'Mar 1, 2021 to Mar 1, 2026 or 60,000 mi',
        status: 'Ended Mar 1, 2026',
        state: 'ended',
        policyNumber: undefined,
      },
    ])
  })

  it('says when the schedule is general guidance', () => {
    expect(report().scheduleTitle).toBe('General schedule, normal driving')
    expect(report().scheduleNote).toBe("General guidance for most cars, not Toyota's own schedule.")
  })
})

const colors: ReportColors = {
  text: 'black',
  textSecondary: 'gray',
  accent: 'teal',
  separator: 'silver',
  warning: 'orange',
  subtle: 'whitesmoke',
}

describe('care report layout', () => {
  it('escapes everything the owner typed', () => {
    expect(escapeHtml(`<b>"Tom's" & co</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&#39;s&quot; &amp; co&lt;/b&gt;',
    )
    const html = renderCareReportHtml({ ...report(), title: '<script>alert(1)</script>' }, colors)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('includes every section and service', () => {
    const html = renderCareReportHtml(report(), colors)
    for (const text of ['Warranties', 'Maintenance against the schedule', 'Service history'])
      expect(html).toContain(text)
    expect(html.match(/<span class="tag">DIY<\/span>/g)).toHaveLength(2)
    expect(html).toContain('Main St Auto')
  })

  it('leaves out the warranty section when there are none', () => {
    const html = renderCareReportHtml({ ...report(), warranties: [] }, colors)
    expect(html).not.toContain('<h2>Warranties</h2>')
  })

  it('uses the colours it is given', () => {
    expect(renderCareReportHtml(report(), colors)).toContain('color: teal')
  })

  it('shows providers, policy numbers, notes and the schedule note', () => {
    const r = report()
    const warranties = r.warranties.map((w) => ({ ...w, policyNumber: 'PT-77' }))
    const html = renderCareReportHtml({ ...r, warranties }, colors)
    for (const text of ['Toyota', 'PT-77', 'Synthetic 0W-20', 'not Toyota&#39;s own schedule'])
      expect(html).toContain(text)
  })

  it('says when nothing is logged yet, and leaves out what is unknown about the car', () => {
    const html = renderCareReportHtml(
      {
        ...report(),
        vin: undefined,
        odometer: undefined,
        subtitle: '',
        history: [],
        schedule: [],
        summary: { services: 0, diy: 0, spent: '$0.00', span: undefined },
      },
      colors,
    )
    expect(html).toContain('No services logged yet.')
    expect(html).not.toContain('VIN')
    expect(html).not.toContain('Maintenance against the schedule')
    expect(html).not.toContain('Records from')
  })

  it('keeps the file name safe for a file system', () => {
    const r = buildCareReport({
      vehicle: { ...car, make: 'AC/DC', model: 'Mk: "2"?' },
      items: [],
      records: [],
      readings: [],
      warranties: [],
      today: '2026-10-17',
    })
    expect(r.fileName).toBe('Care report 2021 ACDC Mk 2 2026-10-17')
  })
})
