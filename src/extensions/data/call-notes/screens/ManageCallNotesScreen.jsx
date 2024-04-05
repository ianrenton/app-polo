/* eslint-disable react/no-unstable-nested-components */
import React, { useCallback, useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { Button, Dialog, List, Portal, Switch, Text } from 'react-native-paper'
import { KeyboardAvoidingView, ScrollView } from 'react-native'

import ScreenContainer from '../../../../screens/components/ScreenContainer'
import { useThemedStyles } from '../../../../styles/tools/useThemedStyles'
import { selectExtensionSettings, setExtensionSettings } from '../../../../store/settings'
import { BUILT_IN_NOTES, CallNotes, CallNotesFiles, Info, createDataFileDefinition } from '../CallNotesExtension'
import ThemedTextInput from '../../../../screens/components/ThemedTextInput'
import { registerDataFile, unRegisterDataFile } from '../../../../store/dataFiles'
import { loadDataFile } from '../../../../store/dataFiles/actions/dataFileFS'
import { useUIState } from '../../../../store/ui'

const FileDefinitionDialog = ({ index, extSettings, styles, dispatch, onDialogDone }) => {
  const def = useMemo(() => extSettings.customFiles[index], [extSettings.customFiles, index])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const originalDef = useMemo(() => extSettings.customFiles[index], [index])

  const updateDef = useCallback((values) => {
    const newFiles = [...extSettings.customFiles]
    newFiles[index] = { ...newFiles[index], ...values }
    dispatch(setExtensionSettings({ key: Info.key, customFiles: newFiles }))
  }, [dispatch, index, extSettings])

  const handleDelete = useCallback(() => {
    const newFiles = [...extSettings.customFiles]
    newFiles.splice(index, 1)
    dispatch(setExtensionSettings({ key: Info.key, customFiles: newFiles }))

    const pos = CallNotesFiles.findIndex(f => f.location === originalDef.location)
    if (pos >= 0) {
      CallNotesFiles.splice(pos, 1)
      delete CallNotes[originalDef.location]
      unRegisterDataFile(`call-notes-${originalDef.location}`)
    }

    onDialogDone && onDialogDone()
  }, [dispatch, extSettings.customFiles, index, onDialogDone, originalDef])

  const handleDone = useCallback(async () => {
    if (def.location !== originalDef.location) {
      const pos = CallNotesFiles.findIndex(f => f.location === originalDef.location)
      if (pos >= 0) {
        CallNotesFiles[pos] = def
      } else {
        CallNotesFiles.push(def)
      }
      delete CallNotes[originalDef.location]
      unRegisterDataFile(`call-notes-${originalDef.location}`)

      registerDataFile(createDataFileDefinition(def))
      await dispatch(loadDataFile(`call-notes-${def.location}`))
    }
    onDialogDone && onDialogDone()
  }, [onDialogDone, def, dispatch, originalDef])

  return (
    <Portal>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={'height'}>
        <Dialog visible={true} onDismiss={onDialogDone}>
          <Dialog.Icon icon={'file-account-outline'} />
          <Dialog.Title style={{ textAlign: 'center' }}>Callsign Notes File</Dialog.Title>
          <Dialog.Content>
            <ThemedTextInput
              label="Name"
              value={def.name ?? ''}
              placeholder={'Name for your Callsign Notes File'}
              onChangeText={(value) => updateDef({ name: value }) }
              style={{ marginBottom: styles.oneSpace }}
            />
            <ThemedTextInput
              label="Location"
              value={def.location ?? ''}
              inputMode={'url'}
              multiline={true}
              placeholder={'https://example.com/dir/notes.txt'}
              onChangeText={(value) => updateDef({ location: value }) }
            />
          </Dialog.Content>
          <Dialog.Actions style={{ justifyContent: 'space-between' }}>
            <Button onPress={handleDelete}>Delete</Button>
            <Button onPress={handleDone}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </KeyboardAvoidingView>
    </Portal>
  )
}

export default function ManageCallNotesScreen ({ navigation, dispatch }) {
  useEffect(() => {
    navigation.setOptions({ title: 'Callsign Notes' })
  }, [navigation])

  const styles = useThemedStyles()

  const extSettings = useSelector(state => selectExtensionSettings(state, Info.key))

  const customFiles = useMemo(() => {
    return extSettings?.customFiles || []
  }, [extSettings])

  const enabledLocations = useMemo(() => {
    const enabled = extSettings?.enabledLocations || {}
    BUILT_IN_NOTES.forEach(def => {
      enabled[def.location] = enabled[def.location] ?? true
    })
    return enabled
  }, [extSettings?.enabledLocations])

  const [selectedFile, setSelectedFile] = useUIState('ManageCallNotesScreen', 'selectedFile', undefined)

  return (
    <ScreenContainer>
      <ScrollView style={{ flex: 1 }}>
        <List.Section>
          <List.Subheader>Builtin</List.Subheader>
          {BUILT_IN_NOTES.map(def => (
            <List.Item
              key={def.name}
              title={def.name}
              description={def.description}
              left={() => <List.Icon style={{ marginLeft: styles.oneSpace * 2 }} icon="file-account-outline" />}
              right={() => <Switch value={!!enabledLocations[def.location]} onValueChange={(value) => dispatch(setExtensionSettings({ key: Info.key, enabledLocations: { ...enabledLocations, [def.location]: value } })) } />}
              onPress={() => dispatch(setExtensionSettings({ key: Info.key, enabledLocations: { ...enabledLocations, [def.location]: !enabledLocations[def.location] } }))}
            />
          ))}
        </List.Section>

        <List.Section>
          <List.Subheader>Custom</List.Subheader>
          {customFiles.map((def, i) => (
            <List.Item key={i}
              title={def.name}
              description={def.location}
              left={() => <List.Icon style={{ marginLeft: styles.oneSpace * 2 }} icon="file-account-outline" />}
              right={() => <Switch value={!!enabledLocations[def.location]} onValueChange={(value) => dispatch(setExtensionSettings({ key: Info.key, enabledLocations: { ...enabledLocations, [def.location]: value } })) } />}
              onPress={() => setSelectedFile(i)}
            />
          ))}

          <List.Item
            title={'Add a new file'}
            left={() => <List.Icon style={{ marginLeft: styles.oneSpace * 2 }} icon="plus" />}
            onPress={() => {
              dispatch(setExtensionSettings({ key: Info.key, customFiles: [...customFiles, { name: '' }] }))
              setSelectedFile(customFiles.length)
            }}
          />

        </List.Section>
        {selectedFile !== undefined && (
          <FileDefinitionDialog
            index={selectedFile}
            extSettings={extSettings}
            styles={styles}
            dispatch={dispatch}
            onDialogDone={() => setSelectedFile(undefined)}
          />
        )}
        <List.Section>
          <List.Subheader>About Callsign Notes</List.Subheader>
          <Text style={{ marginHorizontal: styles.oneSpace * 2 }}>
            Callsign notes are stored on simple text files, one call per line followed by
            information you want shown in the logging screen. You can use the builtin files
            or add your own.
          </Text>
        </List.Section>
      </ScrollView>
    </ScreenContainer>
  )
}