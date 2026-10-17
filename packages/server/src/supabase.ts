import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AnswerSource,
  ChatTurn,
  Complaint,
  ComplaintSummary,
  MaintenanceItem,
  OdometerReading,
  Recall,
  ServiceRecord,
  Vehicle,
} from '@car/core'
import { MAX_COMPLAINTS, MAX_HISTORY_TURNS } from '@car/core'
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
  })

const toComplaint = (r: Row): Complaint =>
  defined({
    odiNumber: num(r.odi_number) ?? 0,
    components: Array.isArray(r.components) ? r.components.map(String) : [],
    summary: text(r.summary) ?? '',
    filedOn: text(r.filed_on),
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

    const [readings, fillUps, records, schedule, recalls, summaries, configs, complaints] =
      await Promise.all([
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
        forConfig('recalls'),
        forConfig('complaint_summaries'),
        configId === undefined
          ? []
          : rows(user.from('vehicle_configs').select('*').eq('id', configId)),
        configId === undefined
          ? []
          : rows(
              admin
                .from('complaints')
                .select('*')
                .eq('config_id', configId)
                .order('filed_on', { ascending: false, nullsFirst: false })
                .limit(MAX_COMPLAINTS),
            ),
      ])
    const config = configs[0] ?? {}
    return {
      vehicle,
      today: new Date().toISOString().slice(0, 10),
      readings: [
        ...readings.map(toReading),
        ...fillUps.map((r) => toReading({ ...r, read_on: r.filled_on, miles: r.odometer_miles })),
      ],
      schedule: schedule.map(toItem),
      records: records.map(toRecord),
      safety: defined({
        recallsCheckedAt: text(config.recalls_checked_at),
        complaintsCheckedAt: text(config.complaints_checked_at),
        recalls: recalls.map(toRecall),
        complaints: summaries.map(toSummary),
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
