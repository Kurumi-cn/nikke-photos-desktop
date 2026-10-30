import {useState} from 'react'
import {assetUrl} from '../lib/roster.js'
import {t} from '../lib/i18n.js'
// An unavailable image must not leave a browser broken-image glyph in selectors.
export default function CharacterAvatar({path,alt=''}) {
  const [failed,setFailed]=useState(null)
  return path && failed!==path
    ? <img src={assetUrl(path)} alt={alt} loading="lazy" decoding="async" onError={()=>setFailed(path)}/>
    : <span className="ph">{t('无头像')}</span>
}
