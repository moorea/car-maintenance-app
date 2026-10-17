import { describe, expect, it } from 'vitest'
import type { FillUp, OdometerReading } from '../../domain/types'
import { memoryFillUps, memoryOdometer } from '../../testing'
import { withFillUpReadings } from './readings'

const fillUp: FillUp = {
  id: 'f1',
  vehicleId: 'v1',
  filledOn: '2026-10-10',
  odometerMiles: 41_250,
  energy: 'fuel',
  quantity: 12,
  full: true,
  missedPrevious: false,
}

const setup = () => {
  const odometer = memoryOdometer([{ vehicleId: 'v1', date: '2026-09-01', miles: 40_000 }])
  const fillUps = memoryFillUps([fillUp])
  return { odometer, fillUps, merged: withFillUpReadings(odometer, fillUps) }
}

describe('withFillUpReadings', () => {
  it("lists each fill-up's mileage among the car's readings, by date", async () => {
    const { merged } = setup()
    expect(await merged.listForVehicle('v1')).toEqual([
      { vehicleId: 'v1', date: '2026-09-01', miles: 40_000 },
      { vehicleId: 'v1', date: '2026-10-10', miles: 41_250 },
    ])
  })

  it('corrects the reading when the fill-up is edited, and drops it when deleted', async () => {
    const { merged, fillUps } = setup()
    const seen: OdometerReading[][] = []
    const stop = merged.watchForVehicle('v1', (r) => seen.push(r))
    await fillUps.save({ ...fillUp, odometerMiles: 41_520 })
    await fillUps.remove('f1')
    stop()
    expect(seen.map((r) => r.map((x) => x.miles))).toEqual([
      [40_000, 41_250],
      [40_000, 41_520],
      [40_000],
    ])
  })

  it('tells a watcher about a new plain reading too, and stops when unsubscribed', async () => {
    const { merged, odometer, fillUps } = setup()
    const seen: number[] = []
    const stop = merged.watchForVehicle('v1', (r) => seen.push(r.length))
    await odometer.add({ vehicleId: 'v1', date: '2026-10-15', miles: 41_400 })
    stop()
    await fillUps.remove('f1')
    expect(seen).toEqual([2, 3])
  })

  it('saves new readings to the odometer, not as fill-ups', async () => {
    const { merged, fillUps } = setup()
    await merged.add({ vehicleId: 'v1', date: '2026-10-15', miles: 41_400 })
    expect(await fillUps.listForVehicle('v1')).toHaveLength(1)
    expect(await merged.listForVehicle('v1')).toHaveLength(3)
  })
})
