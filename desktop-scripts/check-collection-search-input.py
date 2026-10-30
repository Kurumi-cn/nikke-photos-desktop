"""Search input acknowledgement, no native controller or game connection."""
import io
import json
import re
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project / 'automation/maanikke'))
from collection_worker import Collector, SearchInputUnconfirmed, PageDeviation, Cancelled
from worker import encode_png

base = project.parent / 'codex temp/nikke-desktop/automation-dev-copy'
cache = base / ('search-input-check-' + str(int(time.time() * 1000)))
cache.mkdir()

class Job:
    def __init__(self, success=True): self.succeeded = success
    def wait(self): return self

class SearchPages:
    def __init__(self, owner): self.owner = owner
    def page(self): return self.owner.page
    def is_page(self,expected):return self.owner.page==expected
    def ocr(self, roi, expected='.+'):
        owner = self.owner
        assert roi == [735, 286, 375, 58]
        hit = not owner.query if expected == '搜索妮姬的名字' else bool(re.search(expected, owner.query))
        return {'hit': hit}

class SearchProbe(Collector):
    def __init__(self, mode):
        folder = cache / mode; folder.mkdir()
        super().__init__({'characters': [{}]}, folder)
        self.clock = 0; self.page = 'list'; self.query = ''; self.mode = mode
        self.focuses = 0; self.texts = []; self.polls = 0; self.deliver_next=False
        self.s = SimpleNamespace(controller=SimpleNamespace(post_click=self.focus, post_input_text=self.type))
        self.pages = SearchPages(self)
    def guard(self, *a, **kw):
        if self.mode == 'canceled': raise Cancelled('user stopped')
    def progress(self,phase,**extra):
        super().progress(phase,**extra)
        if phase=='搜索框仍为空，重新聚焦一次' and self.mode=='late-between-attempts':self.deliver_next=True
    def delay(self, seconds): self.clock += seconds
    def capture(self, record=True):
        assert not record
        self.clock += .01; self.polls += 1; self.frame_captured_at=self.clock
        if self.deliver_next:self.query=self.texts[-1];self.deliver_next=False
        if self.mode == 'delayed' and self.texts and self.polls >= 4: self.query = self.texts[-1]
    def focus(self, x, y): self.focuses += 1; return Job()
    def type(self, name):
        self.texts.append(name)
        if self.mode == 'native-failure': return Job(False)
        if self.mode == 'wrong-page': self.page = 'unknown'
        elif self.mode == 'partial': self.query = name[:1]
        elif self.mode == 'duplicated': self.query = name+name
        elif self.mode == 'success' or self.mode == 'first-missed' and len(self.texts) == 2: self.query = name
        return Job()

name = '贝斯蒂：战术升级'
for mode, attempts in [('success', 1), ('first-missed', 2), ('delayed', 1), ('late-between-attempts',1)]:
    probe = SearchProbe(mode)
    with patch('collection_worker.time.monotonic', lambda: probe.clock):
        probe.enter_search_text(name)
    assert probe.query == name and probe.texts == [name] * attempts and probe.focuses == attempts
    assert probe.clock < 5

for mode, attempts in [('always-empty', 2), ('partial', 1), ('duplicated',1), ('wrong-page', 1), ('native-failure', 1), ('canceled', 0)]:
    probe = SearchProbe(mode)
    try:
        with patch('collection_worker.time.monotonic', lambda: probe.clock):
            probe.enter_search_text(name)
    except (SearchInputUnconfirmed, Cancelled, RuntimeError):
        pass
    else:
        raise AssertionError('Unconfirmed input accepted: ' + mode)
    assert len(probe.texts) == attempts, (mode, probe.texts)
    assert probe.clock < 5

existing = SearchProbe('existing'); existing.query = '原文字'
try:
    existing.enter_search_text(name)
except SearchInputUnconfirmed:
    pass
else:
    raise AssertionError('Existing text was overwritten without a clear check')
assert not existing.texts and not existing.focuses
assert not issubclass(SearchInputUnconfirmed, PageDeviation)

# Faster PNG compression must preserve every pixel and leave the default API intact.
fixture = base / 'admin-nikke/aae6f3c9-8a52-4492-91be-0ce5f96faa91/031-equipment-0-头.png'
bgr = np.asarray(Image.open(fixture).convert('RGB'))[:, :, ::-1].copy()
for level in [6, 3]:
    encoded = encode_png(bgr, compress_level=level)
    decoded = np.asarray(Image.open(io.BytesIO(encoded)).convert('RGB'))[:, :, ::-1]
    assert np.array_equal(decoded, bgr)
assert np.array_equal(np.asarray(Image.open(io.BytesIO(encode_png(bgr)))), bgr[:, :, ::-1])

report = {'passed': True, 'gameInputs': 0, 'firstMissRefocusesOnce': True, 'delayedInputDoesNotDuplicate': True, 'partialTextDoesNotAppend': True, 'duplicateTextNeverAccepted': True, 'permanentFailureStopsBounded': True, 'nativeFailureAndCancelStop': True, 'existingTextPreserved': True, 'noWholeRoleRetryOnInputFailure': True, 'pngPixelsIdentical': True}
(cache / 'result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({**report, 'evidence': str(cache)}))
