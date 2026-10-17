import { describe, expect, it } from 'vitest'
import type { Bulletin, ComplaintSummary } from '../domain/types'
import {
  bulletinBody,
  bulletinName,
  bulletinTitle,
  byBulletinImportance,
  describeMileageWindow,
  groupBulletins,
  hasMileageData,
  issuesNearMileage,
  peakMileage,
  readableSummary,
  sameComponent,
} from './knownIssues'

const summary = (
  component: string,
  byMileage: ComplaintSummary['byMileage'],
  complaints = 10,
): ComplaintSummary => ({
  id: component,
  configId: 'c',
  component,
  complaints,
  crashes: 0,
  fires: 0,
  injuries: 0,
  deaths: 0,
  recent: [],
  ...(byMileage ? { byMileage } : {}),
})

const bulletin = (over: Partial<Bulletin> & { nhtsaId: number }): Bulletin => ({
  id: `b${over.nhtsaId}`,
  configId: 'c',
  kind: 'bulletin',
  components: ['ENGINE'],
  summary: 'Some engines may tick at idle.',
  ...over,
})

describe('issuesNearMileage', () => {
  const summaries = [
    summary('POWER TRAIN', [
      { from: 70_000, complaints: 9 },
      { from: 80_000, complaints: 6 },
      { from: 90_000, complaints: 5 },
      { from: 100_000, complaints: 20 },
    ]),
    summary('ENGINE', [{ from: 90_000, complaints: 3 }]),
    summary('SEATS', [{ from: 80_000, complaints: 1 }]),
    summary('AIR BAGS', undefined),
  ]

  it("counts what owners reported in the car's band and the next one", () => {
    const near = issuesNearMileage(summaries, [], 88_000)
    expect(near.from).toBe(80_000)
    expect(near.to).toBe(100_000)
    expect(near.issues.map((i) => [i.component, i.complaints])).toEqual([
      ['POWER TRAIN', 11],
      ['ENGINE', 3],
    ])
  })

  it('leaves out parts with a single complaint in the window', () => {
    const near = issuesNearMileage(summaries, [], 85_000)
    expect(near.issues.map((i) => i.component)).not.toContain('SEATS')
  })

  it('says when a warranty extension covers a part owners reported', () => {
    const near = issuesNearMileage(
      summaries,
      [bulletin({ nhtsaId: 1, kind: 'warranty', components: ['POWER TRAIN'] })],
      88_000,
    )
    expect(near.issues[0]).toEqual({
      component: 'POWER TRAIN',
      complaints: 11,
      bulletins: 1,
      covered: true,
    })
  })

  it('counts bulletins about the same part, however NHTSA names it', () => {
    const near = issuesNearMileage(
      summaries,
      [
        bulletin({ nhtsaId: 1, components: ['ENGINE AND ENGINE COOLING'] }),
        bulletin({ nhtsaId: 2, components: ['POWER TRAIN'] }),
        bulletin({ nhtsaId: 3, components: ['ELECTRICAL SYSTEM'] }),
      ],
      88_000,
    )
    expect(near.issues.map((i) => i.bulletins)).toEqual([1, 1])
    expect(near.issues.map((i) => i.covered)).toEqual([false, false])
  })

  it('starts at zero for a new car', () => {
    const near = issuesNearMileage(summaries, [], 0)
    expect([near.from, near.to]).toEqual([0, 20_000])
    expect(near.issues).toEqual([])
  })
})

describe('mileage descriptions', () => {
  it('says the window in miles', () => {
    expect(describeMileageWindow(80_000, 100_000)).toBe('80,000–100,000 mi')
  })

  it('names the band most complaints fall in when one stands out', () => {
    expect(
      peakMileage(
        summary('ENGINE', [
          { from: 60_000, complaints: 7 },
          { from: 70_000, complaints: 2 },
        ]),
      ),
    ).toBe('60,000–70,000 mi')
  })

  it('names no band when two tie or there are too few', () => {
    expect(
      peakMileage(
        summary('ENGINE', [
          { from: 60_000, complaints: 4 },
          { from: 70_000, complaints: 4 },
        ]),
      ),
    ).toBeUndefined()
    expect(peakMileage(summary('ENGINE', [{ from: 60_000, complaints: 2 }]))).toBeUndefined()
  })

  it('knows when no complaint has a mileage yet', () => {
    expect(hasMileageData([summary('ENGINE', undefined)])).toBe(false)
    expect(hasMileageData([summary('ENGINE', [{ from: 0, complaints: 1 }])])).toBe(true)
  })
})

describe('sameComponent', () => {
  it('matches the ways NHTSA names one part', () => {
    expect(sameComponent('FUEL SYSTEM, GASOLINE', 'FUEL/PROPULSION SYSTEM')).toBe(true)
    expect(sameComponent('ENGINE', 'ENGINE AND ENGINE COOLING:COOLING SYSTEM')).toBe(true)
    expect(sameComponent('SEAT BELTS', 'SEATS')).toBe(false)
    expect(sameComponent('ELECTRICAL SYSTEM', 'ELECTRIC PROPULSION SYSTEM')).toBe(false)
  })

  it('never matches an unknown component', () => {
    expect(sameComponent('UNKNOWN OR OTHER', 'UNKNOWN OR OTHER')).toBe(false)
  })
})

describe('bulletins', () => {
  it('puts warranty extensions and campaigns first, then the newest', () => {
    const sorted = [
      bulletin({ nhtsaId: 1, issuedOn: '2024-01-01' }),
      bulletin({ nhtsaId: 2, issuedOn: '2020-01-01', kind: 'campaign' }),
      bulletin({ nhtsaId: 3, issuedOn: '2025-01-01' }),
      bulletin({ nhtsaId: 4, issuedOn: '2019-01-01', kind: 'warranty' }),
    ].sort(byBulletinImportance)
    expect(sorted.map((b) => b.nhtsaId)).toEqual([4, 2, 3, 1])
  })

  it('groups by part of the car, biggest group first', () => {
    const groups = groupBulletins([
      bulletin({ nhtsaId: 1, components: ['POWER TRAIN:AUTOMATIC TRANSMISSION'] }),
      bulletin({ nhtsaId: 2, components: ['ENGINE'] }),
      bulletin({ nhtsaId: 3, components: ['POWER TRAIN'] }),
    ])
    expect(groups.map((g) => [g.component, g.bulletins.length])).toEqual([
      ['POWER TRAIN', 2],
      ['ENGINE', 1],
    ])
  })

  it("is named by the manufacturer's number, or NHTSA's", () => {
    expect(bulletinName(bulletin({ nhtsaId: 7, documentId: '19-047' }))).toBe(
      'Service bulletin 19-047',
    )
    expect(bulletinName(bulletin({ nhtsaId: 7, kind: 'warranty' }))).toBe('Warranty extension #7')
  })

  it('takes its title from the first sentence of the summary', () => {
    expect(
      bulletinTitle(
        bulletin({
          nhtsaId: 1,
          summary: 'THE CVT MAY JUDDER WHEN ACCELERATING FROM A STOP. UPDATE THE PCM SOFTWARE.',
        }),
      ),
    ).toBe('The CVT may judder when accelerating from a stop')
  })
})

describe('bulletinBody', () => {
  it('is the summary after the sentence the title took', () => {
    expect(
      bulletinBody(
        bulletin({ nhtsaId: 1, summary: 'The CVT may judder. Update the PCM. Recheck.' }),
      ),
    ).toBe('Update the PCM. Recheck.')
  })

  it('is empty when the title is the whole summary', () => {
    expect(bulletinBody(bulletin({ nhtsaId: 1, summary: 'The CVT may judder.' }))).toBe('')
  })

  it('is the whole summary when the title had to be cut', () => {
    const summary = `${'Long words '.repeat(12)}here. Then more.`
    expect(bulletinBody(bulletin({ nhtsaId: 1, summary }))).toBe(summary)
  })
})

describe('readableSummary', () => {
  it('turns capitals into sentences, keeping acronyms and codes', () => {
    expect(readableSummary('SOME VEHICLES MAY SET DTC P0420. REPLACE THE 4WD ACTUATOR.')).toBe(
      'Some vehicles may set DTC P0420. Replace the 4WD actuator.',
    )
  })

  it('leaves ordinary text as written', () => {
    expect(readableSummary('Some Honda CR-V engines may burn oil.')).toBe(
      'Some Honda CR-V engines may burn oil.',
    )
  })
})
