"""Offline CN membership boundary; does not import Maa or connect to the game."""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
project = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project / 'automation/maanikke'))
from collection_roster import load_collection_roster

codes = json.loads((project / 'src/data/cn-roster.json').read_text('utf-8'))['nameCodes']
full = json.loads((project / 'src/data/roster.json').read_text('utf-8'))['characters']
outside = next(c['nameCode'] for c in full if c['nameCode'] not in codes)
assert [c['nameCode'] for c in load_collection_roster(project, codes)] == codes
for invalid in [[], [outside], [codes[0], codes[0]], [None], [123], [{}], codes[0], ['unknown']]:
    try:
        load_collection_roster(project, invalid)
    except RuntimeError:
        pass
    else:
        raise AssertionError('Invalid selection accepted')
print(json.dumps({'passed': True, 'cnCount': len(codes), 'outsideRejected': True, 'gameInputs': 0}))
