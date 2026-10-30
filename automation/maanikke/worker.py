"""Bounded JSON-lines service. Game operations are discovery/capture/recognition only."""
import base64
import ctypes
import dataclasses
import hashlib
import importlib.metadata
import io
import json
import os
import re
import subprocess
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
EXPECTED = '5.12.2'
BASE_NAMES={'PhotosLobbyText','PhotosLobbyAlliance','PhotosLobbyTasks','PhotosNikkeTemplate','PhotosNikkeText'}
LIST_NAMES={'PhotosListTitle','PhotosListSort','PhotosListHeader','PhotosListToolbar','PhotosListSearch',
            'PhotosListBurstI','PhotosListBurstII','PhotosListBurstIII','PhotosListFavorite','PhotosListCircle'}

def require_versions():
    for line in (ROOT / 'requirements.txt').read_text().splitlines():
        name, version = line.split('==')
        if importlib.metadata.version(name) != version:
            raise RuntimeError(f'{name} must be exactly {version}')

def safe_nodes():
    files={p.relative_to(ROOT/'resource/pipeline').as_posix() for p in (ROOT/'resource/pipeline').rglob('*') if p.suffix.lower() in ('.json','.jsonc')}
    if files!={'photos.json'}: raise RuntimeError('Unexpected pipeline files; daily tasks must not be loaded')
    nodes = json.loads((ROOT / 'resource/pipeline/photos.json').read_text('utf-8'))
    validate_nodes(nodes)
    return nodes

def validate_nodes(nodes):
    if set(nodes) != BASE_NAMES|LIST_NAMES:
        raise RuntimeError('Unexpected recognition node set')
    for node in nodes.values():
        if node.get('action') != {'type':'DoNothing'} or node.get('next') != [] or set(node) != {'recognition','action','next'}:
            raise RuntimeError('Recognition-only resource policy violation')
        if node['recognition']['type'] not in ('OCR','TemplateMatch'):
            raise RuntimeError('Unapproved recognition type')

def encode_png(bgr, *, compress_level=6):
    from PIL import Image
    output = io.BytesIO()
    Image.fromarray(bgr[:,:,::-1]).save(output,format='PNG',compress_level=compress_level)
    return output.getvalue()

class Service:
    def __init__(self, cache):
        self.cache = Path(cache).resolve()
        self.cache.mkdir(parents=True,exist_ok=True)
        self.agent = self.client = self.resource = self.tasker = self.controller = None
        self.agent_log = None
        self.connection = None
        self.last = None
        self.nodes = safe_nodes()

    def initialize(self):
        if getattr(self,'info',None):
            return self.info
        if self.resource is not None:
            self.close()
        require_versions()
        # Do not inherit a different installation's native-library selection.
        os.environ.pop('MAAFW_BINARY_PATH',None)
        from maa.library import Library
        from maa.resource import Resource
        from maa.tasker import Tasker
        from offline_controller import OfflineController
        from maa.agent_client import AgentClient
        from PIL import Image
        import maa
        native = Library.version()
        if native.lstrip('v') != EXPECTED:
            raise RuntimeError(f'Native/binding mismatch: {native} vs {EXPECTED}')
        Tasker.set_log_dir(self.cache / 'native-logs')
        Tasker.set_stdout_level(0)
        resource = Resource()
        if not resource.post_bundle(ROOT / 'resource').wait().succeeded:
            raise RuntimeError('MaaNikke resource initialization failed')
        self.resource = resource
        client = AgentClient()
        self.client = client
        client.set_timeout(10000)
        if not client.bind(resource):
            raise RuntimeError('Cannot bind AgentClient resource')
        self.agent_log = open(self.cache / 'agent.log','ab',buffering=0)
        self.agent = subprocess.Popen([sys.executable,'-u',str(ROOT / 'agent/server.py'),client.identifier],
            cwd=ROOT,env={**os.environ,'PHOTOS_AGENT_ERROR':str(self.cache/'agent-error.json')},
            stdout=self.agent_log,stderr=self.agent_log,creationflags=subprocess.CREATE_NO_WINDOW)
        if not client.connect():
            raise RuntimeError('MaaNikke Python Agent handshake failed; see agent.log')
        blank = self.cache / 'blank.png'
        Image.new('RGB',(1280,720)).save(blank)
        self.controller = OfflineController()
        if not self.controller.post_connection().wait().succeeded:
            raise RuntimeError('Offline recognition controller failed')
        self.tasker = Tasker()
        if not self.tasker.bind(resource,self.controller) or not self.tasker.inited:
            raise RuntimeError('Tasker initialization failed')
        import numpy as np
        health = self.recognize('Custom',{'custom_recognition':'PhotosAgentHealth'},np.zeros((720,1280,3),np.uint8))
        if not health['hit']:
            raise RuntimeError('Agent IPC health recognition failed')
        binaries = {f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (Path(maa.__file__).parent/'bin').glob('Maa*.dll')}
        self.info = {'initialized':True,'binding':EXPECTED,'native':native,'agentConnected':client.connected,
                     'agentHealth':health,'controller':self.controller_settings(),'gameInputEnabled':False,
                     'upstream':json.loads((ROOT/'provenance.json').read_text('utf-8'))['commit'],
                     'resourceNodes':list(self.nodes),'nativeHashes':binaries,'mode':'MaaNikke / Python Agent',
                     'workerElevated':__import__('win32_metadata').elevation(os.getpid())}
        return self.info

    def controller_settings(self):
        interface = json.loads((ROOT/'vendor/interface.json').read_text('utf-8'))
        return interface['controller'][0]['win32']

    def recognize(self, kind, params, image):
        from maa.pipeline import JOCR,JTemplateMatch,JCustomRecognition,JFeatureMatch
        types = {'OCR':JOCR,'TemplateMatch':JTemplateMatch,'Custom':JCustomRecognition,'FeatureMatch':JFeatureMatch}
        param = types[kind](**params)
        agent_error=self.cache/'agent-error.json'
        if kind=='Custom' and agent_error.exists(): agent_error.unlink()
        job = self.tasker.post_recognition(kind,param,image).wait()
        if kind=='Custom' and agent_error.exists():
            raise RuntimeError('Agent recognition failed: '+json.loads(agent_error.read_text('utf-8'))['error'])
        detail = job.get()
        reco = next((n.recognition for n in detail.nodes if n.recognition is not None),None) if detail else None
        valid = bool(reco and reco.hit and reco.box and reco.box.w>0 and reco.box.h>0)
        return {'hit':valid,'box':list(reco.box) if valid else None,
                'detail':reco.raw_detail if reco else None,'jobSucceeded':job.succeeded}

    def windows(self):
        self.initialize()
        from maa.toolkit import Toolkit
        config = self.controller_settings()
        matches=[]
        for w in Toolkit.find_desktop_windows():
            if re.fullmatch(config['class_regex'],w.class_name) and re.search(config['window_regex'],w.window_name):
                hwnd = int(w.hwnd)
                pid = ctypes.c_ulong()
                ctypes.windll.user32.GetWindowThreadProcessId(ctypes.c_void_p(hwnd),ctypes.byref(pid))
                matches.append({'hwnd':str(hwnd),'pid':pid.value,'title':w.window_name,'className':w.class_name,
                                'elevated':__import__('win32_metadata').elevation(pid.value)})
        return {'windows':matches,'count':len(matches),'connection':self.connection}

    def connect(self, hwnd):
        windows = self.windows()['windows']
        target = next((w for w in windows if w['hwnd']==str(hwnd)),None)
        if target is None:
            raise RuntimeError('目标不是当前检测到的国服游戏窗口，请重新检测')
        from maa.controller import Win32Controller
        from maa.define import MaaWin32ScreencapMethodEnum as S,MaaWin32InputMethodEnum as I
        config = self.controller_settings()
        # These settings exactly follow the pinned interface, but no input API is exposed for game targets.
        controller = Win32Controller(int(hwnd),getattr(S,config['screencap']),getattr(I,config['mouse']),getattr(I,config['keyboard']))
        controller.set_screenshot_use_raw_size(True)
        if not controller.post_connection().wait().succeeded:
            raise RuntimeError('国服窗口连接失败；请查看原生日志，检查游戏状态及权限')
        self.tasker.bind(self.resource,controller)
        self.controller = controller
        self.connection = target
        self.last = None
        return {'connected':True,'target':target,'settings':config,'gameInputEnabled':False}

    def capture(self, *, export=True):
        if not self.connection:
            raise RuntimeError('请先连接国服游戏窗口')
        current = self.windows()['windows']
        if self.connection not in current:
            self.connection = None
            self.last = None
            raise RuntimeError('窗口身份已改变，请重新连接')
        user32 = ctypes.windll.user32
        if user32.IsIconic(ctypes.c_void_p(int(self.connection['hwnd']))):
            raise RuntimeError('游戏已最小化，请手动恢复后重试')
        if not self.controller.post_screencap().wait().succeeded:
            raise RuntimeError('FramePool截图失败')
        image = self.controller.cached_image
        import numpy as np
        if image is None or image.ndim!=3 or image.shape[2]!=3 or image.dtype!=np.uint8:
            raise RuntimeError('截图必须是三通道uint8 BGR')
        if float(image.std())<1:
            raise RuntimeError('截图接近全黑；可能仍在加载，请进入大厅后重新截图')
        self.last = image.copy()
        # Internal collection polls consume BGR directly. The normal RPC keeps
        # its original PNG/base64 contract and screenshot behavior by default.
        if not export:
            return {'width':image.shape[1],'height':image.shape[0],'capturedAt':time.time(),'target':self.connection}
        png = encode_png(image)
        (self.cache/'latest-game.png').write_bytes(png)
        return {'image':'data:image/png;base64,'+base64.b64encode(png).decode(),'width':image.shape[1],
                'height':image.shape[0],'capturedAt':time.time(),'target':self.connection}

    def analyze_image(self, image):
        from PIL import Image
        import numpy as np
        h,w = image.shape[:2]
        if abs(w/h-16/9)>0.02:
            raise RuntimeError('首阶段仅支持16:9画面；不对其他比例猜测坐标')
        normalized = np.ascontiguousarray(np.array(Image.fromarray(image[:,:,::-1]).resize((1280,720),Image.Resampling.LANCZOS))[:,:,::-1])
        results={}
        for name,node in self.nodes.items():
            rec=node['recognition']
            results[name]=self.recognize(rec['type'],rec['param'],normalized)
            if results[name]['box']:
                results[name]['originalBox']=[round(n*(w/1280 if i%2==0 else h/720),2) for i,n in enumerate(results[name]['box'])]
        lobby = results['PhotosLobbyText']['hit'] or (results['PhotosLobbyAlliance']['hit'] and results['PhotosLobbyTasks']['hit'])
        target = results['PhotosNikkeText'] if results['PhotosNikkeText']['hit'] else results['PhotosNikkeTemplate']
        # A separate IPC call exercises the reused custom recognition on the same frame.
        agent = self.recognize('Custom',{'custom_recognition':'RotatedOCR','roi':[452,625,86,87],
            'custom_recognition_param':{'expected':'妮姬','angle_range':0,'scale_factor':2}},normalized)
        list_page=self.list_summary(results)
        return {'lobby':bool(lobby and not list_page['verified']),'nikkeLocated':bool(target['hit']),'nikkeBox':target.get('originalBox'),
                'results':results,'agentRotatedOCR':agent,'originalSize':[w,h],'recognitionSize':[1280,720],
                'listPage':list_page,'gameInputs':0,'analyzedAt':time.time()}

    @staticmethod
    def list_summary(results):
        title=results['PhotosListTitle']['hit']
        header=results['PhotosListHeader']['hit']
        toolbar=results['PhotosListToolbar']['hit']
        search=results['PhotosListSearch']['hit']
        sort=results['PhotosListSort']['hit']
        return {'verified':bool(title and header and toolbar and (search or sort)),
                'title':title,'header':header,'toolbar':toolbar,'search':search,'sort':sort,
                'controls':{name:results['PhotosList'+name]['hit'] for name in ['Search','BurstI','BurstII','BurstIII','Favorite','Circle','Sort']}}

    def analyze(self):
        capture=self.capture()  # Recognition always uses a fresh frame, never a previous token/session.
        result=self.analyze_image(self.last)
        result['capture']=capture
        (self.cache/'latest-recognition.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        return result

    def input_test(self):
        # New, owned process/window for every test. Never accepts caller-supplied HWND/coordinates.
        self.initialize()
        from input_test import run_test
        return run_test(self.cache / 'input-test')

    def close(self):
        self.info = None
        self.connection = None
        self.last = None
        if self.client:
            self.client.disconnect()
        if self.agent:
            try: self.agent.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.agent.kill(); self.agent.wait(timeout=3)
        self.tasker = None
        self.controller = None
        self.resource = None
        self.client = None
        if self.agent_log: self.agent_log.close()

def main():
    service=Service(sys.argv[1])
    try:
        for line in sys.stdin:
            request={}
            try:
                request=json.loads(line)
                command=request.get('command')
                args=request.get('args',{})
                operations={'initialize':service.initialize,'windows':service.windows,'connect':lambda:service.connect(args.get('hwnd')),
                            'capture':service.capture,'analyze':service.analyze,'inputTest':service.input_test}
                if command not in operations: raise ValueError('Unsupported command')
                result=operations[command]()
                response={'id':request['id'],'ok':True,'result':result}
            except Exception as error:
                traceback.print_exc(file=sys.stderr)
                response={'id':request.get('id'),'ok':False,'error':str(error)}
            print('@@PHOTOS@@'+json.dumps(response,ensure_ascii=False),flush=True)
    finally:
        service.close()

if __name__=='__main__': main()
