import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppDataContext } from './appDataContext.js'
import { assertDataRepository } from './dataRepository.js'
import { createLocalStorageRepository } from './localStorageRepository.js'

const defaultRepository = assertDataRepository(createLocalStorageRepository())

export function AppProvider({ children, repository = defaultRepository }) {
  const [data, setData] = useState(null)
  const [storageState, setStorageState] = useState({ status: 'loading', error: '', raw: null })

  useEffect(() => {
    let active = true
    repository.load()
      .then((result) => {
        if (!active) return
        setData(result.data)
        setStorageState({ status: result.status, error: result.error, raw: result.raw })
      })
      .catch((error) => {
        if (!active) return
        setStorageState({ status: 'unavailable', error: error.message, raw: null })
      })
    return () => { active = false }
  }, [repository])

  const handleRepositoryError = useCallback((error, operation) => {
    if (error?.data) {
      setData(error.data)
      setStorageState({ status: 'write-error', error: error.message, raw: null })
      return false
    }
    setStorageState((current) => {
      if (operation === 'replace' && ['corrupt', 'unavailable'].includes(current.status)) {
        return { ...current, error: error.message }
      }
      return { status: 'operation-error', error: error.message, raw: null }
    })
    return false
  }, [])

  const addRecord = useCallback(async (collection, record) => {
    try {
      const result = await repository.addRecord(collection, record)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return result.record
    } catch (error) {
      handleRepositoryError(error, 'create')
      return null
    }
  }, [repository, handleRepositoryError])

  const updateRecord = useCallback(async (collection, id, updates) => {
    try {
      const result = await repository.updateRecord(collection, id, updates)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return result.record
    } catch (error) {
      handleRepositoryError(error, 'update')
      return null
    }
  }, [repository, handleRepositoryError])

  const deleteRecord = useCallback(async (collection, id) => {
    try {
      const result = await repository.deleteRecord(collection, id)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return true
    } catch (error) {
      handleRepositoryError(error, 'delete')
      return false
    }
  }, [repository, handleRepositoryError])

  const updateSettings = useCallback(async (updates) => {
    try {
      const result = await repository.updateSettings(updates)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return true
    } catch (error) {
      handleRepositoryError(error, 'update settings')
      return false
    }
  }, [repository, handleRepositoryError])

  const replaceData = useCallback(async (nextData) => {
    try {
      const result = await repository.replaceData(nextData)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return true
    } catch (error) {
      return handleRepositoryError(error, 'replace')
    }
  }, [repository, handleRepositoryError])

  const retryStorageSave = useCallback(async () => {
    try {
      const result = await repository.retrySave()
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return true
    } catch (error) {
      return handleRepositoryError(error, 'save')
    }
  }, [repository, handleRepositoryError])

  const value = useMemo(() => ({
    ...(data || {}),
    storageState,
    addRecord,
    updateRecord,
    deleteRecord,
    updateSettings,
    replaceData,
    retryStorageSave,
  }), [data, storageState, addRecord, updateRecord, deleteRecord, updateSettings, replaceData, retryStorageSave])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
