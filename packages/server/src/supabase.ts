import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AnswerSource,
  Bulletin,
  BulletinKind,
  ChatTurn,
  Complaint,
  ComplaintSummary,
  CustomItem,
  MaintenanceItem,
  OdometerReading,
  Recall,
  ServiceRecord,
  Vehicle,
} from '@car/core'
import {
  applyCustomItems,
  MAX_COMPLAINTS,
  MAX_HISTORY_TURNS,
  MAX_NEARBY_COMPLAINTS,
  MILEAGE_BAND,
} from '@car/core'
import type { AssistantStore } from './handler'

/** PostgREST returns JSON: null for missing values, numbers, booleans and ISO date strings. */
type Row = Record<string, unknown>

const text = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

type UndefinedKeys<T> = { [K in keyof T]: undefined extends T[K] ? K : never }[keyof T]
/** Properties that may be undefined become optional, as exactOptionalPropertyTypes requires. */
type Defined<T> = Omit<T, UndefinedKeys<T>> & {
  [K in UndefinedKeys<T>]?: Exclude<T[K], undefined>
}

/** Drops undefined values so objects satisfy exactOptionalPropertyTypes. */
const defined = <T extends object>(o: T): Defined<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Defined<T>

const toVehicle = (r: Row): Vehicle =>
  defined({
    id: String(r.id),
    configId: text(r.config_id),
    vin: text(r.vin),
    year: num(r.year) ?? 0,
    make: text(r.make) ?? '',
    model: text(r.model) ?? '',
    trim: text(r.trim),
    engine: text(r.engine),
    drivetrain: text(r.drivetrain),
    nickname: text(r.nickname) ?? '',
    severeDuty: r.severe_duty === true,
  })

const toReading = (r: Row): OdometerReading => ({
  vehicleId: String(r.vehicle_id),
  date: String(r.read_on),
  miles: num(r.miles) ?? 0,
})

const toRecord = (r: Row): ServiceRecord =>
  defined({
    id: String(r.id),
    vehicleId: String(r.vehicle_id),
    itemId: text(r.item_id),
    performedOn: String(r.performed_on),
    odometerMiles: num(r.odometer_miles),
    costCents: num(r.cost_cents),
    shop: text(r.shop),
    notes: text(r.notes),
  })

const toItem = (r: Row): MaintenanceItem =>
  defined({
    id: String(r.id),
    configId: String(r.config_id),
    task: String(r.task),
    kind: text(r.kind),
    source: text(r.source),
    intervalMiles: num(r.interval_miles),
    intervalMonths: num(r.interval_months),
    severeMiles: num(r.severe_miles),
    severeMonths: num(r.severe_months),
  })

const toCustomItem = (r: Row): CustomItem =>
  defined({
    id: String(r.id),
    vehicleId: String(r.vehicle_id),
    replacesItemId: text(r.replaces_item_id),
    task: String(r.task),
    intervalMiles: num(r.interval_miles),
    intervalMonths: num(r.interval_months),
  })

const toRecall = (r: Row): Recall =>
  defined({
    id: String(r.id),
    configId: String(r.config_id),
    campaign: text(r.campaign) ?? '',
    component: text(r.component),
    summary: text(r.summary) ?? '',
    consequence: text(r.consequence),
    remedy: text(r.remedy),
    notes: text(r.notes),
    reportedOn: text(r.reported_on),
    parkIt: r.park_it === true,
    parkOutside: r.park_outside === true,
    overTheAir: r.over_the_air === true,
  })

const toSummary = (r: Row): ComplaintSummary =>
  defined({
    id: String(r.id),
    configId: String(r.config_id),
    component: text(r.component) ?? '',
    complaints: num(r.complaints) ?? 0,
    crashes: num(r.crashes) ?? 0,
    fires: num(r.fires) ?? 0,
    injuries: num(r.injuries) ?? 0,
    deaths: num(r.deaths) ?? 0,
    latestFiledOn: text(r.latest_filed_on),
    recent: Array.isArray(r.recent)
      ? (r.recent as Row[]).flatMap((c) =>
          typeof c.summary === 'string'
            ? [defined({ filedOn: text(c.filed_on), summary: c.summary })]
            : [],
        )
      : [],
    byMileage: Array.isArray(r.by_mileage)
      ? (r.by_mileage as Row[]).flatMap((b) =>
          typeof b.from === 'number' && typeof b.complaints === 'number'
            ? [{ from: b.from, complaints: b.complaints }]
            : [],
        )
      : undefined,
  })

const KINDS = new Set<BulletinKind>(['bulletin', 'warranty', 'campaign', 'software', 'emissions'])

const toBulletin = (r: Row): Bulletin => {
  const kind = text(r.kind) as BulletinKind | undefined
  return defined({
    id: String(r.id),
    configId: String(r.config_id),
    nhtsaId: num(r.nhtsa_id) ?? 0,
    documentId: text(r.document_id),
    kind: kind && KINDS.has(kind) ? kind : 'other',
    issuedOn: text(r.issued_on),
    components: Array.isArray(r.components) ? r.components.map(String) : [],
    system: text(r.system),
    summary: text(r.summary) ?? '',
  })
}

const toComplaint = (r: Row): Complaint =>
  defined({
    odiNumber: num(r.odi_number) ?? 0,
    components: Array.isArray(r.components) ? r.components.map(String) : [],
    summary: text(r.summary) ?? '',
    filedOn: text(r.filed_on),
    miles: num(r.miles),
    crash: r.crash === true,
    fire: r.fire === true,
    injuries: num(r.injuries) ?? 0,
    deaths: num(r.deaths) ?? 0,
  })

/** Throws a query's error, so a failed read never looks like "nothing stored". */
const rows = async (query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> => {
  const { data, error } = await query
  if (error) throw error
  return (data as Row[] | null) ?? []
}

/**
 * The assistant's store over Supabase. Reads of the owner's car go through `user`, a client signed
 * in with the owner's token, so row-level security decides what the assistant can see. `admin`
 * (the service role) reads only what owners cannot (raw complaints) and writes the conversation.
 */
export const supabaseStore = (
  user: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
): AssistantStore => ({
  facts: async (vehicleId) => {
    const [vehicleRow] = await rows(user.from('vehicles').select('*').eq('id', vehicleId))
    if (!vehicleRow) return undefined
    const vehicle = toVehicle(vehicleRow)
    const configId = vehicle.configId
    const forConfig = async (table: string) =>
      configId === undefined ? [] : rows(user.from(table).select('*').eq('config_id', configId))

    const [
      readings,
      fillUps,
      records,
      schedule,
      customItems,
      recalls,
      summaries,
      bulletins,
      configs,
    ] = await Promise.all([
      rows(user.from('odometer_readings').select('*').eq('vehicle_id', vehicleId)),
      // A fill-up's mileage is one of the car's readings, as it is on the phone.
      rows(
        user
          .from('fill_ups')
          .select('vehicle_id, filled_on, odometer_miles')
          .eq('vehicle_id', vehicleId),
      ),
      rows(user.from('service_records').select('*').eq('vehicle_id', vehicleId)),
      forConfig('maintenance_items'),
      // The owner's own items and intervals, so answers follow the schedule they set.
      rows(user.from('custom_items').select('*').eq('vehicle_id', vehicleId)),
      forConfig('recalls'),
      forConfig('complaint_summaries'),
      forConfig('bulletins'),
      configId === undefined
        ? []
        : rows(user.from('vehicle_configs').select('*').eq('id', configId)),
    ])
    // The newest complaints, and the newest of those that happened near the car's last reading,
    // from which the grounding picks its sample.
    const latest = readings.map(toReading).sort((a, b) => b.date.localeCompare(a.date))[0]?.miles
    const complaintsQuery = () =>
      admin
        .from('complaints_with_miles')
        .select('*')
        .eq('config_id', configId)
        .order('filed_on', { ascending: false, nullsFirst: false })
    const [newest, near] =
      configId === undefined
        ? [[], []]
        : await Promise.all([
            rows(complaintsQuery().limit(MAX_COMPLAINTS)),
            latest === undefined
              ? []
              : rows(
                  complaintsQuery()
                    .gte('miles', latest - MILEAGE_BAND)
                    .lte('miles', latest + 2 * MILEAGE_BAND)
                    .limit(MAX_NEARBY_COMPLAINTS * 2),
                ),
          ])
    const complaints = [...new Map([...newest, ...near].map((r) => [r.odi_number, r])).values()]
    const config = configs[0] ?? {}
    return {
      vehicle,
      today: new Date().toISOString().slice(0, 10),
      readings: [
        ...readings.map(toReading),
        ...fillUps.map((r) => toReading({ ...r, read_on: r.filled_on, miles: r.odometer_miles })),
      ],
      schedule: applyCustomItems(schedule.map(toItem), customItems.map(toCustomItem), vehicle),
      records: records.map(toRecord),
      safety: defined({
        recallsCheckedAt: text(config.recalls_checked_at),
        complaintsCheckedAt: text(config.complaints_checked_at),
        bulletinsCheckedAt: text(config.bulletins_checked_at),
        recalls: recalls.map(toRecall),
        complaints: summaries.map(toSummary),
        bulletins: bulletins.map(toBulletin),
      }),
      complaints: complaints.map(toComplaint),
    }
  },

  conversation: async (vehicleId, conversationId) => {
    if (conversationId !== undefined) {
      const [existing] = await rows(
        user
          .from('conversations')
          .select('id')
          .eq('id', conversationId)
          .eq('vehicle_id', vehicleId),
      )
      if (existing) return String(existing.id)
    }
    const [created] = await rows(
      user.from('conversations').insert({ vehicle_id: vehicleId }).select('id'),
    )
    if (!created) throw new Error('The conversation was not created')
    return String(created.id)
  },

  history: async (conversationId) => {
    const recent = await rows(
      admin
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('id', { ascending: false })
        .limit(MAX_HISTORY_TURNS),
    )
    return recent.reverse().flatMap((r): ChatTurn[] => {
      const content = r.content as Row | null
      const role = r.role === 'assistant' ? 'assistant' : 'user'
      return typeof content?.text === 'string' ? [{ role, text: content.text }] : []
    })
  },

  claimQuestion: async (limit) => {
    const { data, error } = await admin.rpc('assistant_claim_question', {
      p_owner: userId,
      p_limit: limit,
    })
    if (error) throw error
    return data === true
  },

  saveTurn: async (conversationId, question, answer) => {
    const sources: AnswerSource[] = answer.sources
    const { error } = await admin.from('messages').insert([
      { conversation_id: conversationId, role: 'user', content: { text: question } },
      {
        conversation_id: conversationId,
        role: 'assistant',
        content: { text: answer.text, sources },
      },
    ])
    if (error) throw error
  },
})
