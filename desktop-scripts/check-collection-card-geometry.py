"""Saved frames and in-memory adversarial variants; no native game connection."""
import json
import random
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project / 'automation/maanikke'))
from collection_vision import candidates, choose_candidate, safe_point, popup_outside_box
from collection_worker import Collector, PageDeviation, PopupDismissalUnconfirmed

base = project.parent / 'codex temp/nikke-desktop'
fixtures = base / 'automation-dev-copy/collection-regression-fixtures'
fixtures.mkdir(exist_ok=True)
for name, original in [('brid-results.png', '4a5070a6-a022-4dbc-82b9-8e0d02c04a11.png'), ('brid-results-second.png', 'e8f93661-700b-42d9-8dba-43791aa39f18.png')]:
    if not (fixtures / name).exists():
        shutil.copyfile(base / 'maanikke-screenshots' / original, fixtures / name)

load = lambda name: np.asarray(Image.open(fixtures / name).convert('RGB'))[:, :, ::-1].copy()
roster = {c['nameCode']: c for c in json.loads((project / 'src/data/roster.json').read_text('utf-8'))['characters']}
brid = load('brid-results.png')
for name in ['brid-results.png', 'brid-results-second.png']:
    found = candidates(load(name))
    assert len(found) == 1 and found[0]['box'] == [80, 389, 128, 218], (name, found)
    assert choose_candidate(found, roster['5160'])[0]['box'] == [80, 389, 128, 218]

variants = []
gray = np.repeat(brid.mean(axis=2, keepdims=True), 3, axis=2).astype(np.uint8)
variants.extend([gray, np.clip(gray * .94, 0, 255).astype(np.uint8), np.clip(gray * 1.05, 0, 255).astype(np.uint8)])
# Replace only the portrait interior; frame and layout remain real pixels.
for value in [30, 90, 160, 225, 255]:
    white_portrait = brid.copy()
    white_portrait[409:589, 89:199] = value
    variants.append(white_portrait)
for variant in variants:
    assert candidates(variant, details=False) == [{'box': [80, 389, 128, 218]}]

# No color-only or texture-only patch may impersonate a continuous card frame.
for value in [40, 128, 225, 250, 255]:
    blank = np.full_like(brid, value)
    assert not candidates(blank, details=False)
noise = np.random.default_rng(73).integers(0, 256, brid.shape, dtype=np.uint8)
assert not candidates(noise, details=False)
no_frame = np.full_like(brid, 250)
no_frame[429:569, 100:190] = noise[429:569, 100:190]
assert not candidates(no_frame, details=False)
assert not candidates(brid[:900], details=False)

# The old real two-character regression must remain two candidates.
scarlet = load('scarlet-results.png')
found = candidates(scarlet)
assert len(found) == 2
assert choose_candidate(found, next(c for c in roster.values() if c['nameCn']=='红莲'))[0]['box']  # identity-specific regression is also in transition test

rng = random.Random(5160)
points = {safe_point([100, 200, 120, 80], rng) for _ in range(500)}
assert len(points) > 100
assert all(130 <= x <= 190 and 220 <= y <= 260 for x, y in points)
for invalid in [[-1, 0, 20, 20], [1910, 0, 20, 20], [0, 1070, 20, 20], [0, 0, 1, 20], [float('nan'), 0, 20, 20]]:
    try:
        safe_point(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid click target accepted')

class Job:
    succeeded = True
    def wait(self): return self

class FixedRandom:
    def __init__(self, outside): self.outside = outside
    def choice(self, _): return self.outside
    def uniform(self, lo, hi): return (lo + hi) / 2

class CloseProbe(Collector):
    def __init__(self, outside, stuck=False, anchor=None):
        folder = fixtures / ('close-outside' if outside else 'close-x')
        folder.mkdir(exist_ok=True)
        super().__init__({'characters': [{}]}, folder)
        self.stuck = stuck; self.clicks = []
        self.s = SimpleNamespace(page='overload', controller=SimpleNamespace(post_click=self.send))
        self.pages = SimpleNamespace(page=lambda: self.s.page, match=lambda *a: {'hit': True, 'box': anchor or [1159, 78, 30, 30]})
    def guard(self, *a, **kw): pass
    def capture(self, *a, **kw): pass
    def send(self, x, y):
        self.clicks.append((x, y))
        if not self.stuck: self.s.page = 'detail'
        return Job()
    def wait(self, predicate, *a, **kw):
        if not predicate(): raise PageDeviation('stuck popup')

for outside in [False, True]:
    probe = CloseProbe(outside)
    with patch('collection_worker.random.SystemRandom', lambda: FixedRandom(outside)):
        probe.close_popup(from_snapshot=True)
    assert len(probe.clicks) == 1 and probe.s.page == 'detail'
    x, y = probe.clicks[0]
    assert (1260 <= x <= 1470 and 250 <= y <= 750) if outside else (1159 <= x <= 1189 and 78 <= y <= 108)
    stopped = CloseProbe(outside, stuck=True)
    try:
        with patch('collection_worker.random.SystemRandom', lambda: FixedRandom(outside)):
            stopped.close_popup(from_snapshot=True)
    except PopupDismissalUnconfirmed:
        pass
    else:
        raise AssertionError('Unconfirmed dismissal did not stop')
    assert len(stopped.clicks) == 1
assert popup_outside_box([900, 78, 30, 30]) is None

report = {'passed': True, 'gameInputs': 0, 'twoActualBridFrames': True, 'grayAndBlankPortraitVariants': len(variants), 'blankAndNoiseRejected': True, 'colorIndependentCardFrame': True, 'randomPointsBounded': True, 'xAndOutsideDismissal': True, 'unconfirmedDismissalStopsWithoutRetry': True}
(fixtures / 'geometry-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
