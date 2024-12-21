/*
 * Copyright ©️ 2024 Sebastian Delmont <sd@ham2k.com>
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
import { POSTCODE_PREFIXES } from './RSGBBackpackersLocations'
import { Text } from 'react-native-paper'
import { NY_COUNTIES, NYQP_LOCATIONS } from '../nyqp/NYQPLocations'
import RSTInput from '../../../screens/components/RSTInput'

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
        format: 'cabrillo',
        nameTemplate: settings.useCompactFileNames ? `{call}-${Info.shortName}-{compactDate}` : `{date} {call} for ${Info.shortName}`,
        exportType: 'rsgb-backpackers-cabrillo',
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
    } else {
      if (qso?.their?.guess?.entityCode === 'K' || qso?.their?.guess?.entityCode === 'VE') {
        fields.push({ SRX_STRING: qso?.their?.state ?? qso?.their?.guess?.state })
      } else {
        fields.push({ SRX_STRING: 'DX' })
      }
    }

    return fields
  },

  cabrilloHeaders: ({
    operation,
    settings,
    headers
  }) => {
    const ref = findRef(operation, Info.key)

    let ourLocations = ref.location
    if (ref?.location?.match(SLASH_OR_COMMA_REGEX)) {
      ourLocations = ref.location.split(SLASH_OR_COMMA_REGEX, 2)
    } else {
      ourLocations = [ref.location]
    }

    headers.push(['CONTEST', 'RSGB-BACKPACKERS'])
    headers.push(['CALLSIGN', operation.stationCall || settings.operatorCall])
    headers.push(['LOCATION', ourLocations.join('/')])
    headers.push(['NAME', ''])
    if (operation.local?.operatorCall) headers.push(['OPERATORS', operation.local.operatorCall])
    if (operation.grid) headers.push(['GRID-LOCATOR', operation.grid])
    return headers
  },

  qsoToCabrilloParts: ({
    qso,
    ref,
    operation,
    settings
  }) => {
    let ourLocations = ref.location
    let weAreInState
    // @todo logic
    // if (ref?.location?.match(SLASH_OR_COMMA_REGEX)) {
    //   ourLocations = ref.location.split(SLASH_OR_COMMA_REGEX, 2)
    //   weAreInState = ref.location.split(SLASH_OR_COMMA_REGEX).every(c => NY_COUNTIES[c])
    // } else {
    //   ourLocations = [ref.location]
    //   weAreInState = !!NY_COUNTIES[ref.location]
    // }

    const qsoRef = findRef(qso, Info.key)

    let theirLocations
    let theyAreInState
    // @todo logic
    // if (qsoRef?.location?.match(SLASH_OR_COMMA_REGEX)) {
    //   theirLocations = qsoRef?.location.split(SLASH_OR_COMMA_REGEX, 2)
    //   theyAreInState = theirLocations.every(c => NY_COUNTIES[c])
    // } else if (qsoRef?.location) {
    //   theirLocations = [qsoRef?.location]
    //   theyAreInState = !!NY_COUNTIES[qsoRef?.location]
    // } else {
    //   if (qso?.their?.guess?.entityCode === 'K' || qso?.their?.guess?.entityCode === 'VE') {
    //     theirLocations = [qso?.their?.state ?? qso?.their?.guess?.state]
    //   } else {
    //     theirLocations = 'DX'
    //   }
    //   theyAreInState = false
    // }

    if (!weAreInState && !theyAreInState) {
      return []
    }

    const ourCall = operation.stationCall || settings.operatorCall

    const rows = []
    for (const ourLocation of ourLocations) {
      for (const theirLocation of theirLocations) {
        rows.push([
          (ourCall ?? ' ').padEnd(13, ' '),
          (qso?.mode === 'CW' || qso?.mode === 'RTTY' ? '599' : '59').padEnd(3, ' '),
          (ourLocation ?? ' ').padEnd(6, ' '),
          (qso?.their?.call ?? '').padEnd(13, ' '),
          (qso?.mode === 'CW' || qso?.mode === 'RTTY' ? '599' : '59').padEnd(3, ' '),
          (theirLocation ?? ' ').padEnd(6, ' ')
        ])
      }
    }
    return rows
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

  let isValid = true
  // @todo check validity of ref?.location

  fields.push(
    <RSTInput
      {...rstFieldProps}
      key="sent"
      innerRef={rstFieldRefs.shift()}
      value={qso?.our?.sent ?? ''}
      label="Sent"
      fieldId={'ourSent'}
    />
  )
  fields.push(
    <RSTInput
      {...rstFieldProps}
      key="received"
      innerRef={rstFieldRefs.shift()}
      value={qso?.their?.sent || ''}
      label="Rcvd"
      fieldId={'theirSent'}
    />
  )
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
      label={'Postcode'}
      placeholder=''
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
    if (POSTCODE_PREFIXES.includes(ref?.postcode)) {
      return [`Postcode prefix: ${ref?.postcode}`, true]
    } else if (ref?.postcode === 'DX') {
      return ['DX selected, your station is outside the UK.', true]
    } else if (ref?.postcode?.length === 2) {
      return [`${ref?.postcode} not valid! Please enter a two-letter UK postcode prefix, or "GY", "JE" or "IM" for crown dependencies, or "DX".`, false]
    } else {
      return ['Please enter a two-letter UK postcode prefix, or "GY", "JE" or "IM" for crown dependencies, or "DX".', false]
    }
  }, [ref?.postcode])

  return (
    <Ham2kListSection title={'Postcode'}>
      <ListRow>
        <ThemedTextInput
          style={[styles.input, { marginTop: styles.oneSpace, flex: 1 }]}
          textStyle={styles.text.callsign}
          label={'Postcode Prefix'}
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
