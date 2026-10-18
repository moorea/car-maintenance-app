import { VinDecodeError } from '@car/core'
import { describe, expect, it } from 'vitest'
import { makeName, nhtsaVinDecoder } from './vinDecoder'

const VIN = '1HGCM82633A004352'

/** The fields vPIC returns for this VIN (of about 140, mostly empty). */
const accord = {
  ErrorCode: '0',
  ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
  Make: 'HONDA',
  Manufacturer: 'AMERICAN HONDA MOTOR CO., INC.',
  Model: 'Accord',
  ModelYear: '2003',
  Trim: 'EX-V6',
  DisplacementL: '3.0',
  EngineCylinders: '6',
  FuelTypePrimary: 'Gasoline',
  DriveType: '',
  VIN,
}

const respond =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), { status })

const kindOf = async (promise: Promise<unknown>) => {
  try {
    await promise
    return 'resolved'
  } catch (e) {
    return e instanceof VinDecodeError ? e.kind : 'other'
  }
}

describe('NHTSA VIN decoder', () => {
  it('asks vPIC for the VIN and reads the car from the answer', async () => {
    const urls: string[] = []
    const decoder = nhtsaVinDecoder(async (url) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ Results: [accord] }))
    })
    expect(await decoder.decode(VIN)).toEqual({
      vin: VIN,
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: 'EX-V6',
      engine: '3.0L 6-cyl',
    })
    expect(urls).toEqual([
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${VIN}?format=json`,
    ])
  })

  it('shortens the drive type and calls an electric motor Electric', async () => {
    const tesla = {
      ...accord,
      Make: 'TESLA',
      Model: 'Model 3',
      ModelYear: '2021',
      Trim: '',
      DisplacementL: '',
      EngineCylinders: '',
      FuelTypePrimary: 'Electric',
      DriveType: 'AWD/All-Wheel Drive',
    }
    expect(await nhtsaVinDecoder(respond({ Results: [tesla] })).decode(VIN)).toEqual({
      vin: VIN,
      year: 2021,
      make: 'Tesla',
      model: 'Model 3',
      engine: 'Electric',
      drivetrain: 'AWD',
    })
  })

  it('reads the body class as the shape to draw the car, and leaves out one it cannot place', async () => {
    const bodyOf = async (BodyClass: string) =>
      (await nhtsaVinDecoder(respond({ Results: [{ ...accord, BodyClass }] })).decode(VIN))
        .bodyStyle
    expect(await bodyOf('Sedan/Saloon')).toBe('sedan')
    expect(await bodyOf('Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)')).toBe('suv')
    expect(await bodyOf('Pickup')).toBe('pickup')
    expect(await bodyOf('Minivan')).toBe('minivan')
    expect(await bodyOf('Bus')).toBeUndefined()
    expect(await bodyOf('')).toBeUndefined()
  })

  it('says when the engine is a hybrid, plug-in hybrid or diesel, which changes its schedule', async () => {
    const engineOf = async (fields: Record<string, string>) =>
      (await nhtsaVinDecoder(respond({ Results: [{ ...accord, ...fields }] })).decode(VIN)).engine
    expect(
      await engineOf({
        DisplacementL: '2.5',
        EngineCylinders: '4',
        ElectrificationLevel: 'Strong HEV (Hybrid Electric Vehicle)',
      }),
    ).toBe('2.5L 4-cyl hybrid')
    expect(await engineOf({ ElectrificationLevel: 'PHEV (Plug-in Hybrid Electric Vehicle)' })).toBe(
      '3.0L 6-cyl plug-in hybrid',
    )
    expect(
      await engineOf({ DisplacementL: '', EngineCylinders: '', ElectrificationLevel: 'PHEV' }),
    ).toBe('Plug-in hybrid')
    expect(await engineOf({ ElectrificationLevel: 'Mild HEV (Hybrid Electric Vehicle)' })).toBe(
      '3.0L 6-cyl',
    )
    expect(await engineOf({ DisplacementL: '6.7', FuelTypePrimary: 'Diesel' })).toBe(
      '6.7L 6-cyl diesel',
    )
    expect(
      await engineOf({
        FuelTypePrimary: '',
        ElectrificationLevel: 'BEV (Battery Electric Vehicle)',
      }),
    ).toBe('Electric')
    // A range extender keeps its engine's maintenance.
    expect(
      await engineOf({
        DisplacementL: '1.5',
        EngineCylinders: '4',
        FuelTypePrimary: 'Electric',
        FuelTypeSecondary: 'Gasoline',
      }),
    ).toBe('1.5L 4-cyl plug-in hybrid')
    expect(
      await engineOf({
        DisplacementL: '1.5',
        EngineCylinders: '4',
        FuelTypePrimary: 'Electric',
        ElectrificationLevel: 'PHEV (Plug-in Hybrid Electric Vehicle)',
      }),
    ).toBe('1.5L 4-cyl plug-in hybrid')
  })

  it('reports a VIN vPIC cannot place as not found', async () => {
    const unknown = { ...accord, Make: '', Model: '', ModelYear: '', ErrorCode: '8' }
    expect(await kindOf(nhtsaVinDecoder(respond({ Results: [unknown] })).decode(VIN))).toBe(
      'not-found',
    )
    expect(await kindOf(nhtsaVinDecoder(respond({ Results: [] })).decode(VIN))).toBe('not-found')
  })

  it('reports no connection, a timeout or a vPIC outage as a network problem', async () => {
    const offline: typeof fetch = async () => {
      throw new TypeError('Network request failed')
    }
    expect(await kindOf(nhtsaVinDecoder(offline).decode(VIN))).toBe('network')
    expect(await kindOf(nhtsaVinDecoder(respond({}, 503)).decode(VIN))).toBe('network')
  })

  it('reports an answer it cannot read as unknown', async () => {
    const html: typeof fetch = async () => new Response('<html>maintenance</html>')
    expect(await kindOf(nhtsaVinDecoder(html).decode(VIN))).toBe('unknown')
    expect(await kindOf(nhtsaVinDecoder(respond({}, 400)).decode(VIN))).toBe('unknown')
  })
})

describe('make names', () => {
  it('title-cases the capitals vPIC uses, keeping acronyms', () => {
    expect(makeName('HONDA')).toBe('Honda')
    expect(makeName('MERCEDES-BENZ')).toBe('Mercedes-Benz')
    expect(makeName('LAND ROVER')).toBe('Land Rover')
    expect(makeName('BMW')).toBe('BMW')
    expect(makeName('GMC')).toBe('GMC')
  })
})
