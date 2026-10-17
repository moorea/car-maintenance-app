import { describe, expect, it } from 'vitest'
import type { ComplaintSummary, Recall } from '../domain/types'
import { lookupCode, mostUrgent, parseCodes, type LookupContext } from './lookupCode'
import { TROUBLE_CODES } from './troubleCodes'

const complaint = (component: string, complaints: number): ComplaintSummary => ({
  id: component,
  configId: 'c1',
  component,
  complaints,
  crashes: 0,
  fires: 0,
  injuries: 0,
  deaths: 0,
  recent: [],
})

const recall = (campaign: string, component: string): Recall => ({
  id: campaign,
  configId: 'c1',
  campaign,
  component,
  summary: 'A part may fail.',
  parkIt: false,
  parkOutside: false,
  overTheAir: false,
})

const ctx = (patch: Partial<LookupContext> = {}): LookupContext => ({
  make: 'Toyota',
  year: 2021,
  currentYear: 2026,
  recalls: [],
  complaints: [],
  ...patch,
})

describe('parseCodes', () => {
  it('reads codes in any case, separated by commas, spaces or new lines', () => {
    expect(parseCodes('p0420, P0171\nu0100')).toEqual({
      codes: ['P0420', 'P0171', 'U0100'],
      invalid: [],
    })
  })

  it('joins a letter typed apart from its digits', () => {
    expect(parseCodes('P 0300 and P-0301').codes).toEqual(['P0300', 'P0301'])
  })

  it('takes a bare four-character code as an engine code', () => {
    expect(parseCodes('0420').codes).toEqual(['P0420'])
  })

  it('ignores words and repeated codes', () => {
    expect(parseCodes('code P0420 then P0420 again')).toEqual({ codes: ['P0420'], invalid: [] })
  })

  it('ignores a model year or OBD2 typed beside a lettered code', () => {
    expect(parseCodes('2019 Camry, OBD2 says P0420')).toEqual({ codes: ['P0420'], invalid: [] })
  })

  it('reports anything with a digit that is not a code', () => {
    expect(parseCodes('P04200 P9420 X0420')).toEqual({
      codes: [],
      invalid: ['P04200', 'P9420', 'X0420'],
    })
  })
})

describe('lookupCode', () => {
  it('explains a listed code with its urgency and causes', () => {
    const found = lookupCode('P0420', ctx())
    expect(found).toMatchObject({
      code: 'P0420',
      known: true,
      generic: true,
      title: 'Catalytic converter below efficiency (bank 1)',
      system: 'emissions',
      urgency: 'later',
    })
    expect(found.causes[0]).toBe('An ageing catalytic converter')
  })

  it('says how urgent the codes that can wreck an engine are', () => {
    expect(lookupCode('P0217', ctx()).urgency).toBe('stop')
    expect(lookupCode('P0524', ctx()).urgency).toBe('stop')
    expect(lookupCode('P0300', ctx()).urgency).toBe('soon')
    expect(lookupCode('P0455', ctx()).urgency).toBe('later')
  })

  it('lists every cylinder’s misfire, injector and coil code', () => {
    expect(lookupCode('P0306', ctx()).title).toBe('Cylinder 6 misfire')
    expect(lookupCode('P0312', ctx()).title).toBe('Cylinder 12 misfire')
    expect(lookupCode('P0204', ctx()).title).toBe('Fuel injector circuit, cylinder 4')
    expect(lookupCode('P0352', ctx()).title).toBe('Ignition coil B circuit (usually cylinder 2)')
  })

  it('suggests the gas cap first for evaporative leaks', () => {
    expect(lookupCode('P0456', ctx()).tip).toMatch(/gas cap/)
  })

  it('describes an unlisted generic code from its structure', () => {
    expect(lookupCode('P0700', ctx()).known).toBe(true)
    expect(lookupCode('P0789', ctx())).toMatchObject({
      known: false,
      generic: true,
      title: 'A transmission code',
      urgency: 'soon',
      causes: [],
    })
    expect(lookupCode('P0466', ctx())).toMatchObject({
      title: 'An emissions code',
      urgency: 'later',
    })
  })

  it('names the maker for a manufacturer-specific code', () => {
    expect(lookupCode('P1456', ctx())).toMatchObject({
      known: false,
      generic: false,
      title: 'A Toyota engine code',
    })
    expect(lookupCode('P1456', ctx({ make: 'Audi' })).title).toBe('An Audi engine code')
    expect(lookupCode('P3400', ctx()).generic).toBe(true)
    expect(lookupCode('P3000', ctx()).generic).toBe(false)
    expect(lookupCode('B1234', ctx()).generic).toBe(false)
    expect(lookupCode('U0100', ctx()).generic).toBe(true)
  })

  it('warns that body and chassis codes can be about airbags and ABS', () => {
    expect(lookupCode('B0001', ctx()).tip).toMatch(/airbag/)
    expect(lookupCode('C0035', ctx()).tip).toMatch(/ABS/)
  })

  it('puts each code in the right area of the car', () => {
    expect(lookupCode('P0A80', ctx()).system).toBe('hybrid')
    expect(lookupCode('P2A00', ctx()).systemLabel).toBe('Fuel and air')
    expect(lookupCode('P3400', ctx()).system).toBe('powertrain')
    expect(lookupCode('P0217', ctx()).systemLabel).toBe('Cooling')
    expect(lookupCode('P0218', ctx()).system).toBe('transmission')
    expect(lookupCode('P0524', ctx()).systemLabel).toBe('Engine')
    expect(lookupCode('P0562', ctx()).systemLabel).toBe('Battery and charging')
  })

  it('finds recalls and complaints about the same part of the car', () => {
    const found = lookupCode(
      'P0300',
      ctx({
        recalls: [
          recall('24V001000', 'ENGINE AND ENGINE COOLING: ENGINE'),
          recall('24V002000', 'AIR BAGS'),
        ],
        complaints: [
          complaint('SERVICE BRAKES', 50),
          complaint('ENGINE', 12),
          complaint('ENGINE AND ENGINE COOLING', 30),
        ],
      }),
    )
    expect(found.recalls.map((r) => r.campaign)).toEqual(['24V001000'])
    expect(found.complaints.map((c) => c.component)).toEqual([
      'ENGINE AND ENGINE COOLING',
      'ENGINE',
    ])
  })

  it('matches transmission codes to power train complaints only', () => {
    const found = lookupCode(
      'P0730',
      ctx({
        complaints: [complaint('POWER TRAIN: AUTOMATIC TRANSMISSION', 9), complaint('ENGINE', 4)],
      }),
    )
    expect(found.complaints.map((c) => c.component)).toEqual([
      'POWER TRAIN: AUTOMATIC TRANSMISSION',
    ])
  })

  it('points to the emissions warranty while the car may still be covered', () => {
    expect(lookupCode('P0420', ctx({ year: 2021, miles: 40_000 })).warranty).toMatch(
      /8 years or 80,000 miles.*Toyota dealer/,
    )
    expect(lookupCode('P0420', ctx({ year: 2015 })).warranty).toBeUndefined()
    expect(lookupCode('P0420', ctx({ year: 2021, miles: 95_000 })).warranty).toBeUndefined()
    expect(lookupCode('P0171', ctx()).warranty).toBeUndefined()
    // EGR valves have the shorter 2-year coverage, not 8 years.
    expect(lookupCode('P0401', ctx()).warranty).toBeUndefined()
  })

  it('keeps every listed code well formed', () => {
    for (const [code, entry] of Object.entries(TROUBLE_CODES)) {
      expect(code).toMatch(/^[PBCU][0-3][0-9A-F]{3}$/)
      expect(entry.title.length).toBeGreaterThan(0)
      expect(entry.causes.length).toBeGreaterThan(0)
    }
  })
})

describe('mostUrgent', () => {
  it('picks the most urgent, or not urgent when there is nothing', () => {
    expect(mostUrgent(['later', 'stop', 'soon'])).toBe('stop')
    expect(mostUrgent(['later', 'soon'])).toBe('soon')
    expect(mostUrgent([])).toBe('later')
  })
})
