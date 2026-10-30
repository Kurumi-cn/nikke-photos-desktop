"""Fixed UAC experiment: open search, input 小美人鱼, submit; never open a card."""
import ctypes
import json
import os
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from admin_once import read_request, owner_alive
from worker import Service
from win32_metadata import elevation
from check_occluded_capture import coverage


def run(file):
    request, folder = read_request(file)
    if request['action'] != 'search-mermaid-once':
        raise RuntimeError('Only fixed search experiment allowed')
    state = {'runId':request['runId'], 'pid':os.getpid(), 'elevated':elevation(os.getpid()),
             'query':'小美人鱼', 'passed':False, 'inputRequests':0, 'stage':'initializing', 'actions':[], 'after':[]}
    service = None

    def save():
        temp = folder/'result.next'
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(folder/'result.json')

    def guard():
        if (folder/'cancel').exists() or not owner_alive(request['ownerPid']) or time.time()-request['createdAt']>300:
            raise RuntimeError('Canceled, owner exited or expired; no further input')
        if service.connection not in service.windows()['windows']:
            raise RuntimeError('Game identity changed')
        info = coverage(int(service.connection['hwnd']))
        if info['minimized'] or not info['visible'] or info['clientRect'][2:] != [1920,1080]:
            raise RuntimeError('Require visible, non-minimized 1920x1080 game')
        state.setdefault('coverage', []).append(info)
        return info

    def frame(label):
        guard()
        capture = service.capture()
        (folder/(label+'.png')).write_bytes((folder/'runtime/latest-game.png').read_bytes())
        result = service.analyze_image(service.last)
        result['capture'] = {**capture,'image':None}
        state['currentPage'] = result
        save()
        if not (result['listPage']['title'] and result['listPage']['header'] and result['listPage']['sort']):
            raise RuntimeError('Nikke list fixed UI verification failed')
        return result

    def ocr(roi, expected):
        return service.recognize('OCR', {'roi':roi,'expected':[expected],'threshold':.65}, service.last)

    def action(label, callback):
        guard()
        if (folder/(label+'.lock')).exists():
            raise RuntimeError('Action already reserved; replay forbidden')
        with (folder/(label+'.lock')).open('x',encoding='utf-8') as lock:
            lock.write(str(time.time()));lock.flush();os.fsync(lock.fileno())
        state['inputRequests'] += 1
        state['actions'].append({'action':label,'reservedAt':time.time()})
        save()
        job = callback().wait()
        state['actions'][-1]['apiSucceeded'] = job.succeeded
        save()
        if not job.succeeded:
            raise RuntimeError('Input API failed; no retries')

    try:
        save()
        if state['elevated'] is not True:
            raise RuntimeError('Administrator permission not granted')
        with (folder/'attempt.lock').open('x',encoding='utf-8') as lock:
            lock.write('Fixed search once; no replay')
        service = Service(folder/'runtime')
        state['runtime'] = service.initialize()
        target = next((t for t in service.windows()['windows'] if t['hwnd']==request['target']['hwnd'] and t['pid']==request['target']['pid']),None)
        if not target or target['elevated'] is not True:
            raise RuntimeError('Current elevated game identity mismatch')
        service.connect(target['hwnd'])
        state['stage'] = 'countdown';save()
        for _ in range(150):
            guard();time.sleep(.1)
        first = frame('before-1');time.sleep(.5);second = frame('before-2')
        empty = ocr([735,286,375,58], '搜索妮姬的名字')
        if not empty['hit']:
            search = second['results']['PhotosListSearch']
            if not search['hit'] or not second['listPage']['verified']:
                raise RuntimeError('No empty search field or collapsed search button; stopped')
            x,y,w,h = search['originalBox']
            action('expand-search', lambda:service.controller.post_click(round(x+w/2),round(y+h/2)))
            time.sleep(1.5)
            frame('expanded')
            empty = ocr([735,286,375,58], '搜索妮姬的名字')
        state['placeholderOCR'] = empty;save()
        if not empty['hit']:
            raise RuntimeError('Empty search placeholder not recognized; no typing')
        action('focus-search', lambda:service.controller.post_click(940,314))
        time.sleep(.3)
        action('input-chinese', lambda:service.controller.post_input_text('小美人鱼'))
        time.sleep(1)
        frame('typed')
        typed = ocr([735,286,375,58], '^小美人鱼$')
        state['typedOCR'] = typed;save()
        if not typed['hit']:
            raise RuntimeError('Chinese text not confirmed in game field; no submit or retry')
        action('submit-search', lambda:service.controller.post_click(1145,314))
        state['stage'] = 'verifying';save()
        time.sleep(3)
        consecutive = 0
        for index in range(6):
            if index:time.sleep(1.5)
            result = frame('after-'+str(index+1))
            query = ocr([735,286,375,58], '^小美人鱼$')
            card = ocr([65,548,170,70], '小美人鱼')
            entry = {'listPage':result['listPage'],'query':query,'cardName':card}
            state['after'].append(entry)
            consecutive = consecutive+1 if query['hit'] and card['hit'] else 0
            state['consecutiveMatches'] = consecutive;save()
            if consecutive>=2:break
        state['passed'] = consecutive>=2
        state['stage'] = 'completed'
        state['note'] = '中文已写入并确认搜索结果；未点击角色' if state['passed'] else '未确认搜索结果；没有重试'
    except Exception as error:
        state['stage'] = 'failed';state['error'] = str(error)
    finally:
        if service:service.close()
        state['finishedAt'] = time.time();save()
    return state


if __name__ == '__main__':
    run(sys.argv[1])
