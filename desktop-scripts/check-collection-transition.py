"""Saved user regression frames only; no native connection or game inputs."""
import json,sys,shutil
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
from PIL import Image
import numpy as np
sys.dont_write_bytecode=True
project=Path(__file__).resolve().parents[1];sys.path.insert(0,str(project/'automation/maanikke'))
from collection_vision import candidates,choose_candidate,popup_surface_ready,popup_signature,popup_unchanged
from collection_worker import Collector,PageDeviation
base=project.parent/'codex temp/nikke-desktop'
load=lambda p:np.asarray(Image.open(p).convert('RGB'))[:,:,::-1].copy()
fixtures=base/'automation-dev-copy/collection-regression-fixtures';fixtures.mkdir(exist_ok=True)
for name,source in [('scarlet-results.png','674368c6-cc09-4c1e-8305-36fd77baf43e.png'),('equipment-fading.png','36d11985-b369-4470-84b9-9cee4137e7ab.png')]:
    if not (fixtures/name).exists():shutil.copyfile(base/'maanikke-screenshots'/source,fixtures/name)
search=load(fixtures/'scarlet-results.png')
fading=load(fixtures/'equipment-fading.png')
settled=load(base/'automation-dev-copy/admin-nikke/aae6f3c9-8a52-4492-91be-0ce5f96faa91/031-equipment-0-头.png')
roster={c['nameCn']:c for c in json.loads((project/'src/data/roster.json').read_text('utf-8'))['characters']}
items=candidates(search)
assert len(items)==2,items
assert choose_candidate(items,roster['红莲'])[0]['box'][0]==229,items
assert choose_candidate(items,roster['红莲：暗影'])[0]['box'][0]==80,items
no_burst=[{**v,'burst':None} for v in items]
assert choose_candidate(no_burst,roster['红莲'])[0]['box'][0]==229
assert not popup_surface_ready(fading)
assert popup_surface_ready(settled)
assert popup_unchanged(popup_signature(settled),popup_signature(settled))
assert not popup_unchanged(popup_signature(fading),popup_signature(settled))
class Probe(Collector):
    def __init__(self,frames):
        super().__init__({'characters':[]},fixtures);self.clock=0;self.frames=frames;self.index=0;self.s=SimpleNamespace(last=None);self.classifications=0;self.page_type='overload';self.pages=SimpleNamespace(page=self.classify)
    def classify(self):self.classifications+=1;return self.page_type
    def progress(self,*_,**__):pass
    def delay(self,seconds):self.clock+=seconds
    def capture(self,record=True):assert not record;self.s.last=self.frames[min(self.index,len(self.frames)-1)];self.index+=1
probe=Probe([fading,fading,settled,settled])
with patch('collection_worker.time.monotonic',lambda:probe.clock):probe.wait_popup()
assert probe.index==4 and np.array_equal(probe.s.last,settled)
assert probe.classifications==1
blocked=Probe([fading])
try:
    with patch('collection_worker.time.monotonic',lambda:blocked.clock):blocked.wait_popup(timeout=1)
    raise AssertionError('A permanently faded popup must time out')
except PageDeviation:pass
assert blocked.classifications==0
wrong=Probe([settled]);wrong.page_type='unknown'
try:
    with patch('collection_worker.time.monotonic',lambda:wrong.clock):wrong.wait_popup(timeout=1)
    raise AssertionError('Stable background accepted without popup classification')
except PageDeviation:pass
print(json.dumps({'passed':True,'gameInputs':0,'actualScarletSelected':True,'actualBlackShadowSelected':True,'uniqueElementWithUnknownBurst':True,'actualFadingFrameRejected':True,'opaqueFrameAccepted':True,'changedFrameRejected':True,'classifyOnlyFinalStableFrame':True,'fadingSkipsOCR':True,'stableNonPopupRejected':True,'elements':[i['element'] for i in items]}))
