/*
 * Copyright ©️ 2024 Sebastian Delmont <sd@ham2k.com>
 * Copyright ©️ 2024 Ian Renton <ian@ianrenton.com>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React, { useCallback, useMemo } from 'react'
import { useDispatch } from 'react-redux'

import { setOperationData } from '../../../store/operations'
import { findRef, replaceRef } from '../../../tools/refTools'
import ThemedTextInput from '../../../screens/components/ThemedTextInput'
import { ListRow } from '../../../screens/components/ListComponents'
import { Ham2kListSection } from '../../../screens/components/Ham2kListSection'
import { POSTCODE_DISTRICTS } from './RSGBBackpackersLocations'
import { Text } from 'react-native-paper'
import { fmtTimestamp } from '../../../tools/timeFormats'

const Info = {
  key: 'rsgb-backpackers',
  icon: 'flag-checkered',
  name: 'RSGB 144MHz Backpackers (Experimental)',
  shortName: 'RSGB Backpackers',
  infoURL: 'https://www.rsgbcc.org/cgi-bin/contest_rules.pl?contest=144backpack1',
  defaultValue: { qth: '' }
}

const Extension = {
  ...Info,
  category: 'contests',
  onActivation: ({ registerHook }) => {
    registerHook('activity', { hook: ActivityHook })
    registerHook(`ref:${Info.key}`, { hook: ReferenceHandler })
  }
}
export default Extension

const ActivityHook = {
  ...Info,
  Options: ActivityOptions,

  hideStateField: true,

  mainExchangeForOperation
}

const ReferenceHandler = {
  ...Info,

  descriptionPlaceholder: '',
  description: (operation) => {
    let date
    if (operation?.qsos && operation.qsos[0]?.startAtMillis) date = Date.parse(operation.qsos[0].startAtMillis)
    else date = new Date()
    const ref = findRef(operation, Info.key)
    return [`RSGB 144MHz Backpackers ${date.getFullYear()}`, ref?.location].filter(x => x).join(' • ')
  },

  suggestOperationTitle: (ref) => {
    return {
      for: Info.shortName,
      subtitle: ref?.location
    }
  },

  suggestExportOptions: ({
    operation,
    ref,
    settings
  }) => {
    if (ref?.type === Info?.key) {
      return [{
        format: 'reg1test',
        nameTemplate: settings.useCompactFileNames ? `{call}-${Info.shortName}-{compactDate}` : `{date} {call} for ${Info.shortName}`,
        exportType: 'rsgb-backpackers-reg1test',
        titleTemplate: `{call}: ${Info.name} on {date}`
      }]
    }
  },

  adifFieldsForOneQSO: ({
    qso,
    operation
  }) => {
    const ref = findRef(operation, Info.key)
    const qsoRef = findRef(qso, Info.key)

    const fields = [
      { CONTEST_ID: 'RSGB-BACKPACKERS' },
      { STX_STRING: ref?.location }
    ]

    if (qsoRef?.location) {
      fields.push({ SRX_STRING: qsoRef.location })
    }

    return fields
  },

  reg1testHeaders: ({
    operation,
    qsos,
    settings,
    headers
  }) => {
    const ref = findRef(operation, Info.key)

    headers.push(['TName', 'RSGB-BACKPACKERS'])
    // Start and end date, YYYYMMDD format, semicolon separated. Blank if no QSOs exist.
    let dateField = ''
    if (qsos && qsos.length) {
      dateField = fmtTimestamp(qsos[0].startAtMillis).substring(0, 8) + ';' + fmtTimestamp(qsos[qsos.length - 1].endAtMillis).substring(0, 8)
    }
    headers.push(['TDate', dateField])
    // Station callsign. Fall back to operator call if not present.
    headers.push(['PCall', operation.stationCall || settings.operatorCall])
    // Grid reference
    headers.push(['PWWLo', operation.grid])
    // Own exchange (postcode district)
    headers.push(['PExch', ref?.postcode])
    // Contest section
    // @todo contest section. 5B/25H. Require user selection?
    headers.push(['PSect', '5B'])
    // Frequency band. Fixed for this contest
    headers.push(['PBand', '145 MHz'])
    // Operator callsign. Fall back to station call if not present.
    headers.push(['RCall', operation.operatorCall || settings.stationCall])
    // Transmit power, Watts. Power of last QSO used. Blank if no QSOs exist.
    let powerField = ''
    if (qsos && qsos.length) {
      powerField = qsos[qsos.length - 1].power ? qsos[qsos.length - 1].power : ''
    }
    headers.push(['SPowe', powerField])

    // Personally identifying information that I do not believe we have to ask the user for or provide for a successful
    // file generation
    headers.push(['PAdr1', ''])
    headers.push(['PAdr2', ''])
    headers.push(['PClub', ''])
    headers.push(['RName', ''])
    headers.push(['RAdr1', ''])
    headers.push(['RAdr2', ''])
    headers.push(['RPoCo', ''])
    headers.push(['RCity', ''])
    headers.push(['RCoun', ''])
    headers.push(['RPhon', ''])
    headers.push(['RHBBS', ''])
    headers.push(['MOpe1', ''])
    headers.push(['MOpe2', ''])

    // Station & equipment information that I do not believe we have to ask the user for or provide for a successful
    // file generation
    headers.push(['STXEq', ''])
    headers.push(['SRXEq', ''])
    headers.push(['SAnte', ''])
    headers.push(['SAntH', ''])

    // Claimed score parameters. Recorded as blank in the REG1TEST file as these are calculated server-side anyway, and
    // this spares us from having to calculate them
    headers.push(['CQSOs', ''])
    headers.push(['CQSOP', ''])
    headers.push(['CWWLs', ''])
    headers.push(['CWWLB', ''])
    headers.push(['CExcs', ''])
    headers.push(['CExcB', ''])
    headers.push(['CDXCs', ''])
    headers.push(['CDXCB', ''])
    headers.push(['CToSc', ''])
    headers.push(['CODXC', ''])

    return headers
  },

  // @todo implement
  qsoToReg1testParts: ({ qso, operation, ref }) => {
    return qso
  },

  relevantInfoForQSOItem: ({
    qso,
    operation
  }) => {
    return [qso.their.exchange]
  }
}

function mainExchangeForOperation (props) {
  const { qso, updateQSO, styles, refStack } = props

  const ref = findRef(qso?.refs, Info.key) || { type: Info.key, location: '' }

  const fields = []

  let isValid
  if (POSTCODE_DISTRICTS[ref?.location]) {
    isValid = true
  } else if (ref?.location?.match('DX')) {
    isValid = true
  }

  fields.push(
    <ThemedTextInput
      {...props}
      key={`${Info.key}/grid`}
      innerRef={refStack.shift()}
      style={[styles.input, { minWidth: styles.oneSpace * 10, flex: 1 }]}
      textStyle={styles.text.callsign}
      label={'Grid'}
      placeholder={qso?.their?.grid ?? qso?.their?.guess?.grid}
      mode={'flat'}
      uppercase={true}
      noSpaces={true}
      value={ref?.grid || ''}
      error={!isValid}
      onChangeText={(text) => updateQSO({
        refs: replaceRef(qso?.refs, Info.key, { ...ref, grid: text }),
        their: { exchange_grid: text }
      })}
    />
  )
  fields.push(
    <ThemedTextInput
      {...props}
      key={`${Info.key}/postcode`}
      innerRef={refStack.shift()}
      style={[styles.input, { minWidth: styles.oneSpace * 10, flex: 1 }]}
      textStyle={styles.text.callsign}
      label={'Postcode District'}
      placeholder=""
      mode={'flat'}
      uppercase={true}
      noSpaces={true}
      value={ref?.postcode || ''}
      error={!isValid}
      onChangeText={(text) => updateQSO({
        refs: replaceRef(qso?.refs, Info.key, { ...ref, postcode: text }),
        their: { exchange_postcode: text }
      })}
    />
  )
  return fields
}

export function ActivityOptions (props) {
  const { styles, operation } = props

  const dispatch = useDispatch()

  const ref = useMemo(() => findRef(operation, Info.key), [operation])

  const handleChange = useCallback((value) => {
    if (value?.location) value.location = value.location.toUpperCase()

    dispatch(setOperationData({ uuid: operation.uuid, refs: replaceRef(operation?.refs, Info.key, { ...ref, ...value }) }))
  }, [dispatch, operation, ref])

  const [postcodeDesc, isValid] = useMemo(() => {
    if (POSTCODE_DISTRICTS[ref?.postcode]) {
      return [`Postcode district: ${ref?.postcode}`, true]
    } else if (ref?.postcode === 'DX') {
      return ['DX selected, your station is outside the UK.', true]
    } else if (ref?.postcode?.length === 2) {
      return [`${ref?.postcode} not valid! Please enter a UK postcode district, or "GY", "JE" or "IM" for crown dependencies, or "DX".`, false]
    } else {
      return ['Please enter a UK postcode district, or "GY", "JE" or "IM" for crown dependencies, or "DX".', false]
    }
  }, [ref?.postcode])

  return (
    <Ham2kListSection title={'Postcode'}>
      <ListRow>
        <ThemedTextInput
          style={[styles.input, { marginTop: styles.oneSpace, flex: 1 }]}
          textStyle={styles.text.callsign}
          label={'Postcode District'}
          mode={'flat'}
          uppercase={true}
          noSpaces={true}
          error={!isValid}
          value={ref?.postcode || ''}
          onChangeText={(text) => handleChange({ postcode: text })}
        />
      </ListRow>
      <Text style={{ paddingHorizontal: styles.oneSpace * 2.5, marginTop: styles.oneSpace * 2, marginBottom: styles.oneSpace * 3 }}>
        {postcodeDesc}
      </Text>
    </Ham2kListSection>
  )
}
