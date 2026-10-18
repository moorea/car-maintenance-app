import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { supabaseStore } from './supabase'

type Row = Record<string, unknown>

/**
 * Just enough of supabase-js for the store: `from(table)` with chained filters, which resolves to
 * the table's rows that match every `eq`, and `rpc`. Records each call for the assertions.
 */
const fakeClient = (
  tables: Record<string, Row[]>,
  rpc: (name: string, args: Row) => unknown = () => 0,
) => {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  const inserted: { table: string; rows: Row[] }[] = []
  const query = (table: string, rows: Row[]) => {
    let result = rows
    const builder = {
      select: (...args: unknown[]) => (calls.push({ table, op: 'select', args }), builder),
      eq: (column: string, value: unknown) => {
        calls.push({ table, op: 'eq', args: [column, value] })
        result = result.filter((r) => r[column] === value)
        return builder
      },
      order: (...args: unknown[]) => (calls.push({ table, op: 'order', args }), builder),
      gte: (column: string, value: number) => {
        calls.push({ table, op: 'gte', args: [column, value] })
        result = result.filter((r) => typeof r[column] === 'number' && r[column] >= value)
        return builder
      },
      lte: (column: string, value: number) => {
        calls.push({ table, op: 'lte', args: [column, value] })
        result = result.filter((r) => typeof r[column] === 'number' && r[column] <= value)
        return builder
      },
      limit: (n: number) => ((result = result.slice(0, n)), builder),
      insert: (value: Row | Row[]) => {
        const added = (Array.isArray(value) ? value : [value]).map((r, i) => ({
          id: `new-${i}`,
          ...r,
        }))
        inserted.push({ table, rows: added })
        result = added
        return builder
      },
      then: (resolve: (v: { data: Row[]; error: null }) => void) =>
        resolve({ data: result, error: null }),
    }
    return builder
  }
  const client = {
    from: (table: string) => query(table, tables[table] ?? []),
    rpc: async (name: string, args: Row) => ({ data: rpc(name, args), error: null }),
  } as unknown as SupabaseClient
  return { client, calls, inserted }
}

const tables: Record<string, Row[]> = {
  vehicles: [
    {
      id: 'v1',
      config_id: 'c1',
      vin: null,
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      trim: null,
      engine: null,
      drivetrain: null,
      nickname: 'Rav',
      severe_duty: true,
    },
  ],
  odometer_readings: [{ vehicle_id: 'v1', read_on: '2026-10-01', miles: 30_000 }],
  fill_ups: [{ vehicle_id: 'v1', filled_on: '2026-10-12', odometer_miles: 30_400 }],
  service_records: [
    {
      id: 'r1',
      vehicle_id: 'v1',
      item_id: 'oil',
      performed_on: '2026-07-01',
      odometer_miles: 28_000,
      cost_cents: null,
      shop: null,
      notes: null,
    },
  ],
  maintenance_items: [
    {
      id: 'oil',
      config_id: 'c1',
      task: 'Oil change',
      kind: 'engine-oil',
      source: 'baseline',
      interval_miles: 10_000,
      interval_months: null,
      severe_miles: null,
      severe_months: null,
    },
  ],
  recalls: [
    {
      id: 'rc1',
      config_id: 'c1',
      campaign: '24V001000',
      component: 'ENGINE',
      summary: 'Fails',
      park_it: true,
      park_outside: false,
      over_the_air: false,
      reported_on: '2024-01-02',
    },
  ],
  complaint_summaries: [
    {
      id: 's1',
      config_id: 'c1',
      component: 'ENGINE',
      complaints: 3,
      crashes: 0,
      fires: 0,
      injuries: 0,
      deaths: 0,
      latest_filed_on: null,
      recent: [{ filed_on: '2025-01-01', summary: 'Stalls' }, { bad: true }],
      by_mileage: [{ from: 30_000, complaints: 2 }, { from: 'x' }],
    },
  ],
  bulletins: [
    {
      id: 'b1',
      config_id: 'c1',
      nhtsa_id: 10181234,
      document_id: '19-047',
      kind: 'warranty',
      issued_on: '2019-05-01',
      components: ['ENGINE'],
      system: null,
      summary: 'Coverage extended.',
    },
  ],
  vehicle_configs: [
    {
      id: 'c1',
      recalls_checked_at: '2026-10-16T00:00:00+00:00',
      complaints_checked_at: null,
      bulletins_checked_at: '2026-10-17T00:00:00+00:00',
    },
  ],
}

describe('supabaseStore', () => {
  it("reads the owner's car with their token and raw complaints with the service role", async () => {
    const user = fakeClient(tables)
    const admin = fakeClient({
      complaints_with_miles: [
        {
          odi_number: 11,
          config_id: 'c1',
          components: ['ENGINE'],
          summary: 'It stalled',
          filed_on: '2025-01-01',
          crash: false,
          fire: true,
          injuries: 0,
          deaths: 0,
          miles: 31_000,
        },
      ],
    })
    const facts = await supabaseStore(user.client, admin.client, 'u1').facts('v1')
    expect(facts).toMatchObject({
      vehicle: { id: 'v1', configId: 'c1', make: 'Toyota', severeDuty: true },
      readings: [
        { vehicleId: 'v1', date: '2026-10-01', miles: 30_000 },
        { vehicleId: 'v1', date: '2026-10-12', miles: 30_400 },
      ],
      schedule: [
        {
          id: 'oil',
          task: 'Oil change',
          kind: 'engine-oil',
          source: 'baseline',
          intervalMiles: 10_000,
        },
      ],
      records: [{ id: 'r1', itemId: 'oil', odometerMiles: 28_000 }],
      safety: {
        recallsCheckedAt: '2026-10-16T00:00:00+00:00',
        recalls: [{ campaign: '24V001000', parkIt: true }],
        complaints: [
          {
            component: 'ENGINE',
            recent: [{ filedOn: '2025-01-01', summary: 'Stalls' }],
            byMileage: [{ from: 30_000, complaints: 2 }],
          },
        ],
        bulletinsCheckedAt: '2026-10-17T00:00:00+00:00',
        bulletins: [
          { nhtsaId: 10181234, documentId: '19-047', kind: 'warranty', components: ['ENGINE'] },
        ],
      },
      complaints: [{ odiNumber: 11, components: ['ENGINE'], fire: true, miles: 31_000 }],
    })
    expect(facts?.vehicle).not.toHaveProperty('vin')
    expect(facts?.safety).not.toHaveProperty('complaintsCheckedAt')
    expect(user.calls.some((c) => c.table === 'complaints')).toBe(false)
  })

  it("adds the complaints that happened near the car's mileage to the newest", async () => {
    const complaint = (odi: number, filed: string, miles: number | null) => ({
      odi_number: odi,
      config_id: 'c1',
      components: ['ENGINE'],
      summary: `Complaint ${odi}`,
      filed_on: filed,
      crash: false,
      fire: false,
      injuries: 0,
      deaths: 0,
      miles,
    })
    const newest = Array.from({ length: 30 }, (_, i) => complaint(100 + i, '2026-01-01', null))
    const admin = fakeClient({
      complaints_with_miles: [
        ...newest,
        complaint(1, '2015-01-01', 31_500),
        complaint(2, '2015-01-01', 90_000),
      ],
    })
    const facts = await supabaseStore(fakeClient(tables).client, admin.client, 'u1').facts('v1')
    const odis = facts?.complaints.map((c) => c.odiNumber) ?? []
    expect(odis).toHaveLength(31)
    expect(odis).toContain(1)
    expect(odis).not.toContain(2)
  })

  it('answers from the schedule the owner set: their intervals and their own items', async () => {
    const user = fakeClient({
      ...tables,
      custom_items: [
        {
          id: 'own-oil',
          vehicle_id: 'v1',
          replaces_item_id: 'oil',
          task: 'Oil change',
          interval_miles: 5_000,
          interval_months: null,
        },
        {
          id: 'own-wipers',
          vehicle_id: 'v1',
          replaces_item_id: null,
          task: 'Wiper blades',
          interval_miles: null,
          interval_months: 12,
        },
      ],
    })
    const facts = await supabaseStore(user.client, fakeClient({}).client, 'u1').facts('v1')
    expect(facts?.schedule).toEqual([
      {
        id: 'oil',
        configId: 'c1',
        task: 'Oil change',
        kind: 'engine-oil',
        source: 'baseline',
        intervalMiles: 5_000,
        owner: 'changed',
      },
      {
        id: 'own-wipers',
        configId: 'c1',
        task: 'Wiper blades',
        source: 'owner',
        intervalMonths: 12,
        owner: 'added',
      },
    ])
    expect(user.calls).toContainEqual({
      table: 'custom_items',
      op: 'eq',
      args: ['vehicle_id', 'v1'],
    })
  })

  it('finds no car the owner cannot see', async () => {
    const store = supabaseStore(fakeClient(tables).client, fakeClient({}).client, 'u1')
    expect(await store.facts('someone-elses')).toBeUndefined()
  })

  it('continues a conversation about the same car, or starts one', async () => {
    const user = fakeClient({ conversations: [{ id: 'conv1', vehicle_id: 'v1' }] })
    const store = supabaseStore(user.client, fakeClient({}).client, 'u1')
    expect(await store.conversation('v1', 'conv1')).toBe('conv1')
    expect(await store.conversation('v2', 'conv1')).toBe('new-0')
    expect(user.inserted).toEqual([
      { table: 'conversations', rows: [{ id: 'new-0', vehicle_id: 'v2' }] },
    ])
  })

  it('reads history oldest first and saves a turn as a question and an answer', async () => {
    const admin = fakeClient({
      messages: [
        { conversation_id: 'conv1', role: 'assistant', content: { text: 'Hello' } },
        { conversation_id: 'conv1', role: 'user', content: { text: 'Hi' } },
      ],
    })
    const store = supabaseStore(fakeClient({}).client, admin.client, 'u1')
    expect(await store.history('conv1')).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello' },
    ])
    const source = { kind: 'recall' as const, id: '24V001000', label: 'Recall 24V001000' }
    await store.saveTurn('conv1', 'Q?', { text: 'A.', sources: [source] })
    expect(admin.inserted.at(-1)?.rows).toEqual([
      { id: 'new-0', conversation_id: 'conv1', role: 'user', content: { text: 'Q?' } },
      {
        id: 'new-1',
        conversation_id: 'conv1',
        role: 'assistant',
        content: { text: 'A.', sources: [source] },
      },
    ])
  })

  it("claims the owner's question with the database function, which enforces the limit", async () => {
    const seen: unknown[] = []
    const admin = fakeClient({}, (name, args) => (seen.push([name, args]), seen.length === 1))
    const store = supabaseStore(fakeClient({}).client, admin.client, 'u1')
    expect(await store.claimQuestion(50)).toBe(true)
    expect(await store.claimQuestion(50)).toBe(false)
    expect(seen[0]).toEqual(['assistant_claim_question', { p_owner: 'u1', p_limit: 50 }])
  })
})
