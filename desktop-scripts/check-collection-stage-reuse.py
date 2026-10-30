"""Expected-state ROI checks and bounded frame reuse; no game or native calls."""
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project / 'automation/maanikke'))
from collection_worker import Collector, Pages, PageDeviation

class Recognizer:
    def __init__(self): self.last = None; self.calls = []; self.popup = False
    def recognize(self, kind, params, image):
        self.calls.append((kind, params))
        hit = self.popup if kind == 'TemplateMatch' else params['expected'][0] in ['^妮姬$', '战斗力']
        return {'hit': hit}

service = Recognizer(); pages = Pages(service)
assert pages.is_page('list')
assert len(service.calls) == 3  # close anchor + two list-specific OCR regions
assert all(call[1].get('expected') != ['详细信息'] for call in service.calls)
assert pages.is_page('list') and len(service.calls) == 3
pages.reset(); assert pages.is_page('list') and len(service.calls) == 6
pages.reset(); service.popup = True
before = len(service.calls)
assert not pages.is_page('list') and len(service.calls) == before + 1
pages.cache['page'] = 'detail'
assert not pages.is_page('list') and len(service.calls) == before + 1

class Job:
    succeeded = True
    def wait(self): return self

class ReuseProbe(Collector):
    def __init__(self):
        super().__init__({'characters': [{}]}, project)
        self.clock = 100.; self.frame_captured_at = self.clock; self.frames = 0; self.clicks = []
        self.actual_page = 'list'
        self.pages = SimpleNamespace(is_page=lambda expected: self.actual_page == expected, page=lambda: self.actual_page)
        self.s = SimpleNamespace(controller=SimpleNamespace(post_click=lambda *p: Job()))
    def capture(self, record=True): self.frames += 1; self.frame_captured_at = self.clock
    def input(self, label, call, click=None):
        self.clicks.append(click); assert call().wait().succeeded

probe = ReuseProbe()
with patch('collection_worker.time.monotonic', lambda: probe.clock):
    probe.click('confirmed target', [100, 200, 60, 40], {'list'}, fresh=False)
    assert probe.frames == 0 and probe.clicks[-1]['reusedFrame']
    probe.clock += 1
    probe.click('expired frame', [100, 200, 60, 40], {'list'}, fresh=False)
    assert probe.frames == 1 and not probe.clicks[-1]['reusedFrame']
    probe.click('explicit fresh', [100, 200, 60, 40], {'list'}, fresh=True)
    assert probe.frames == 2 and not probe.clicks[-1]['reusedFrame']
    probe.actual_page = 'detail'
    try:
        probe.click('wrong state', [100, 200, 60, 40], {'list'}, fresh=False)
    except PageDeviation:
        pass
    else:
        raise AssertionError('Click allowed after page changed')
    assert len(probe.clicks) == 3

report = {'passed': True, 'gameInputs': 0, 'listChecksOnlyRelevantROIs': True, 'sameFrameRecognitionCached': True, 'newFrameInvalidatesRecognition': True, 'popupBlocksListAction': True, 'freshFrameReusedWithoutRecapture': True, 'expiredFrameRecaptured': True, 'wrongStateNeverClicked': True}
cache = project.parent / 'codex temp/nikke-desktop/automation-dev-copy'
(cache / 'stage-reuse-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
