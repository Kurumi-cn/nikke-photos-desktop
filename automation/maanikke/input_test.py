import ctypes
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path

def run_test(base):
    from maa.controller import Win32Controller
    from maa.define import MaaWin32ScreencapMethodEnum as S,MaaWin32InputMethodEnum as I
    from worker import encode_png
    folder=Path(base)/str(uuid.uuid4()); folder.mkdir(parents=True)
    nonce=uuid.uuid4().hex
    receiver=subprocess.Popen(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('input_receiver.ps1')),'-Folder',str(folder),'-Nonce',nonce],creationflags=subprocess.CREATE_NO_WINDOW)
    controller=None
    try:
        deadline=time.monotonic()+15
        state=None
        while time.monotonic()<deadline:
            if receiver.poll() is not None: raise RuntimeError('测试窗口启动失败')
            try:
                state=json.loads((folder/'state.json').read_text('utf-8'))
                if state.get('hwnd'): break
            except (FileNotFoundError,json.JSONDecodeError): pass
            time.sleep(.1)
        if not state or 'hwnd' not in state: raise RuntimeError('测试窗口就绪超时')
        hwnd=int(state['hwnd']); pid=ctypes.c_ulong()
        user32=ctypes.windll.user32
        user32.GetWindowThreadProcessId(ctypes.c_void_p(hwnd),ctypes.byref(pid))
        title=ctypes.create_unicode_buffer(256); user32.GetWindowTextW(ctypes.c_void_p(hwnd),title,256)
        if pid.value!=receiver.pid or state['pid']!=receiver.pid or state['nonce']!=nonce or title.value!='NIKKE Photos Input Test '+nonce:
            raise RuntimeError(f'测试窗口身份校验失败: expectedPid={receiver.pid}, receiverPid={state["pid"]}, windowPid={pid.value}, title={title.value!r}')
        controller=Win32Controller(hwnd,S.FramePool,I.SendMessageWithCursorPos,I.SendMessageWithCursorPos)
        controller.set_screenshot_use_raw_size(True)
        if not controller.post_connection().wait().succeeded: raise RuntimeError('测试窗口Maa连接失败')
        if controller.post_screencap().wait().succeeded:
            (folder/'before.png').write_bytes(encode_png(controller.cached_image))
        # One call only; no retries, never a game HWND.
        job=controller.post_click(*state['point']).wait()
        time.sleep(.5)
        received=json.loads((folder/'state.json').read_text('utf-8'))
        if controller.post_screencap().wait().succeeded:
            (folder/'after.png').write_bytes(encode_png(controller.cached_image))
        passed=job.succeeded and all(received.get(k)==1 for k in ('down','up','activated'))
        result={'passed':passed,'apiSucceeded':job.succeeded,'mode':'SendMessageWithCursorPos','screencap':'FramePool',
                'received':received,'attempts':1,'gameInputs':0,'evidence':str(folder)}
        (folder/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        return result
    finally:
        controller=None
        (folder/'stop').touch()
        try: receiver.wait(timeout=3)
        except subprocess.TimeoutExpired:
            receiver.kill(); receiver.wait(timeout=3)
