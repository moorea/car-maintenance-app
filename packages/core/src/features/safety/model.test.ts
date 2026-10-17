import { describe, expect, it } from 'vitest'
import type { ComplaintSummary, Recall } from '../../domain/types'
import { memorySafety } from '../../testing'
import { createSafetyModel } from './model'

const recall = (campaign: string, extra: Partial<Recall> = {}): Recall => ({
  id: `r-${campaign}`,
  configId: 'c1',
  campaign,
  summary: `Recall ${campaign}`,
  parkIt: false,
  parkOutside: false,
  overTheAir: false,
  ...extra,
})

const complaints = (component: string, count: number): ComplaintSummary => ({
  id: `s-${component}`,
  configId: 'c1',
  component,
  complaints: count,
  crashes: 0,
  fires: 0,
  injuries: 0,
  deaths: 0,
  recent: [],
})

const CHECKED = '2026-10-17 12:00:00Z'

const setup = (options: { unmatched?: boolean; vin?: string } = {}) => {
  const safety = memorySafety()
  const model = createSafetyModel({
    configId: options.unmatched ? undefined : 'c1',
    vin: options.vin,
    safety,
  })
  return { safety, model }
}

describe('safety screen model', () => {
  it('stays loading until started', () => {
    expect(setup().model.getState().status).toBe('loading')
  })

  it('says nothing is known for a car not yet matched to a configuration', () => {
    const { model } = setup({ unmatched: true })
    model.getState().start()
    expect(model.getState().status).toBe('unmatched')
  })

  it('shows that NHTSA has not been asked yet, rather than claiming there are no recalls', () => {
    const { model } = setup()
    model.getState().start()
    expect(model.getState()).toMatchObject({ status: 'checking', complaintsChecked: false })
  })

  it('shows recalls once checked: do-not-drive first, then park-outside, then newest', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      recalls: [
        recall('20V001000', { reportedOn: '2020-01-01' }),
        recall('23V002000', { reportedOn: '2023-01-01' }),
        recall('19V003000', { reportedOn: '2019-01-01', parkOutside: true }),
        recall('18V004000', { reportedOn: '2018-01-01', parkIt: true }),
      ],
      complaints: [],
    })
    const s = model.getState()
    expect(s.status).toBe('ready')
    expect(s.recalls.map((r) => r.campaign)).toEqual([
      '18V004000',
      '19V003000',
      '23V002000',
      '20V001000',
    ])
  })

  it('reports no recalls as ready with an empty list', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', { recallsCheckedAt: CHECKED, recalls: [], complaints: [] })
    expect(model.getState()).toMatchObject({ status: 'ready', recalls: [] })
  })

  it('lists the components with the most complaints first', () => {
    const { model, safety } = setup()
    model.getState().start()
    safety.set('c1', {
      recallsCheckedAt: CHECKED,
      complaintsCheckedAt: CHECKED,
      recalls: [],
      complaints: [complaints('STEERING', 3), complaints('ENGINE', 40), complaints('AIR BAGS', 3)],
    })
    const s = model.getState()
    expect(s.complaintsChecked).toBe(true)
    expect(s.complaints.map((c) => c.component)).toEqual(['ENGINE', 'AIR BAGS', 'STEERING'])
  })

  it('opens and closes items', () => {
    const { model } = setup()
    model.getState().toggle('r-1')
    model.getState().toggle('s-2')
    expect(model.getState().expanded).toEqual(['r-1', 's-2'])
    model.getState().toggle('r-1')
    expect(model.getState().expanded).toEqual(['s-2'])
  })

  it("links to NHTSA's lookup for the car's VIN, where the owner sees what applies and is fixed", () => {
    expect(setup({ vin: '1HGCM82633A004352' }).model.getState().lookupUrl).toBe(
      'https://www.nhtsa.gov/recalls?vin=1HGCM82633A004352',
    )
    expect(setup().model.getState().lookupUrl).toBe('https://www.nhtsa.gov/recalls')
  })

  it('stops following changes once disposed', () => {
    const { model, safety } = setup()
    model.getState().start()
    model.getState().dispose()
    safety.set('c1', { recallsCheckedAt: CHECKED, recalls: [recall('1')], complaints: [] })
    expect(model.getState().status).toBe('checking')
  })
})
