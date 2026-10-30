"""One directed click between two owned receivers; never selects a game HWND."""
import ctypes
import json
import subprocess
import sys
import time
import uuid
from pathlib import Path
sys.dont_write_bytecode = True
from worker import Service, ROOT
from check_occluded_capture import user, coverage, Point


def main():
    cache = ROOT.parents[2] / 'codex temp/nikke-desktop/automation-dev-copy' / ('occluded-input-' + str(int(time.time()*1000)))
    cache.mkdir(parents=True)
    service = Service(cache / 'runtime')
    children = []
    controller = None
    report = {'passed': False, 'gameInputs': 0, 'attempts': 0, 'cache': str(cache)}

    def start(role):
        folder = cache / role
        folder.mkdir()
        nonce = uuid.uuid4().hex
        process = subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT/'input_receiver.ps1'), '-Folder', str(folder), '-Nonce', nonce], creationflags=subprocess.CREATE_NO_WINDOW)
        children.append((process, folder))
        deadline = time.monotonic()+15
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('Owned receiver exited: '+role)
            try:
                state = json.loads((folder/'state.json').read_text('utf-8'))
                hwnd = int(state['hwnd'])
                pid = ctypes.c_ulong()
                user.GetWindowThreadProcessId(ctypes.c_void_p(hwnd), ctypes.byref(pid))
                title = ctypes.create_unicode_buffer(256)
                user.GetWindowTextW(ctypes.c_void_p(hwnd), title, 256)
                if pid.value != process.pid or state['pid'] != process.pid or state['nonce'] != nonce or title.value != 'NIKKE Photos Input Test '+nonce:
                    raise RuntimeError('Owned receiver identity mismatch')
                return folder, hwnd, state
            except (FileNotFoundError, json.JSONDecodeError):
                time.sleep(.1)
        raise RuntimeError('Owned receiver ready timeout')

    try:
        report['initialization'] = service.initialize()
        from maa.controller import Win32Controller
        from maa.define import MaaWin32ScreencapMethodEnum as S, MaaWin32InputMethodEnum as I
        target_folder, target, target_state = start('target')
        controller = Win32Controller(target, S.FramePool, I.SendMessageWithCursorPos, I.SendMessageWithCursorPos)
        controller.set_screenshot_use_raw_size(True)
        if not controller.post_connection().wait().succeeded:
            raise RuntimeError('Owned receiver connection failed')
        cover_folder, cover, cover_state = start('cover')
        user.SetWindowPos.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint]
        if not user.SetWindowPos(ctypes.c_void_p(cover), ctypes.c_void_p(-1), 0, 0, 0, 0, 0x3):
            raise RuntimeError('Cannot make owned cover topmost')
        user.SetForegroundWindow(ctypes.c_void_p(cover))
        # Foreground receiver may delegate activation only to the other owned,
        # nonce-verified test receiver when Windows rejects the parent request.
        (target_folder/'foreground-request.json').write_text(json.dumps({k: str(cover_state[k]) for k in ('hwnd','pid','nonce')}), encoding='utf-8')
        deadline = time.monotonic()+40
        while True:
            time.sleep(.25)
            report['before'] = coverage(target)
            if report['before']['foreground']['hwnd'] == str(cover) or time.monotonic() >= deadline:
                break
        if report['before']['foreground']['hwnd'] != str(cover) or any(p['topWindow']['hwnd'] != str(cover) for p in report['before']['samples']):
            raise RuntimeError('Owned cover must be foreground and cover all target samples')
        point = Point(*target_state['point'])
        user.ClientToScreen(ctypes.c_void_p(target), ctypes.byref(point))
        if int(user.GetAncestor(user.WindowFromPoint(point), 2) or 0) != cover:
            raise RuntimeError('Click point is not covered by owned cover')
        report['attempts'] = 1
        job = controller.post_click(*target_state['point']).wait()
        time.sleep(.5)
        report['apiSucceeded'] = job.succeeded
        report['targetReceived'] = json.loads((target_folder/'state.json').read_text('utf-8'))
        report['coverReceived'] = json.loads((cover_folder/'state.json').read_text('utf-8'))
        report['after'] = coverage(target)
        report['passed'] = bool(job.succeeded and all(report['targetReceived'][k] == 1 for k in ('down','up','activated')) and all(report['coverReceived'][k] == 0 for k in ('down','up','activated')) and report['after']['foreground']['hwnd'] == str(cover) and all(p['topWindow']['hwnd'] == str(cover) for p in report['after']['samples']))
    except Exception as error:
        report['error'] = str(error)
    finally:
        controller = None
        for process, folder in children:
            (folder/'stop').touch()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        service.close()
        (cache/'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({k: report[k] for k in ('passed','gameInputs','attempts','cache')} | {'error': report.get('error')}, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
