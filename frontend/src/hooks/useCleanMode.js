import { useLocation } from 'react-router-dom'

const KEY = 'biasforge_clean_mode'

/* ───────── Screenshot mode ─────────
   `?clean=1` hides the signed-in email so marketing captures don't leak an
   account address. `?clean=0` turns it back off. Display-only — it never
   touches auth, plan or any persisted app state.

   The flag is latched in sessionStorage so it survives in-app navigation
   (react-router drops the query string on every <Link>), and dies with the tab.
*/
export function useCleanMode() {
  const { search } = useLocation()
  const param = new URLSearchParams(search).get('clean')

  if (param === '1') {
    try { sessionStorage.setItem(KEY, '1') } catch { /* private mode */ }
    return true
  }
  if (param === '0') {
    try { sessionStorage.removeItem(KEY) } catch { /* private mode */ }
    return false
  }

  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}
