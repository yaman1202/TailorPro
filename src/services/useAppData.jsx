import { useContext } from 'react'
import { AppDataContext } from './appDataContext.js'

export default function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) throw new Error('useAppData must be used within AppProvider.')
  return context
}
