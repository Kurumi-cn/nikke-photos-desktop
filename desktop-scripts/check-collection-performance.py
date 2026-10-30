"""Offline capture/export and two-frame contracts; never connects to a game."""
import json
import sys
import time
from pathlib import Path
from unittest.mock import Mock,patch
import numpy as np
from PIL import Image
sys.dont_write_bytecode=True
project=Path(__file__).resolve().parents[1];sys.path.insert(0,str(project/'automation/maanikke'))
import worker
from collection_worker import Collector,Pages,PageDeviation
base=project.parent/'codex temp/nikke-desktop/automation-dev-copy'
folder=base/('collection-perf-'+str(int(time.time()*1000)));folder.mkdir()
image=np.asarray(Image.open(base/'collection-regression-fixtures/mihara-scroll.png').convert('RGB'))[:,:,::-1].copy()
service=worker.Service(folder);service.connection={'hwnd':'123'}
service.windows=lambda:{'windows':[service.connection]};service.controller=Mock(cached_image=image)
service.controller.post_screencap.return_value.wait.return_value.succeeded=True
with patch.object(worker.ctypes,'windll') as win,patch.object(worker,'encode_png',wraps=worker.encode_png) as encode:
    win.user32.IsIconic.return_value=False
    raw=service.capture(export=False);assert encode.call_count==0 and 'image' not in raw
    assert not (folder/'latest-game.png').exists() and np.array_equal(service.last,image)
    normal=service.capture();assert encode.call_count==1 and normal['image'].startswith('data:image/png;base64,')
    assert np.array_equal(np.asarray(Image.open(folder/'latest-game.png'))[:,:,::-1],image)

class WaitProbe(Collector):
    def __init__(self):super().__init__({'characters':[]},folder);self.frames=0;self.events=[]
    def guard(self,*_,**__):pass
    def progress(self,*_,**__):pass
    def capture(self,record=True):assert not record;self.frames+=1
    def emit(self,kind,data=None,image=False,**_):self.events.append((kind,image))
probe=WaitProbe();values=iter([True,False,True,True])
with patch('collection_worker.time.sleep'):
    probe.wait(lambda:next(values),'test',initial=0)
assert probe.frames==4 and probe.events==[('frame',True)]
single=WaitProbe()
with patch('collection_worker.time.sleep'):
    single.wait(lambda:True,'popup',initial=0,confirmations=1,record=False)
assert single.frames==1 and single.events==[]
failed=WaitProbe()
try:
    with patch('collection_worker.time.sleep'):
        failed.wait(lambda:False,'never',initial=0,timeout=.01)
    raise AssertionError('Failed predicate must stop')
except PageDeviation:pass
assert not failed.events

# Prefer the previously matched skin, but re-run recognition on each new frame.
recognizer=Mock();recognizer.cache=folder;recognizer.last=image
recognizer.recognize.side_effect=[{'hit':False},{'hit':True},{'hit':True}]
roster=json.loads((project/'src/data/roster.json').read_text('utf-8'))['characters']
character=next(c for c in roster if c['nameCn']=='米哈拉：羁绊锁链')
pages=Pages(recognizer);assert pages.artwork_matches(character)['hit'];pages.reset()
assert pages.artwork_matches(character)['hit'] and recognizer.recognize.call_count==3
assert recognizer.recognize.call_args_list[1].args[1]['template']==recognizer.recognize.call_args_list[2].args[1]['template']

cost=[]
for _ in range(5):
    started=time.perf_counter();worker.encode_png(image);cost.append(time.perf_counter()-started)
result={'passed':True,'gameInputs':0,'rawBgrSkipsPng':True,'ordinaryRpcUnchanged':True,'separateTwoFrameConfirmation':True,'failedPollDoesNotPersistEveryFrame':True,'preferredSkinRechecked':True,'pngEncodeMedianMs':sorted(cost)[2]*1000}
(folder/'latest-game.png').unlink()
(folder/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({**result,'evidence':str(folder)}))
