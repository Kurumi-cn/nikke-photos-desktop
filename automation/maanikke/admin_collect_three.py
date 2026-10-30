"""Bounded user-authorized three-character equipment test, evidence only."""
import json
import os
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.dont_write_bytecode=True
from admin_once import read_request,owner_alive
from worker import Service
from win32_metadata import elevation
from check_occluded_capture import coverage
from enter_policy import validate_pair

NAMES=['桃乐丝','米哈拉：羁绊锁链','小红帽']

def run(file):
    request,folder=read_request(file)
    if request['action']!='collect-three-once':raise RuntimeError('Fixed collection only')
    state={'runId':request['runId'],'stage':'initializing','elevated':elevation(os.getpid()),'actions':[],'completed':[],'captures':[],'passed':False}
    service=None
    def save():
        p=folder/'result.next';p.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8');p.replace(folder/'result.json')
    def guard():
        if (folder/'cancel').exists() or not owner_alive(request['ownerPid']) or time.time()-request['createdAt']>3600:raise RuntimeError('Canceled/expired/owner exited')
        if service.connection not in service.windows()['windows']:raise RuntimeError('Game identity changed')
        c=coverage(int(service.connection['hwnd']))
        if c['minimized'] or not c['visible'] or c['clientRect'][2:]!=[1920,1080]:raise RuntimeError('Require current non-minimized 1920x1080 game')
        state['coverage']=c
    def snap(label):
        guard();service.capture()
        name=str(len(state['captures'])+1).zfill(3)+'-'+label+'.png'
        (folder/name).write_bytes((folder/'runtime/latest-game.png').read_bytes())
        state['captures'].append(name);state['latestImage']=str(folder/name);save()
        return name
    def ocr(roi,expected):return service.recognize('OCR',{'roi':roi,'expected':[expected],'threshold':.6},service.last)
    def is_list():return ocr([0,0,150,65],'^妮姬$')['hit'] and ocr([1070,192,180,60],'战斗力')['hit']
    def is_detail():return ocr([0,0,160,65],'详细信息')['hit'] and ocr([20,275,140,55],'妮姬信息')['hit']
    def is_popup():return ocr([825,605,280,100],'改造装备效果')['hit']
    def act(label,fn):
        guard()
        if len(state['actions'])>=90:raise RuntimeError('Input budget exhausted')
        n=len(state['actions'])+1
        with (folder/('input-'+str(n)+'.lock')).open('x') as f:f.write(label);f.flush();os.fsync(f.fileno())
        state['actions'].append({'label':label,'reservedAt':time.time()});save()
        job=fn().wait();state['actions'][-1]['apiSucceeded']=job.succeeded;save()
        if not job.succeeded:raise RuntimeError('Input failed; no retries')
    def click(label,x,y,delay=3):
        act(label,lambda:service.controller.post_click(x,y));time.sleep(delay);snap(label)
    def wait_page(label,predicate):
        consecutive=0
        for i in range(6):
            if i:time.sleep(1.2)
            snap(label+'-'+str(i+1));consecutive=consecutive+1 if predicate() else 0
            if consecutive>=2:return
        raise RuntimeError('Page verification failed: '+label)
    try:
        if not state['elevated']:raise RuntimeError('No UAC permission')
        with (folder/'attempt.lock').open('x') as f:f.write('Three fixed characters only; never replay')
        service=Service(folder/'runtime');state['runtime']=service.initialize()
        target=next((t for t in service.windows()['windows'] if t['hwnd']==request['target']['hwnd'] and t['pid']==request['target']['pid']),None)
        if not target or not target['elevated']:raise RuntimeError('Target mismatch')
        service.connect(target['hwnd']);snap('initial')
        if request.get('resumeFrom'):
            import uuid
            previous=folder.parent/str(uuid.UUID(request['resumeFrom']))
            old=json.loads((previous/'result.json').read_text('utf-8'))
            if old['stage']!='failed' or old.get('expectedName') not in NAMES or [c['name'] for c in old['completed']] not in [NAMES[:1],NAMES[:2]]:
                raise RuntimeError('Unexpected resume checkpoint')
            if old.get('selected') and not is_detail():raise RuntimeError('Resume requires current reviewed detail page')
            if not old.get('selected') and not is_list():raise RuntimeError('Resume requires current list page')
            state.update({'completed':old['completed'],'expectedName':old['expectedName'],'selected':bool(old.get('selected')),'resumeFrom':request['resumeFrom']})
        state['stage']='ready';save();(folder/'ready.json').write_text('{}')
        seq=1
        while True:
            guard();command=folder/('command-'+str(seq)+'.json')
            if not command.exists():time.sleep(.2);continue
            op=json.loads(command.read_text('utf-8'))['op']
            if op not in ['inspect','hall','enter-list','search-0','search-1','search-2','select-1','select-2','read-four','back-list','finish']:raise RuntimeError('Command not allowlisted')
            with (folder/('command-'+str(seq)+'.lock')).open('x') as f:f.write(op)
            state['stage']='running';state['command']=op;state['sequence']=seq;save();snap('pre-'+op)
            if op=='hall':
                analysis=service.analyze_image(service.last)
                if not analysis['lobby']:
                    if not is_list():raise RuntimeError('No known lobby route')
                    hall=ocr([895,940,135,135],'^大厅$')
                    if not hall['hit']:raise RuntimeError('Explicit hall button missing')
                    x,y,w,h=hall['box'];click('return-hall',round(x+w/2),round(y+h/2))
                wait_page('hall',lambda:service.analyze_image(service.last)['lobby'])
                state['atHall']=True
            elif op=='enter-list':
                if not state.get('atHall'):raise RuntimeError('Must confirm hall first')
                a=service.analyze();time.sleep(.5);b=service.analyze();x,y=validate_pair(a,b)
                click('enter-list',x,y);wait_page('list',is_list);state['atHall']=False
            elif op.startswith('search-'):
                if not is_list():raise RuntimeError('Not list')
                index=int(op[-1]);name=NAMES[index]
                empty=ocr([735,286,375,58],'搜索妮姬的名字')['hit']
                if not empty:
                    query=ocr([735,286,375,58],'.+')
                    if query['hit']:
                        click('clear-query',1094,314,1.5)
                    else:
                        a=service.analyze_image(service.last);s=a['results']['PhotosListSearch']
                        if not s['hit']:raise RuntimeError('No recognized search button')
                        x,y,w,h=s['originalBox'];click('expand-search',round(x+w/2),round(y+h/2),1.5)
                wait_page('empty-query',lambda:ocr([735,286,375,58],'搜索妮姬的名字')['hit'])
                click('focus-query',940,314,.3)
                act('type-'+name,lambda:service.controller.post_input_text(name));time.sleep(1);snap('typed-'+str(index))
                if not ocr([735,286,375,58],name.replace('：','[：:]'))['hit']:raise RuntimeError('Typed query mismatch')
                click('submit-query',1145,314);wait_page('query-results',lambda:is_list() and ocr([735,286,375,58],name.replace('：','[：:]'))['hit'])
                state['expectedName']=name;state['selected']=False
            elif op.startswith('select-'):
                if not is_list() or state.get('expectedName') not in NAMES:raise RuntimeError('No verified query')
                # Candidate selection is reviewed from the saved screenshot before this fixed command.
                index=int(op[-1])-1
                click('open-candidate-'+str(index+1),145+149*index,485)
                wait_page('detail',is_detail);state['selected']=True
                state['detailIdentityOCR']=ocr([1580,220,310,70],'.+')
            elif op=='read-four':
                if not state.get('selected') or not is_detail():raise RuntimeError('No confirmed selected detail')
                # Blue equipment tab from the provided, fixed 1920x1080 layout.
                image=service.last;pixel=image[735,1563]
                if not (int(pixel[0])>150 and int(pixel[0])>int(pixel[2])+50):
                    if not ocr([1535,700,70,80],'装备')['hit']:raise RuntimeError('Equipment tab missing')
                    click('select-equipment',1564,738,1.5)
                entries=[]
                for slot,x,y in [('头',1657,773),('胸',1792,780),('手',1657,879),('腿',1792,888)]:
                    if not is_detail():raise RuntimeError('Detail lost before slot')
                    click('open-'+slot,x,y,1.5);wait_page('popup-'+slot,is_popup)
                    name=snap('equipment-'+str(NAMES.index(state['expectedName']))+'-'+slot)
                    entries.append({'slot':slot,'image':str(folder/name),'slotOCR':ocr([707,112,125,48],'.+')})
                    state['currentEquipment']=entries;save()
                    click('close-'+slot,1174,93,1.5);wait_page('detail-after-'+slot,is_detail)
                state['completed'].append({'name':state['expectedName'],'equipment':entries})
            elif op=='back-list':
                if not is_detail():raise RuntimeError('Not detail')
                if not ocr([0,990,140,65],'返回')['hit']:raise RuntimeError('Explicit back missing')
                click('back-list',79,1022);wait_page('returned-list',is_list);state['selected']=False
            elif op=='finish':
                if len(state['completed'])!=3 or {c['name'] for c in state['completed']}!=set(NAMES):raise RuntimeError('Three characters not completed')
                if not service.analyze_image(service.last)['lobby']:raise RuntimeError('Final lobby not confirmed')
                state['passed']=True;state['stage']='completed';save();break
            state['stage']='ready';state['finishedSequence']=seq;save();seq+=1
    except Exception as error:
        state['stage']='failed';state['error']=str(error);save()
    finally:
        if service:service.close()
        state['finishedAt']=time.time();save()

if __name__=='__main__':run(sys.argv[1])
