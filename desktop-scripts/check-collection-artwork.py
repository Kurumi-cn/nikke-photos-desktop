"""Saved rolling-name positive plus wrong-character SIFT negatives; no game input."""
import json
import sys
import time
from pathlib import Path
from PIL import Image
import numpy as np
sys.dont_write_bytecode=True
project=Path(__file__).resolve().parents[1];sys.path.insert(0,str(project/'automation/maanikke'))
from worker import Service
from collection_worker import Pages
from collection_vision import name_fragment_matches
base=project.parent/'codex temp/nikke-desktop/automation-dev-copy';cache=base/('artwork-regression-'+str(int(time.time()*1000)))
service=Service(cache)
try:
    service.initialize();service.last=np.asarray(Image.open(base/'collection-regression-fixtures/mihara-scroll.png').convert('RGB'))[:,:,::-1].copy()
    pages=Pages(service);roster={c['nameCn']:c for c in json.loads((project/'src/data/roster.json').read_text('utf-8'))['characters']}
    positive=pages.artwork_matches(roster['米哈拉：羁绊锁链']);negative=pages.artwork_matches(roster['桃乐丝'])
    assert positive['hit'] and not negative['hit'],(positive,negative)
    assert name_fragment_matches('米哈拉：羁绊锁链','半锁链')
    assert not name_fragment_matches('米哈拉：羁绊锁链','桃乐丝')
    assert not name_fragment_matches('小红帽','帽')
    assert name_fragment_matches('D','D') and name_fragment_matches('K','K')
    assert not name_fragment_matches('D','K')
    assert pages.detail_matches(roster['米哈拉：羁绊锁链'])
    result={'passed':True,'selectedSkin':next(r['file'] for r in positive['results'] if r['hit']),'wrongCharacterRejected':True,'partialNameEdgeHandled':True,'native':'5.12.2','gameInputs':0}
    (cache/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({**result,'evidence':str(cache)},ensure_ascii=False))
finally:service.close()
