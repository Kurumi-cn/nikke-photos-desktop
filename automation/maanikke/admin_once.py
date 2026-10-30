"""UAC-elevated one-shot helper. No arbitrary command/coordinate/task interface."""
import ctypes
import json
import os
import sys
import time
import uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.dont_write_bytecode=True
os.environ['PYTHONDONTWRITEBYTECODE']='1'
os.environ['PYTHONUTF8']='1'
os.environ['PYTHONIOENCODING']='utf-8'
os.environ.pop('PYTHONPATH',None)
os.environ.pop('MAAFW_BINARY_PATH',None)
from worker import Service,ROOT
from enter_policy import validate_pair
from win32_metadata import elevation
from check_occluded_capture import coverage

BASE=(ROOT.parents[2]/'codex temp/nikke-desktop/automation-dev-copy/admin-nikke').resolve()
if len(sys.argv)==4 and sys.argv[2]=='--request-base':
    candidate=Path(sys.argv[3])
    if not candidate.is_absolute() or candidate.name!='admin-nikke':raise RuntimeError('Invalid admin request root')
    BASE=candidate.resolve()

def read_request(file):
    file=Path(file).resolve()
    if file.name!='request.json' or file.parent.parent!=BASE:raise RuntimeError('Unexpected admin request path')
    data=json.loads(file.read_text('utf-8-sig'))
    if str(uuid.UUID(data['runId']))!=file.parent.name or data['action'] not in ('enter-nikke-once','enter-nikke-occluded-once','search-mermaid-once','collect-three-once') or data['version']!=1:
        raise RuntimeError('Invalid admin request')
    if not 0<=time.time()-data['createdAt']<=300:raise RuntimeError('管理员请求已过期')
    return data,file.parent

def owner_alive(pid):
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.restype=ctypes.c_void_p
    kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_ulong]
    handle=kernel.OpenProcess(0x100000,False,int(pid))
    if not handle:return False
    try:return kernel.WaitForSingleObject(handle,0)==258
    finally:kernel.CloseHandle(handle)

def run(file):
    request,folder=read_request(file)
    if request['action'] in ('search-mermaid-once','collect-three-once'):raise RuntimeError('Requires dedicated fixed helper')
    occluded=request['action']=='enter-nikke-occluded-once'
    state={'runId':request['runId'],'inputRequests':0,'passed':False,'stage':'initializing','elevated':elevation(os.getpid()),'pid':os.getpid()}
    def save():
        target=folder/'result.json';temp=folder/'result.next'
        temp.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(target)
    def check_cancel():
        if (folder/'cancel').exists() or not owner_alive(request['ownerPid']):raise RuntimeError('请求已取消或主程序已退出，未继续输入')
        if time.time()-request['createdAt']>300:raise RuntimeError('请求已过期')
    service=None
    save()
    try:
        if state['elevated'] is not True:raise RuntimeError('管理员权限未实际授予，未继续输入')
        if (folder/'attempt.lock').exists():raise RuntimeError('本请求已保留过单次输入额度，禁止重放')
        check_cancel()
        service=Service(folder/'runtime')
        state['runtime']=service.initialize()
        targets=service.windows()['windows']
        target=next((t for t in targets if t['hwnd']==request['target']['hwnd'] and t['pid']==request['target']['pid']),None)
        if target is None:raise RuntimeError('游戏窗口身份已变化，未继续输入')
        if target['elevated']!=state['elevated']:raise RuntimeError('模块与游戏权限不一致，未继续输入')
        state['target']=target
        service.connect(target['hwnd'])
        state['stage']='countdown';save()
        for _ in range(150 if occluded else 80):check_cancel();time.sleep(.1)
        def covered():
            info=coverage(int(target['hwnd']))
            state['lastOcclusionPreflight']=info;save()
            front=info['foreground']
            if info['minimized'] or not info['visible']:
                raise RuntimeError('游戏最小化或隐藏，未发送点击')
            if not front:
                raise RuntimeError('无法确定当前前台窗口，未发送点击')
            return info
        cover_first=covered() if occluded else None
        first=service.analyze();check_cancel();time.sleep(.3)
        second=service.analyze();check_cancel()
        cover_second=covered() if occluded else None
        if occluded and cover_first['foreground']!=cover_second['foreground']:
            raise RuntimeError('两帧间遮挡窗口变化，未发送点击')
        point=validate_pair(first,second)
        # Standard foreground/visibility checks; no focus-lock workaround or privileged driver.
        user32=ctypes.windll.user32
        user32.GetForegroundWindow.restype=ctypes.c_void_p
        user32.WindowFromPoint.restype=ctypes.c_void_p
        user32.GetAncestor.restype=ctypes.c_void_p
        hwnd=ctypes.c_void_p(int(target['hwnd']))
        class Rect(ctypes.Structure):_fields_=[('left',ctypes.c_long),('top',ctypes.c_long),('right',ctypes.c_long),('bottom',ctypes.c_long)]
        client=Rect()
        if not user32.GetClientRect(hwnd,ctypes.byref(client)) or [client.right-client.left,client.bottom-client.top]!=second['originalSize']:
            raise RuntimeError('当前客户区与原图尺寸不一致，未发送点击')
        if not occluded and int(user32.GetForegroundWindow() or 0)!=int(target['hwnd']):raise RuntimeError('游戏不在前台，未发送点击；请切回游戏后手动重新触发')
        class Point(ctypes.Structure):_fields_=[('x',ctypes.c_long),('y',ctypes.c_long)]
        screen=Point(*point)
        if not user32.ClientToScreen(hwnd,ctypes.byref(screen)):raise RuntimeError('坐标转换失败')
        owner=user32.GetAncestor(ctypes.c_void_p(user32.WindowFromPoint(screen)),2)
        if not occluded and int(owner or 0)!=int(target['hwnd']):raise RuntimeError('目标位置被其他窗口遮挡，未发送点击')
        if occluded:
            current_cover=covered()
            if current_cover['foreground']!=cover_second['foreground'] or not owner:
                raise RuntimeError('前台窗口变化或点击位置窗口无效，未发送点击')
            state['occlusionBefore']=current_cover
            state['clickPointTopWindow']=str(int(owner))
            state['clickPointCovered']=int(owner)!=int(target['hwnd'])
            state['mode']='occluded-single-test'
        # Identity and cancellation are rechecked immediately before persistent reservation.
        if target not in service.windows()['windows']:raise RuntimeError('游戏窗口身份已变化')
        check_cancel()
        state['before']={**second,'capture':{**second['capture'],'image':None}}
        (folder/'before.png').write_bytes((folder/'runtime/latest-game.png').read_bytes())
        state['point']=list(point)
        state['stage']='request-reserved';state['inputRequests']=1
        with (folder/'attempt.lock').open('x',encoding='utf-8') as lock:
            lock.write(json.dumps({'runId':request['runId'],'target':target,'point':point,'reservedAt':time.time()}));lock.flush();os.fsync(lock.fileno())
        save()
        check_cancel()
        job=service.controller.post_click(*point).wait()  # Exactly one upstream SendMessageWithCursorPos request.
        state['apiSucceeded']=job.succeeded;state['stage']='verifying';save()
        frames=[];consecutive=0
        state['observationPolicy']={'initialDelaySeconds':3,'intervalSeconds':1.5,'maxCaptures':6,'requiredConsecutiveMatches':2}
        time.sleep(3)
        for index in range(6):
            if index:time.sleep(1.5)
            check_cancel()
            result=service.analyze()
            if occluded:
                info=coverage(int(target['hwnd']))
                state.setdefault('occlusionAfter',[]).append(info)
            (folder/f'after-{index+1}.png').write_bytes((folder/'runtime/latest-game.png').read_bytes())
            frames.append({**result,'capture':{**result['capture'],'image':None}})
            consecutive=consecutive+1 if result['listPage']['verified'] else 0
            state['after']=frames;state['consecutiveMatches']=consecutive;save()
            if consecutive>=2:break
        state['after']=frames
        state['passed']=bool(job.succeeded and consecutive>=2)
        if occluded:
            state['foregroundHeld']=all(c['foreground']==state['occlusionBefore']['foreground'] for c in state.get('occlusionAfter',[]))
            state['coverageHeld']=all(c['allSamplePointsCovered'] for c in state.get('occlusionAfter',[]))
            state['passed']=state['passed'] and state['foregroundHeld']
        state['stage']='completed';state['note']='已进入并保持妮姬列表' if state['passed'] else '单次请求结束，但列表页验证未通过；没有重试'
    except Exception as error:
        state['stage']='failed';state['error']=str(error)
    finally:
        if service:service.close()
        state['finishedAt']=time.time();save()
    return state

if __name__=='__main__':run(sys.argv[1])
