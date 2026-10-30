import json
import os
import random
import sys
import time
from pathlib import Path
sys.dont_write_bytecode=True
project=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(project/'automation/maanikke'))
from worker import Service
from collection_worker import Pages
from collection_vision import candidates,choose_candidate,safe_point
from PIL import Image
import numpy as np
base=project.parent/'codex temp/nikke-desktop/automation-dev-copy'
cache=base/('collection-vision-'+str(int(time.time()*1000)))
service=Service(cache)
roster={c['nameCn']:c for c in json.loads((project/'src/data/roster.json').read_text('utf-8'))['characters']}
def load(path):
    service.last=np.asarray(Image.open(path).convert('RGB'))[:,:,::-1].copy();pages.reset()
try:
    service.initialize();pages=Pages(service);results=[]
    for relative,name,expected_index in [
        ('aae6f3c9-8a52-4492-91be-0ce5f96faa91/019-query-results-2.png','桃乐丝',1),
        ('aae6f3c9-8a52-4492-91be-0ce5f96faa91/066-query-results-2.png','米哈拉：羁绊锁链',0),
        ('03ed8bc9-4246-415a-95a3-8accfe012500/009-query-results-2.png','小红帽',1)]:
        load(base/'admin-nikke'/relative);assert pages.page()=='list',pages.page()
        pages.reset();assert pages.is_page('list'), 'Expected-state list anchors failed'
        items=candidates(service.last);selected,reason=choose_candidate(items,roster[name]);assert selected==items[expected_index],items
        results.append({'case':'candidate','name':name,'count':len(items),'selected':expected_index,'reason':reason})
    for relative,name in [
        ('aae6f3c9-8a52-4492-91be-0ce5f96faa91/026-detail-5.png','桃乐丝'),
        ('aae6f3c9-8a52-4492-91be-0ce5f96faa91/070-detail-2.png','米哈拉：羁绊锁链'),
        ('03ed8bc9-4246-415a-95a3-8accfe012500/013-detail-2.png','小红帽')]:
        load(base/'admin-nikke'/relative);assert pages.detail_matches(roster[name]),(name,pages.page(),pages.texts(pages.ocr([1725,220,150,65])))
        assert all(pages.slot_state(i)=='equipped' for i in range(4)),[pages.slot_state(i) for i in range(4)]
        results.append({'case':'detail','name':name,'equipment':True})
    load(base/'admin-nikke/03ed8bc9-4246-415a-95a3-8accfe012500/050-hall-2.png');assert pages.page()=='hall',pages.page()
    load(base/'admin-nikke/aae6f3c9-8a52-4492-91be-0ce5f96faa91/031-equipment-0-头.png');assert pages.page()=='overload',pages.page()
    # Historical clipboard samples may have expired. Cache them when present,
    # and report unavailable cases explicitly instead of inventing a pass.
    import shutil
    fixture_dir=base/'collection-regression-fixtures';fixture_dir.mkdir(exist_ok=True)
    legacy={
        'tier9':('tier9-popup-source.png',Path(r'C:/Users/xby/AppData/Local/Temp/codex-clipboard-920f5453-a013-4e35-92f5-6412b6110c76.png')),
        'emptySlots':('empty-slots-source.png',Path(r'C:/Users/xby/AppData/Local/Temp/codex-clipboard-17fc4a3f-3baa-4eed-9367-d385010979c3.png'))}
    checked={};skipped=[]
    for kind,(name,original) in legacy.items():
        cached=fixture_dir/name
        if not cached.exists() and original.exists():shutil.copyfile(original,cached)
        if not cached.exists():skipped.append(kind);continue
        sample=Image.open(cached).convert('RGB')
        canvas=Image.new('RGB',(1920,1080),(50,50,50) if kind=='tier9' else 'white')
        canvas.paste(sample,(675,70) if kind=='tier9' else (1590,696));service.last=np.asarray(canvas)[:,:,::-1].copy();pages.reset()
        if kind=='tier9':assert pages.page()=='non_overload',pages.page()
        else:assert all(pages.slot_state(i)=='unequipped' for i in range(4))
        checked[kind]=True
    pts=[safe_point([100,200,60,40],random.Random(i)) for i in range(100)]
    assert len(set(pts))>50 and all(115<=x<=145 and 210<=y<=230 for x,y in pts)
    print(json.dumps({'passed':True,'cases':results,'hall':True,'overload':True,'legacySamplesChecked':checked,'skippedUnavailableLegacySamples':skipped,'randomSafePoints':True,'gameInputs':0,'evidence':str(cache)},ensure_ascii=False))
finally:service.close()
