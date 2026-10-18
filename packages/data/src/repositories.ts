import { withCustomItems } from '@car/core'
import type {
  CustomItemRepo,
  FillUpRepo,
  RenewalRepo,
  OdometerReading,
  OdometerRepo,
  SafetyReport,
  SafetyRepo,
  ScheduleRepo,
  ServiceRecordRepo,
  SyncStatus,
  Unsubscribe,
  VehicleRepo,
  WarrantyRepo,
} from '@car/core'
import type { CommonPowerSyncDatabase } from '@powersync/common'
import { readOwner } from './session'
import {
  fromCustomItem,
  fromServiceRecord,
  fromFillUp,
  fromRenewal,
  fromVehicle,
  fromWarranty,
  toBulletin,
  toComplaintSummary,
  toCustomItem,
  toFillUp,
  toRenewal,
  toMaintenanceItem,
  toOdometerReading,
  toRecall,
  toSafetyReport,
  toServiceRecord,
  toVehicle,
  toWarranty,
} from './rows'

export interface PowerSyncRepositories {
  vehicles: VehicleRepo
  records: ServiceRecordRepo
  odometer: OdometerRepo
  schedule: ScheduleRepo
  safety: SafetyRepo
  warranties: WarrantyRepo
  fillUps: FillUpRepo
  renewals: RenewalRepo
  customItems: CustomItemRepo
  sync: SyncStatus
}

const RECORDS_FOR_VEHICLE =
  'select * from service_records where vehicle_id = ? order by performed_on desc, created_at desc'

const WARRANTIES_FOR_VEHICLE =
  'select * from warranties where vehicle_id = ? order by starts_on, kind, id'

const RENEWALS_FOR_VEHICLE = 'select * from renewals where vehicle_id = ? order by due_on, id'

const CUSTOM_ITEMS_FOR_VEHICLE = 'select * from custom_items where vehicle_id = ? order by task, id'

const FILL_UPS_FOR_VEHICLE =
  'select * from fill_ups where vehicle_id = ? order by filled_on desc, odometer_miles desc'

const READINGS_FOR_VEHICLE = 'select * from odometer_readings where vehicle_id = ? order by read_on'

type Row = Record<string, unknown>

/** Calls `onRows` with the query's rows now and whenever `table` changes, until unsubscribed. */
export const watchRows = (
  db: CommonPowerSyncDatabase,
  sql: string,
  params: unknown[],
  table: string,
  onRows: (rows: Row[]) => void,
): Unsubscribe => {
  const controller = new AbortController()
  db.watch(
    sql,
    params,
    {
      onResult: (result) => onRows((result.rows?._array ?? []) as Row[]),
      onError: (error) => console.error(`${table} watch failed`, error),
    },
    { signal: controller.signal, tables: [table] },
  )
  return () => controller.abort()
}

/**
 * Calls `onChange` with a configuration's recalls, complaint summaries, bulletins and check times
 * once all four have been read, and again whenever one of them changes.
 */
const watchSafety = (
  db: CommonPowerSyncDatabase,
  configId: string,
  onChange: (report: SafetyReport) => void,
): Unsubscribe => {
  let config: Row | undefined
  let recalls: Row[] | undefined
  let complaints: Row[] | undefined
  let bulletins: Row[] | undefined
  const emit = () => {
    if (!config || !recalls || !complaints || !bulletins) return
    onChange(
      toSafetyReport(
        config,
        recalls.map(toRecall),
        complaints.map(toComplaintSummary),
        bulletins.map(toBulletin),
      ),
    )
  }
  const stops = [
    watchRows(
      db,
      'select * from vehicle_configs where id = ?',
      [configId],
      'vehicle_configs',
      (rows) => {
        config = rows[0] ?? {}
        emit()
      },
    ),
    watchRows(db, 'select * from recalls where config_id = ?', [configId], 'recalls', (rows) => {
      recalls = rows
      emit()
    }),
    watchRows(
      db,
      'select * from complaint_summaries where config_id = ?',
      [configId],
      'complaint_summaries',
      (rows) => {
        complaints = rows
        emit()
      },
    ),
    watchRows(
      db,
      'select * from bulletins where config_id = ?',
      [configId],
      'bulletins',
      (rows) => {
        bulletins = rows
        emit()
      },
    ),
  ]
  return () => stops.forEach((stop) => stop())
}

/** Same text format as synced timestamptz values, so local and synced rows sort alike. */
/**
 * Saves a row of a table the owner can edit: an insert for a new row, and an update of only the
 * changed columns for an edit, so the upload is a PUT or a PATCH as it would be for a car. Saving
 * a row unchanged queues nothing.
 */
const saveEditable = async (
  db: CommonPowerSyncDatabase,
  table: 'warranties' | 'fill_ups' | 'renewals' | 'custom_items',
  row: { id: string } & Row,
) => {
  await db.writeTransaction(async (tx) => {
    const existing = await tx.getOptional<Row>(`select * from ${table} where id = ?`, [row.id])
    if (!existing) {
      const inserted = { ...row, updated_at: now() }
      const columns = Object.keys(inserted)
      await tx.execute(
        `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
        Object.values(inserted),
      )
      return
    }
    const { id: _id, ...fields } = row
    const changed = Object.entries(fields).filter(([column, value]) => existing[column] !== value)
    if (changed.length === 0) return
    changed.push(['updated_at', now()])
    await tx.execute(
      `update ${table} set ${changed.map(([column]) => `${column} = ?`).join(', ')} where id = ?`,
      [...changed.map(([, value]) => value), row.id],
    )
  })
}

export const now = () => new Date().toISOString().replace('T', ' ')

const insertReading = async (
  db: Pick<CommonPowerSyncDatabase, 'execute'>,
  reading: OdometerReading,
): Promise<void> => {
  await db.execute(
    "insert into odometer_readings (id, vehicle_id, read_on, miles, source) values (uuid(), ?, ?, ?, 'manual')",
    [reading.vehicleId, reading.date, reading.miles],
  )
}

/** What the first-sync check reads from PowerSync. */
export interface SyncSource {
  hasSynced(): boolean
  onStatusChanged(onChange: () => void): () => void
  /** The user whose data the local copy holds. */
  owner(): Promise<string | undefined>
}

/**
 * Calls `onSynced` once the local copy has fully synced and belongs to `ownerId`. After an account
 * switch PowerSync still reports the previous owner's sync until their copy is cleared, which
 * would tell the new owner they have no cars before theirs have downloaded.
 */
export const firstSyncOf = (
  source: SyncSource,
  ownerId: string,
  onSynced: () => void,
): (() => void) => {
  let done = false
  let check = Promise.resolve()
  const recheck = () => {
    check = check
      .then(async () => {
        if (done || !source.hasSynced()) return
        if ((await source.owner()) !== ownerId || done || !source.hasSynced()) return
        done = true
        stop()
        onSynced()
      })
      // A failed read must not stop later status changes from being checked.
      .catch((error: unknown) => console.warn('First sync check failed', error))
  }
  const stop = source.onStatusChanged(recheck)
  recheck()
  return () => {
    done = true
    stop()
  }
}

/** The core ports implemented over the on-device PowerSync (SQLite) database. */
const customItemsOf = (db: CommonPowerSyncDatabase): CustomItemRepo => ({
  listForVehicle: async (vehicleId) =>
    (await db.getAll<Record<string, unknown>>(CUSTOM_ITEMS_FOR_VEHICLE, [vehicleId])).map(
      toCustomItem,
    ),

  watchForVehicle: (vehicleId, onChange) =>
    watchRows(db, CUSTOM_ITEMS_FOR_VEHICLE, [vehicleId], 'custom_items', (rows) =>
      onChange(rows.map(toCustomItem)),
    ),

  save: (item) => saveEditable(db, 'custom_items', fromCustomItem(item)),

  remove: async (id) => {
    await db.execute('delete from custom_items where id = ?', [id])
  },
})

export const createPowerSyncRepositories = (db: CommonPowerSyncDatabase): PowerSyncRepositories => {
  const customItems = customItemsOf(db)
  return {
    customItems,

    sync: {
      onFirstSync: (ownerId, onSynced) =>
        firstSyncOf(
          {
            hasSynced: () => db.currentStatus.hasSynced === true,
            onStatusChanged: (onChange) => db.registerListener({ statusChanged: onChange }),
            owner: () => readOwner(db),
          },
          ownerId,
          onSynced,
        ),
    },

    vehicles: {
      // Filtered by owner even though only the owner's rows sync: just after an account switch the
      // previous owner's copy may not be cleared yet.
      watchOwned: (ownerId, onChange) =>
        watchRows(
          db,
          // As the owner arranged them, then any not yet placed by name (as byGarageOrder does).
          'select * from vehicles where owner_id = ? order by garage_position is null, garage_position, nickname',
          [ownerId],
          'vehicles',
          (rows) => onChange(rows.map(toVehicle)),
        ),
      get: async (id) => {
        const row = await db.getOptional<Record<string, unknown>>(
          'select * from vehicles where id = ?',
          [id],
        )
        return row ? toVehicle(row) : undefined
      },
      // One transaction, so the reading uploads after its car and never on its own.
      add: async (ownerId, vehicle, firstReading) => {
        const row = { ...fromVehicle(ownerId, vehicle), updated_at: now() }
        const columns = Object.keys(row)
        await db.writeTransaction(async (tx) => {
          await tx.execute(
            `insert into vehicles (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
            Object.values(row),
          )
          if (firstReading) await insertReading(tx, firstReading)
        })
      },
      setSevereDuty: async (id, severeDuty) => {
        await db.execute('update vehicles set severe_duty = ?, updated_at = ? where id = ?', [
          severeDuty ? 1 : 0,
          now(),
          id,
        ])
      },
      setValue: async (id, value) => {
        await db.execute(
          'update vehicles set value_cents = ?, valued_on = ?, updated_at = ? where id = ?',
          [value?.cents ?? null, value?.valuedOn ?? null, now(), id],
        )
      },
      rename: async (id, nickname) => {
        await db.execute('update vehicles set nickname = ?, updated_at = ? where id = ?', [
          nickname,
          now(),
          id,
        ])
      },
      // One transaction, so every phone sees the whole new order at once rather than part of it.
      reorder: async (ids) => {
        const at = now()
        await db.writeTransaction(async (tx) => {
          for (const [position, id] of ids.entries())
            await tx.execute(
              'update vehicles set garage_position = ?, updated_at = ? where id = ?',
              [position, at, id],
            )
        })
      },
      // The server deletes the rest of the car's history with it, and sync then clears it here.
      // Its attachments go first, in the same transaction, so the upload deletes their files in
      // Storage too rather than leaving them for the sweep.
      remove: async (id) => {
        await db.writeTransaction(async (tx) => {
          await tx.execute('delete from attachments where vehicle_id = ?', [id])
          await tx.execute('delete from vehicles where id = ?', [id])
        })
      },
    },

    records: {
      listForVehicle: async (vehicleId) =>
        (await db.getAll<Record<string, unknown>>(RECORDS_FOR_VEHICLE, [vehicleId])).map(
          toServiceRecord,
        ),

      watchForVehicle: (vehicleId, onChange) =>
        watchRows(db, RECORDS_FOR_VEHICLE, [vehicleId], 'service_records', (rows) =>
          onChange(rows.map(toServiceRecord)),
        ),

      add: async (record) => {
        const row = { ...fromServiceRecord(record), created_at: now() }
        const columns = Object.keys(row)
        await db.execute(
          `insert into service_records (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
          Object.values(row),
        )
      },
    },

    odometer: {
      listForVehicle: async (vehicleId) =>
        (await db.getAll<Record<string, unknown>>(READINGS_FOR_VEHICLE, [vehicleId])).map(
          toOdometerReading,
        ),

      watchForVehicle: (vehicleId, onChange) =>
        watchRows(db, READINGS_FOR_VEHICLE, [vehicleId], 'odometer_readings', (rows) =>
          onChange(rows.map(toOdometerReading)),
        ),

      add: (reading) => insertReading(db, reading),
    },

    warranties: {
      listForVehicle: async (vehicleId) =>
        (await db.getAll<Record<string, unknown>>(WARRANTIES_FOR_VEHICLE, [vehicleId])).map(
          toWarranty,
        ),

      watchForVehicle: (vehicleId, onChange) =>
        watchRows(db, WARRANTIES_FOR_VEHICLE, [vehicleId], 'warranties', (rows) =>
          onChange(rows.map(toWarranty)),
        ),

      save: (warranty) => saveEditable(db, 'warranties', fromWarranty(warranty)),

      remove: async (id) => {
        await db.execute('delete from warranties where id = ?', [id])
      },
    },

    renewals: {
      listForVehicle: async (vehicleId) =>
        (await db.getAll<Record<string, unknown>>(RENEWALS_FOR_VEHICLE, [vehicleId])).map(
          toRenewal,
        ),

      watchForVehicle: (vehicleId, onChange) =>
        watchRows(db, RENEWALS_FOR_VEHICLE, [vehicleId], 'renewals', (rows) =>
          onChange(rows.map(toRenewal)),
        ),

      save: (renewal) => saveEditable(db, 'renewals', fromRenewal(renewal)),

      remove: async (id) => {
        await db.execute('delete from renewals where id = ?', [id])
      },
    },

    fillUps: {
      listForVehicle: async (vehicleId) =>
        (await db.getAll<Record<string, unknown>>(FILL_UPS_FOR_VEHICLE, [vehicleId])).map(toFillUp),

      watchForVehicle: (vehicleId, onChange) =>
        watchRows(db, FILL_UPS_FOR_VEHICLE, [vehicleId], 'fill_ups', (rows) =>
          onChange(rows.map(toFillUp)),
        ),

      save: (fillUp) => saveEditable(db, 'fill_ups', fromFillUp(fillUp)),

      remove: async (id) => {
        await db.execute('delete from fill_ups where id = ?', [id])
      },
    },

    safety: {
      watchForConfig: (configId, onChange) => watchSafety(db, configId, onChange),
    },

    // The schedule each car follows: its config's, with the owner's own items and intervals.
    schedule: withCustomItems(
      {
        itemsForConfig: async (configId) =>
          (
            await db.getAll<Record<string, unknown>>(
              'select * from maintenance_items where config_id = ? order by task',
              [configId],
            )
          ).map(toMaintenanceItem),
      },
      customItems,
    ),
  }
}
