import { useEffect, useMemo, useReducer } from 'react'
import { loadStore, subscribeProfiles } from './profileStore.js'

/** 当前档案快照：只在成功提交/切档或其他窗口更新档案时重读。 */
export function useProfileData() {
  const [revision, refresh] = useReducer((value) => value + 1, 0)
  useEffect(() => {
    const unsubscribe = subscribeProfiles(refresh)
    const onStorage = (event) => {
      if (event.key === null || event.key.startsWith('nikke-photos/profiles/')) refresh()
    }
    window.addEventListener('storage', onStorage)
    refresh()
    return () => { unsubscribe(); window.removeEventListener('storage', onStorage) }
  }, [])
  return useMemo(() => loadStore(), [revision])
}
