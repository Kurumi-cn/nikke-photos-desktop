"""Import a small, provenance-tracked subset from the pinned research checkout."""
import ast
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

COMMIT = 'eab10c90ba1f3502bf9576a6669d0f83e27bbc1e'
ROOT = Path(__file__).resolve().parent

def prepare(source):
    actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
    if actual!=COMMIT: raise RuntimeError('Research checkout is not the pinned commit: '+actual)
    if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=source,text=True).strip():
        raise RuntimeError('Research checkout has tracked modifications')
    vendor = ROOT / 'vendor'
    resource = ROOT / 'resource'
    copied = []
    def copy(relative, target):
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, target)
        copied.append({'source': relative, 'destination': str(target.relative_to(ROOT)).replace('\\', '/'),
                       'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    for name in ['LICENSE', 'README.md', 'DEVELOPMENT.md', 'interface.json']:
        copy(name, vendor / name)
    for name in ['startgame', 'inquiryandgift']:
        copy(f'resource/base/pipeline/task/{name}.json', vendor / 'pipeline' / f'{name}.json')
    # Import recognition definitions only: no upstream action/next/on_error/defaults.
    start = json.loads((vendor / 'pipeline/startgame.json').read_text('utf-8'))
    inquiry = json.loads((vendor / 'pipeline/inquiryandgift.json').read_text('utf-8'))
    definitions = {
        'PhotosLobbyText': start['homepagesign']['recognition'],
        'PhotosLobbyAlliance': {'type':'TemplateMatch','param':{'template':['lianmeng.png'],'threshold':[0.8]}},
        'PhotosLobbyTasks': {'type':'TemplateMatch','param':{'template':['dailyrewards/task.png'],'threshold':[0.8]}},
        'PhotosNikkeTemplate': inquiry['intonikkes']['recognition'],
        'PhotosNikkeText': inquiry['intonikkes2']['recognition'],
    }
    nodes = {key:{'recognition':value,'action':{'type':'DoNothing'},'next':[]} for key,value in definitions.items()}
    local=ROOT/'list-definitions.json'
    if local.exists():
        for key,value in json.loads(local.read_text('utf-8')).items():
            nodes[key]={'recognition':value,'action':{'type':'DoNothing'},'next':[]}
    (resource / 'pipeline').mkdir(parents=True, exist_ok=True)
    (resource / 'pipeline/photos.json').write_text(json.dumps(nodes,ensure_ascii=False,indent=2)+'\n','utf-8')
    for name in ['lianmeng.png','dailyrewards/task.png','inquiryandgift/intonikkes.png']:
        copy(f'resource/base/image/{name}', resource / 'image' / name)
    for file in (source / 'resource/base/model').rglob('*'):
        if file.is_file():
            copy(file.relative_to(source).as_posix(), resource / 'model' / file.relative_to(source / 'resource/base/model'))
    copy('agent/utils/params.py', ROOT / 'agent/utils/params.py')
    # Reuse only RotatedOCR. Daily actions/database recognitions are not registered.
    relative = 'agent/custom/reco/my_reco.py'
    text = (source / relative).read_text('utf-8')
    cls = next(n for n in ast.parse(text).body if isinstance(n,ast.ClassDef) and n.name=='RotatedOCR')
    body = '\n'.join(text.splitlines()[min(n.lineno for n in cls.decorator_list)-2:cls.end_lineno])
    helpers = [n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef) and n.name in ('_rotate_image','_enhance_image','_map_to_original')]
    body += '\n\n' + '\n\n'.join(ast.get_source_segment(text,n) for n in helpers)
    prefix = ('# Derived from MaaNikke '+COMMIT+'; GPL-3.0; see vendor/LICENSE.\n'
              'from maa.agent.agent_server import AgentServer\nfrom maa.context import Context\n'
              'from maa.custom_recognition import CustomRecognition\nfrom utils.params import parse_params\n'
              'import numpy as np\nimport math\nimport time\nfrom PIL import Image as _PILImage\n\n')
    (ROOT / 'agent/rotated_ocr.py').write_text(prefix+body+'\n','utf-8')
    copied.append({'source':relative,'destination':'agent/rotated_ocr.py','transformation':'Extract RotatedOCR class and required imports; no algorithm change',
                   'sourceSha256':hashlib.sha256(text.encode()).hexdigest()})
    (ROOT / 'provenance.json').write_text(json.dumps({'repository':'https://github.com/Shinarin/MaaNikke','commit':COMMIT,'license':'GPL-3.0','files':copied},ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps({'commit':COMMIT,'copied':len(copied),'nodes':list(nodes)}))

if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve())
