"""Native regression tests on positive/negative frames; never connects a game."""
import ast
import copy
import hashlib
import json
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from worker import Service,ROOT,safe_nodes,validate_nodes

cache=Path(sys.argv[1]);cache.mkdir(parents=True,exist_ok=True)
report={}
service=Service(cache)
try:
    nodes=safe_nodes()
    for change in ({'action':{'type':'Click'}},{'next':['daily']},{'on_error':['daily']},{'recognition':{'type':'Custom','param':{}}}):
        bad=copy.deepcopy(nodes);bad['PhotosNikkeText'].update(change)
        try: validate_nodes(bad)
        except RuntimeError: pass
        else: raise AssertionError('Unsafe node accepted')
    report['pipelinePolicy']=True
    prov=json.loads((ROOT/'provenance.json').read_text('utf-8'))
    for f in prov['files']:
        if 'sha256' in f: assert hashlib.sha256((ROOT/f['destination']).read_bytes()).hexdigest()==f['sha256'],f['destination']
    report['provenanceHashes']=True
    # Prevent another incomplete extraction (class references helper functions).
    tree=ast.parse((ROOT/'agent/rotated_ocr.py').read_text('utf-8'))
    functions={n.name for n in tree.body if isinstance(n,ast.FunctionDef)}
    assert {'_rotate_image','_enhance_image','_map_to_original'}<=functions
    report['agentDependencies']=True
    service.initialize()
    negative=service.analyze_image(np.zeros((1080,1920,3),dtype=np.uint8))
    assert not negative['lobby'] and not negative['nikkeLocated'] and not negative['agentRotatedOCR']['hit']
    assert not negative['listPage']['verified']
    report['blankNegative']=negative
    try: service.analyze_image(np.zeros((600,800,3),dtype=np.uint8))
    except RuntimeError as error: assert '16:9' in str(error)
    else: raise AssertionError('Unsupported geometry accepted')
    report['unsupportedAspectRejected']=True
    # Fresh captured lobby fixture; images remain in cache, no profile data is imported.
    if len(sys.argv)>2:
        frame=np.ascontiguousarray(np.array(Image.open(sys.argv[2]).convert('RGB'))[:,:,::-1])
        positive=service.analyze_image(frame)
        assert positive['lobby'] and positive['nikkeLocated'] and positive['agentRotatedOCR']['hit']
        assert not positive['listPage']['verified']
        x,y,w,h=positive['nikkeBox'];assert 0<=x<x+w<=frame.shape[1] and 0<=y<y+h<=frame.shape[0]
        report['capturedLobbyPositive']=positive
    if len(sys.argv)>3:
        frame=np.ascontiguousarray(np.array(Image.open(sys.argv[3]).convert('RGB'))[:,:,::-1])
        listing=service.analyze_image(frame)
        assert listing['listPage']['verified'] and not listing['lobby']
        report['suppliedListReference']=listing
        from enter_policy import choose_point,validate_pair
        try:choose_point(listing)
        except RuntimeError:pass
        else:raise AssertionError('Existing list page allowed a redundant click')
        assert validate_pair(positive,positive)==choose_point(positive)
        shifted=copy.deepcopy(positive);shifted['nikkeBox'][0]+=40
        try:validate_pair(positive,shifted)
        except RuntimeError:pass
        else:raise AssertionError('Unstable click position accepted')
        report['singleClickPreflightPolicy']=True
    report['passed']=True
finally:
    service.close()
    (cache/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if isinstance(v,bool)},ensure_ascii=False))
