import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppDataContext } from './appDataContext.js'
import { assertDataRepository } from './dataRepository.js'
import { createDataRepository } from './repositoryFactory.js'

export function AppProvider({ children, repository: providedRepository }) {
  const [repositorySetup] = useState(() => {
    try {
      return {
        repository: assertDataRepository(providedRepository || createDataRepository()),
        error: '',
      }
    } catch (error) {
      return { repository: null, error: error.message }
    }
  })
  const repository = repositorySetup.repository
  const [data, setData] = useState(null)
  const [storageState, setStorageState] = useState(() => ({
    status: repositorySetup.error ? 'repository-error' : 'loading',
    error: repositorySetup.error,
    raw: null,
  }))

  useEffect(() => {
    if (!repository) return undefined
    let active = true
    repository.load()
      .then((result) => {
        if (!active) return
        setData(result.data)
        setStorageState({ status: result.status, error: result.error, raw: result.raw })
      })
      .catch((error) => {
        if (!active) return
        setStorageState({
          status: 'repository-error',
          error: error.message,
          errorType: error.category || 'repository',
          raw: null,
        })
      })
    return () => { active = false }
  }, [repository])

  const handleRepositoryError = useCallback((error, operation) => {
    if (error?.recoverableLocalWrite && error.data) {
      setData(error.data)
      setStorageState({ status: 'write-error', error: error.message, raw: null })
      return false
    }
    setStorageState((current) => {
      if (operation === 'replace' && current.status === 'uninitialized') {
        return { ...current, error: error.message }
      }
      if (operation === 'replace' && ['corrupt', 'unavailable'].includes(current.status)) {
        return { ...current, error: error.message }
      }
      return {
        status: 'repository-error',
        error: error.message,
        errorType: error.category || 'repository',
        raw: null,
        operation,
      }
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

  const createCustomer = useCallback(async (record) => {
    try {
      const result = await repository.addRecord('customers', record)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return { record: result.record, error: '' }
    } catch (error) {
      handleRepositoryError(error, 'create customer')
      return { record: null, error: error.message }
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

  const createOrder = useCallback(async (order, optionalInitialPayment) => {
    try {
      const result = await repository.createOrder(order, optionalInitialPayment)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return result.record
    } catch (error) {
      handleRepositoryError(error, 'create order')
      return null
    }
  }, [repository, handleRepositoryError])

  const updateOrder = useCallback(async (id, updates) => {
    try {
      const result = await repository.updateOrder(id, updates)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return result.record
    } catch (error) {
      handleRepositoryError(error, 'update order')
      return null
    }
  }, [repository, handleRepositoryError])

  const transitionOrder = useCallback(async (id, nextStatus) => {
    try {
      const result = await repository.transitionOrder(id, nextStatus)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return result.record
    } catch (error) {
      handleRepositoryError(error, 'transition order')
      return null
    }
  }, [repository, handleRepositoryError])

  const recordPayment = useCallback(async (payment) => {
    try {
      const result = await repository.recordPayment(payment)
      setData(result.data)
      setStorageState({ status: 'ready', error: '', raw: null })
      return result.record
    } catch (error) {
      handleRepositoryError(error, 'record payment')
      return null
    }
  }, [repository, handleRepositoryError])

  const exportBackup = useCallback(async () => {
    try {
      return await repository.exportBackup()
    } catch (error) {
      handleRepositoryError(error, 'export backup')
      return null
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

  const replaceData = useCallback(async (nextData, options) => {
    try {
      const result = await repository.replaceData(nextData, options)
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
    dataReady: Boolean(data),
    storageState,
    addRecord,
    createCustomer,
    updateRecord,
    deleteRecord,
    createOrder,
    updateOrder,
    transitionOrder,
    recordPayment,
    exportBackup,
    updateSettings,
    replaceData,
    retryStorageSave,
  }), [data, storageState, addRecord, createCustomer, updateRecord, deleteRecord, createOrder, updateOrder, transitionOrder, recordPayment, exportBackup, updateSettings, replaceData, retryStorageSave])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
