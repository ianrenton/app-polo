/*
 * Copyright ©️ 2024 Sebastian Delmont <sd@ham2k.com>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { fmtNumber, fmtPercent } from '@ham2k/lib-format-tools'
import { locationToGrid6 } from '@ham2k/lib-maidenhead-grid'

import { registerDataFile } from '../../../store/dataFiles'
import { database, dbExecute, dbSelectAll, dbSelectOne } from '../../../store/db/db'
import { Platform } from 'react-native'
import { fetchAndProcessBatchedLines } from '../../../store/dataFiles/actions/dataFileFS'

export const WWFFData = { prefixByDXCCCode: {} }

export function registerWWFFDataFile () {
  registerDataFile({
    key: 'wwff-all-parks',
    name: 'WWFF: All Parks',
    description: 'Database of all WWFF references',
    infoURL: 'https://wwff.co/directory/',
    icon: 'file-word-outline',
    maxAgeInDays: 30,
    enabledByDefault: false,
    fetch: async (args) => {
      const { key, definition, options } = args
      options.onStatus && await options.onStatus({ key, definition, status: 'progress', progress: 'Downloading raw data' })

      const url = 'https://wwff.co/wwff-data/wwff_directory.csv'

      const db = await database()
      db.transaction(transaction => {
        transaction.executeSql('UPDATE lookups SET updated = 0 WHERE category = ?', ['wwff'])
      })

      const dataRows = []

      // Since we're streaming, we cannot know how many references there are beforehand, so we need to take a guess
      const expectedReferences = 63000

      // Since the work is split in two phases, and their speeds are different,
      // we need to adjust the expected steps based on a ratio
      const fetchWorkRatio = 1
      const dbWorkRatio = Platform.OS === 'android' ? 7 : 3 // Inserts in android seem to be much slower
      const expectedSteps = expectedReferences * (fetchWorkRatio + dbWorkRatio)

      let completedSteps = 0
      let totalReferences = 0
      const startTime = Date.now()

      let headers
      const prefixByDXCCCode = {}

      const { etag } = await fetchAndProcessBatchedLines({
        ...args,
        url,
        chunkSize: 262144,
        processLineBatch: (lines) => {
          if (!headers) {
            headers = parseWWFFCSVRow(lines.shift()).filter(x => x)
          }

          for (const line of lines) {
            const row = parseWWFFCSVRow(line, { headers })
            if (row.status === 'active') {
              const lat = Number.parseFloat(row.latitude) || 0
              const lon = Number.parseFloat(row.longitude) || 0
              const grid = !row.iaruLocator ? locationToGrid6(lat, lon) : row.iaruLocator.replace(/[A-Z]{2}$/, x => x.toLowerCase())
              const rowData = {
                ref: row.reference.toUpperCase(),
                dxccCode: Number.parseInt(row.dxccEnum, 10) || 0,
                name: row.name,
                grid,
                lat,
                lon
              }

              if (!prefixByDXCCCode[rowData.dxccCode]) prefixByDXCCCode[rowData.dxccCode] = rowData.ref.split('-')[0]

              dataRows.push(rowData)
              completedSteps += fetchWorkRatio
            }
          }
          options.onStatus && options.onStatus({
            key,
            definition,
            status: 'progress',
            progress: `Loaded \`${fmtNumber(Math.round(completedSteps / (fetchWorkRatio + dbWorkRatio)))}\` references.\n\n\`${fmtPercent(Math.min(completedSteps / expectedSteps, 1), 'integer')}\` • ${fmtNumber(Math.max(expectedSteps - completedSteps, 1) * ((Date.now() - startTime) / 1000) / completedSteps, 'oneDecimal')} seconds left.`
          })
        }
      })

      while (dataRows.length > 0) {
        const batch = dataRows.splice(0, 223) // prime number chunks make for more "random" progress updates
        await (() => new Promise(resolve => {
          setTimeout(() => {
            db.transaction(async transaction => {
              for (const rowData of batch) {
                const jsonRowData = JSON.stringify(rowData)
                transaction.executeSql(`
                  INSERT INTO lookups
                    (category, subCategory, key, name, data, lat, lon, flags, updated)
                  VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, 1)
                  ON CONFLICT DO
                  UPDATE SET
                    subCategory = ?, name = ?, data = ?, lat = ?, lon = ?, flags = ?, updated = 1
                  `, ['wwff', `${rowData.dxccCode}`, rowData.ref, rowData.name, jsonRowData, rowData.lat, rowData.lon, 1, `${rowData.dxccCode}`, rowData.name, jsonRowData, rowData.lat, rowData.lon, 1]
                )

                completedSteps += dbWorkRatio
                totalReferences++
              }

              options.onStatus && options.onStatus({
                key,
                definition,
                status: 'progress',
                progress: `Loaded \`${fmtNumber(Math.round(completedSteps / (fetchWorkRatio + dbWorkRatio)))}\` references.\n\n\`${fmtPercent(Math.min(completedSteps / expectedSteps, 1), 'integer')}\` • ${fmtNumber(Math.max(expectedSteps - completedSteps, 1) * ((Date.now() - startTime) / 1000) / completedSteps, 'oneDecimal')} seconds left.`
              })
              resolve()
            })
          }, 0)
        }))()
      }

      db.transaction(transaction => {
        transaction.executeSql('DELETE FROM lookups WHERE category = ? AND updated = 0', ['wwff'])
      })
      console.log('totalReferences', totalReferences)
      console.log('seconds', (Date.now() - startTime) / 1000)
      console.log('per second', (totalReferences / (Date.now() - startTime) / 1000))

      return { totalReferences, prefixByDXCCCode, etag }
    },
    onLoad: (data) => {
      if (data.references) return false // Old data - TODO: Remove this after a few months
      WWFFData.prefixByDXCCCode = data.prefixByDXCCCode
      WWFFData.totalReferences = data.totalReferences
    },
    onRemove: async () => {
      await dbExecute('DELETE FROM lookups WHERE category = ?', ['wwff'])
    }
  })
}

export function wwffPrefixForDXCCCode (code) {
  return (WWFFData.prefixByDXCCCode && WWFFData.prefixByDXCCCode[code]) || ''
}

export async function wwffFindOneByReference (ref) {
  return await dbSelectOne('SELECT data FROM lookups WHERE category = ? AND key = ?', ['wwff', ref], { row: row => row?.data ? JSON.parse(row.data) : {} })
}

export async function wwffFindAllByName (dxccCode, name) {
  const results = await dbSelectAll(
    'SELECT data FROM lookups WHERE category = ? AND subCategory = ? AND (key LIKE ? OR name LIKE ?) AND flags = 1',
    ['wwff', `${dxccCode}`, `%${name}%`, `%${name}%`],
    { row: row => JSON.parse(row.data) }
  )
  return results
}

export async function wwffFindAllByLocation (dxccCode, lat, lon, delta = 1) {
  const results = await dbSelectAll(
    'SELECT data FROM lookups WHERE category = ? AND subCategory = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND flags = 1',
    ['wwff', `${dxccCode}`, lat - delta, lat + delta, lon - delta, lon + delta],
    { row: row => JSON.parse(row.data) }
  )
  return results
}

const CSV_ROW_REGEX = /(?:"((?:[^"]|"")*)"|([^",]*))(?:,|\s*$)/g
// (?:              # Start of non-capturing group for each column
//   "((?:[^"]|"")*)" #   Match a quoted string, capturing the contents
//   |              #   Or
//   ([^",]*)         #   Match an unquoted string
// )                # End of non-capturing group for each column
// (?:,|\s*$)       # Match either a comma or the end of the line

function parseWWFFCSVRow (row, options) {
  const parts = [...row.matchAll(CSV_ROW_REGEX)].map(match => match[1]?.replaceAll('""', '"') ?? match[2] ?? '')

  if (options?.headers) {
    const obj = {}
    options.headers.forEach((column, index) => {
      obj[column] = parts[index]
    })
    return obj
  } else {
    return parts
  }
}
