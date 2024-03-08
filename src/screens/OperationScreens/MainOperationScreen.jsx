import React, { useEffect, useMemo } from 'react'

import { useDispatch, useSelector } from 'react-redux'
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs'

import ScreenContainer from '../components/ScreenContainer'
import { loadOperation, selectOperation } from '../../store/operations'
import OpLoggingTab from './OpLoggingTab/OpLoggingTab'
import OpSettingsTab from './OpSettingsTab/OpSettingsTab'
import { Platform, useWindowDimensions } from 'react-native'
import { loadQSOs } from '../../store/qsos'
import { selectSettings } from '../../store/settings'
import OpSpotsTab from './OpSpotsTab.jsx/OpSpotsTab'
import { startTickTock } from '../../store/time'

const Tab = createMaterialTopTabNavigator()

export default function MainOperationScreen ({ navigation, route }) {
  const dispatch = useDispatch()
  const operation = useSelector(selectOperation(route.params.operation.uuid))
  const settings = useSelector(selectSettings)

  // Ensure the clock is ticking
  useEffect(() => {
    dispatch(startTickTock())
  }, [dispatch])

  // When starting, make sure all operation data is loaded
  useEffect(() => {
    dispatch(loadQSOs(route.params.operation.uuid))
    dispatch(loadOperation(route.params.operation.uuid))
  }, [route.params.operation.uuid, dispatch])

  // When operation data is loaded, set the title
  useEffect(() => {
    if (operation?.stationCall || settings?.operatorCall) {
      navigation.setOptions({ title: (operation?.stationCall || settings?.operatorCall) + ` ${operation?.title}`, subTitle: operation.subtitle })
    } else {
      navigation.setOptions({ title: 'New Operation' })
    }
  }, [navigation, operation, settings])

  const settingsOnly = useMemo(() => {
    return route.params.isNew || (!operation.stationCall && !settings?.operatorCall)
  }, [operation, settings, route.params.isNew])

  const dimensions = useWindowDimensions()

  return (
    <ScreenContainer>
      <Tab.Navigator
        id={'OperationScreen_TabNavigator'}
        initialLayout={{ width: dimensions.width, height: dimensions.height }}
        initialRouteName={ settingsOnly ? 'Settings' : 'QSOs'}
        screenOptions={{
          tabBarItemStyle: { width: dimensions.width / 3 }, // This allows tab titles to be rendered while the screen is transitioning in

          // See https://github.com/react-navigation/react-navigation/issues/11301
          // on iOS, if the keyboard is open, tabs get stuck when switching
          animationEnabled: Platform.OS !== 'ios'
        }}
      >
        <Tab.Screen
          name="Settings"
          options={{ title: 'Info' }}
          component={OpSettingsTab}
          initialParams={{ uuid: operation.uuid, operation }}
        />

        <Tab.Screen
          name="QSOs"
          component={OpLoggingTab}
          initialParams={{ uuid: operation.uuid, operation }}
          // listeners={{
          //   tabPress: e => { settingsOnly && e.preventDefault() }
          // }}
        />

        <Tab.Screen
          name="Spots"
          component={OpSpotsTab}
          initialParams={{ uuid: operation.uuid, operation }}
          // listeners={{
          //   tabPress: e => { settingsOnly && e.preventDefault() }
          // }}
        />

      </Tab.Navigator>
    </ScreenContainer>
  )
}