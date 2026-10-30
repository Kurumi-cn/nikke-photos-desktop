"""Read-only FramePool occlusion check. No input/activation APIs are called."""
import ctypes
import hashlib
import json
import os
import sys
import time
from pathlib import Path
sys.dont_write_bytecode=True
import numpy as np
from worker import Service,ROOT

class Point(ctypes.Structure):
    _fields_=[('x',ctypes.c_long),('y',ctypes.c_long)]
class Rect(ctypes.Structure):
    _fields_=[('left',ctypes.c_long),('top',ctypes.c_long),('right',ctypes.c_long),('bottom',ctypes.c_long)]

user=ctypes.WinDLL('user32',use_last_error=True)
user.GetForegroundWindow.restype=ctypes.c_void_p
user.GetAncestor.argtypes=[ctypes.c_void_p,ctypes.c_uint];user.GetAncestor.restype=ctypes.c_void_p
user.WindowFromPoint.argtypes=[Point];user.WindowFromPoint.restype=ctypes.c_void_p
user.GetWindowThreadProcessId.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)]
user.GetClientRect.argtypes=[ctypes.c_void_p,ctypes.POINTER(Rect)]
user.ClientToScreen.argtypes=[ctypes.c_void_p,ctypes.POINTER(Point)]
user.GetClassNameW.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.c_int]
user.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))

def window_metadata(hwnd):
    pid=ctypes.c_ulong();user.GetWindowThreadProcessId(ctypes.c_void_p(hwnd),ctypes.byref(pid))
    name=ctypes.create_unicode_buffer(256);user.GetClassNameW(ctypes.c_void_p(hwnd),name,256)
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.restype=ctypes.c_void_p
    kernel.QueryFullProcessImageNameW.argtypes=[ctypes.c_void_p,ctypes.c_ulong,ctypes.c_wchar_p,ctypes.POINTER(ctypes.c_ulong)]
    kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    process=kernel.OpenProcess(0x1000,False,pid.value)
    exe=None
    if process:
        try:
            output=ctypes.create_unicode_buffer(32768);length=ctypes.c_ulong(len(output))
            if kernel.QueryFullProcessImageNameW(process,0,output,ctypes.byref(length)):exe=Path(output.value).name
        finally:kernel.CloseHandle(process)
    return {'hwnd':str(hwnd),'pid':pid.value,'className':name.value,'executable':exe}

def coverage(hwnd):
    handle=ctypes.c_void_p(hwnd);rect=Rect();origin=Point()
    if not user.GetClientRect(handle,ctypes.byref(rect)) or not user.ClientToScreen(handle,ctypes.byref(origin)):
        raise RuntimeError('Cannot read target client geometry')
    width,height=rect.right-rect.left,rect.bottom-rect.top
    foreground=int(user.GetForegroundWindow() or 0)
    points=[]
    for x,y in [(0.1,0.1),(0.9,0.1),(0.5,0.5),(0.1,0.9),(0.9,0.9)]:
        point=Point(origin.x+round(width*x),origin.y+round(height*y))
        hit=user.WindowFromPoint(point)
        root=int(user.GetAncestor(ctypes.c_void_p(hit),2) or 0) if hit else 0
        points.append({'screen':[point.x,point.y],'topWindow':window_metadata(root) if root else None,'covered':bool(root and root!=hwnd)})
    return {'foreground':window_metadata(foreground) if foreground else None,'gameForeground':foreground==hwnd,
            'minimized':bool(user.IsIconic(handle)),'visible':bool(user.IsWindowVisible(handle)),
            'clientRect':[origin.x,origin.y,width,height],'samples':points,
            'allSamplePointsCovered':all(p['covered'] for p in points)}

def main():
    cache=(ROOT.parents[2]/'codex temp/nikke-desktop/automation-dev-copy'/('occluded-capture-'+str(int(time.time()*1000)))).resolve()
    cache.mkdir(parents=True,exist_ok=True)
    service=Service(cache/'runtime');report={'cache':str(cache),'gameInputs':0,'frames':[],'passed':False}
    previous=None
    try:
        report['initialization']=service.initialize()
        targets=service.windows()['windows']
        if len(targets)!=1:raise RuntimeError('Require one current Chinese NIKKE window')
        target=targets[0];report['target']=target
        service.connect(target['hwnd'])
        for index in range(6):
            if index:time.sleep(1)
            before=coverage(int(target['hwnd']))
            if before['minimized'] or not before['visible']:raise RuntimeError('Game minimized or hidden; this test excludes minimization')
            capture=service.capture();image=service.last.copy()
            (cache/f'frame-{index+1}.png').write_bytes((cache/'runtime/latest-game.png').read_bytes())
            recognition=service.analyze_image(image)
            after=coverage(int(target['hwnd']))
            changed=None if previous is None else float(np.mean(np.max(np.abs(image.astype(np.int16)-previous.astype(np.int16)),axis=2)>3))
            frame={'index':index+1,'capture':{**capture,'image':None},'coverageBefore':before,'coverageAfter':after,
                   'sha256':hashlib.sha256(image.tobytes()).hexdigest(),'changedPixelRatioFromPrevious':changed,
                   'recognition':recognition}
            report['frames'].append(frame);previous=image
        report['distinctImages']=len({f['sha256'] for f in report['frames']})
        report['changingFramePairs']=sum((f['changedPixelRatioFromPrevious'] or 0)>0 for f in report['frames'])
        report['coverageVerified']=all(not c['gameForeground'] and c['allSamplePointsCovered'] for f in report['frames'] for c in [f['coverageBefore'],f['coverageAfter']])
        report['recognitionPassed']=all(f['recognition']['lobby'] and f['recognition']['nikkeLocated'] for f in report['frames'])
        report['contentChangedDuringOcclusion']=report['distinctImages']>1 and report['changingFramePairs']>0
        report['passed']=report['coverageVerified'] and report['recognitionPassed'] and report['contentChangedDuringOcclusion']
    except Exception as error:report['error']=str(error)
    finally:
        service.close();report['finishedAt']=time.time()
        (cache/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        latest=cache.parent/'latest-occluded-capture.json'
        latest.write_text(json.dumps({'cache':str(cache),'passed':report['passed'],'gameInputs':0}),encoding='utf-8')
        print(json.dumps({k:v for k,v in report.items() if k not in ('frames','initialization')},ensure_ascii=False))
    return 0 if report['passed'] else 1

if __name__=='__main__':sys.exit(main())
