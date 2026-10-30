"""User-selected roster collection. Bounded navigation/read-only equipment actions."""
import ctypes
import json
import os
import re
import random
import sys
import time
import uuid
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.dont_write_bytecode=True
from worker import Service,ROOT,encode_png
from admin_once import owner_alive
from win32_metadata import elevation
from check_occluded_capture import coverage
from collection_roster import load_collection_roster
from collection_vision import candidates,choose_candidate,normalized_name,safe_point,element,name_fragment_matches,popup_outside_box
from collection_vision import popup_surface_ready,popup_signature,popup_unchanged

PROJECT=ROOT.parents[1]
SLOTS=[('head','头',[1616,741,83,69]),('chest','胸',[1750,748,83,69]),('hands','手',[1616,844,83,69]),('legs','腿',[1750,856,83,69])]
class Cancelled(Exception):pass
class PageDeviation(Exception):pass
class SkipRole(Exception):pass
class PopupDismissalUnconfirmed(Exception):pass
class SearchInputUnconfirmed(Exception):pass

def atomic(file,data):
    temp=file.with_suffix('.next');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(file)

class Pages:
    def __init__(self,service):self.s=service;self.cache={};self.preferred_artwork={};self.timings={}
    def reset(self):self.cache={}
    def recognize(self,kind,params):
        started=time.monotonic()
        try:return self.s.recognize(kind,params,self.s.last)
        finally:
            value=self.timings.setdefault(kind,{'count':0,'seconds':0.0})
            value['count']+=1;value['seconds']+=time.monotonic()-started
    def ocr(self,roi,expected='.+'):
        key=('ocr',tuple(roi),expected)
        if key not in self.cache:self.cache[key]=self.recognize('OCR',{'roi':roi,'expected':[expected],'threshold':.65})
        return self.cache[key]
    def match(self,name,roi,threshold=.83):
        key=('match',name,tuple(roi),threshold)
        if key not in self.cache:self.cache[key]=self.recognize('TemplateMatch',{'template':['collection/'+name+'.png'],'roi':roi,'threshold':[threshold]})
        return self.cache[key]
    @staticmethod
    def texts(result):
        detail=result.get('detail') or {}
        return [str(e.get('text','')) for e in detail.get('filtered',[]) if isinstance(e,dict)]
    def page(self):
        if 'page' in self.cache:return self.cache['page']
        close=self.match('close',[680,0,560,280])
        if close['hit'] and self.ocr([705,330,510,330],'装备能力值')['hit']:
            if self.match('overload',[840,0,260,240])['hit']:page='overload'
            elif self.match('tier9',[840,0,260,240])['hit'] or self.ocr([840,0,260,230],r'TIER\s*[1-9]\b')['hit']:page='non_overload'
            else:page='equipment_unknown'
        elif self.ocr([0,0,160,65],'详细信息')['hit'] and self.ocr([20,275,140,55],'妮姬信息')['hit']:page='detail'
        elif self.ocr([0,0,160,65],'^妮姬$')['hit'] and self.ocr([1070,190,185,65],'战斗力')['hit']:page='list'
        else:
            central=sum(self.ocr(roi,text)['hit'] for roi,text in [([410,770,350,180],'前哨基地'),([1180,640,340,180],'方舟'),([1160,790,370,180],'作战出击'),([400,650,340,150],'商店')])
            page='hall' if central>=2 and self.ocr([1790,205,130,300],'任务|好友|联盟')['hit'] else 'unknown'
        self.cache['page']=page;return page
    def is_page(self,expected):
        if 'page' in self.cache:return self.cache['page']==expected
        key=('expected-page',expected)
        if key not in self.cache:
            if expected=='list':
                # Search only the known next state's anchors. Do not scan
                # detail/hall OCR paths on every list/input polling frame.
                self.cache[key]=not self.match('close',[680,0,560,280])['hit'] and self.ocr([0,0,160,65],'^妮姬$')['hit'] and self.ocr([1070,190,185,65],'战斗力')['hit']
            else:self.cache[key]=self.page()==expected
        return self.cache[key]
    def detail_matches(self,character):
        if self.page()!='detail':return False
        expected=character['element'];actual=element(self.s.last,[1595,621,53,56])
        if actual!=expected:return False
        names=self.texts(self.ocr([1725,220,150,65]))
        if any(name_fragment_matches(character['nameCn'],text) for text in names):return True
        return self.artwork_matches(character)['hit']
    def artwork_matches(self,character):
        key=('artwork',character['nameCode'])
        if key not in self.cache:
            results=[]
            artworks=sorted(character.get('artworks',[]),key=lambda a:a.get('file')!=self.preferred_artwork.get(character['nameCode']))
            for artwork in artworks:
                filename=artwork.get('file','')
                if Path(filename).name!=filename or not filename.endswith('.webp'):continue
                file=PROJECT/'public/ui-assets/nikke/character-artwork'/filename
                if not file.is_file():continue
                # The pinned native image loader does not decode these WebP
                # assets; Pillow converts only the selected built-in references.
                converted=self.s.cache/'artwork-templates'/(file.stem+'.png')
                if not converted.exists():
                    converted.parent.mkdir(exist_ok=True)
                    source=Image.open(file).convert('RGBA');source.thumbnail((800,800))
                    canvas=Image.new('RGB',source.size,'white');canvas.paste(source,mask=source.getchannel('A'));canvas.save(converted)
                found=self.recognize('FeatureMatch',{'template':[str(converted)],'roi':[180,65,1340,1000],'detector':'SIFT','count':60,'ratio':.6})
                results.append({'file':filename,'hit':found['hit'],'detail':found.get('detail')})
                if found['hit']:
                    self.preferred_artwork[character['nameCode']]=filename;break
            self.cache[key]={'hit':any(r['hit'] for r in results),'results':results}
        return self.cache[key]
    def equipment_tab(self):
        b,g,r=map(int,self.s.last[735,1563])
        return b>150 and b>r+50
    def slot_state(self,index):
        box=SLOTS[index][2];x,y,w,h=box
        if self.match('empty-'+str(index),[x-12,y-15,w+25,h+34],.80)['hit']:return 'unequipped'
        crop=self.s.last[y:y+h,x:x+w].astype('int16')
        if float(((crop.max(2)-crop.min(2))>40).mean())>.045:return 'equipped'
        return 'unknown'

class Collector:
    def __init__(self,request,folder,service_factory=Service,pages_factory=Pages,permission=None):
        self.request=request;self.folder=folder;self.s=None;self.pages=None;self.event=0;self.actions=0
        self.service_factory=service_factory;self.pages_factory=pages_factory;self.permission=permission or (lambda:elevation(os.getpid()) is True)
        self.state={'phase':'initializing','currentIndex':0,'currentName':'','slot':'','inputRequests':0,'updatedAt':time.time()}
        self.started=time.monotonic();self.frame_captured_at=None
        self.timings={}
    def timing(self,kind,started):
        value=self.timings.setdefault(kind,{'count':0,'seconds':0.0})
        value['count']+=1;value['seconds']+=time.monotonic()-started
    def delay(self,seconds):
        started=time.monotonic();time.sleep(seconds);self.timing('configuredDelay',started)
    def save_timings(self):
        atomic(self.folder/'timings.json',{'elapsedSeconds':time.monotonic()-self.started,'stages':self.timings,'recognition':getattr(self.pages,'timings',{})})
    def progress(self,phase,**extra):
        self.state.update(phase=phase,updatedAt=time.time(),inputRequests=self.actions,**extra);atomic(self.folder/'progress.json',self.state)
    def guard(self,input_action=False,ignore_cancel=False):
        if not owner_alive(self.request['ownerPid']):raise Cancelled('主程序已退出')
        if not ignore_cancel and (self.folder/'cancel').exists():raise Cancelled('用户已停止，进度已保存')
        if time.monotonic()-self.started>max(1800,len(self.request['characters'])*180):raise Cancelled('任务运行时限已到')
        paused=False;phase=self.state['phase']
        while not ignore_cancel and (self.folder/'pause').exists():
            if not paused:self.progress('paused',resumePhase=phase);paused=True
            if (self.folder/'cancel').exists() or not owner_alive(self.request['ownerPid']):raise Cancelled('暂停期间任务已停止')
            time.sleep(.1)
        if paused:self.progress(phase)
        if input_action:
            if self.s.connection not in self.s.windows()['windows']:raise PageDeviation('游戏窗口身份已变化')
            info=coverage(int(self.s.connection['hwnd']))
            if info['minimized'] or not info['visible'] or info['clientRect'][2:]!=[1920,1080]:raise PageDeviation('请保持1920×1080游戏窗口未最小化')
            # Do not send input while a user modifier/Alt+Tab gesture is held.
            deadline=time.monotonic()+2
            while any(ctypes.windll.user32.GetAsyncKeyState(key)&0x8000 for key in (0xA4,0xA5,9,17,16,1)):
                if time.monotonic()>deadline:raise PageDeviation('检测到用户正在操作，已让出控制')
                self.guard();time.sleep(.1)
    def emit(self,kind,data=None,image=False,ignore_cancel=False):
        started=time.monotonic()
        self.event+=1;number=self.event;spool=self.folder/'spool';spool.mkdir(exist_ok=True)
        if image and self.s and self.s.last is not None:
            encoded=time.monotonic()
            png=encode_png(self.s.last,compress_level=3 if kind=='equipment' else 6)
            self.timing('equipmentPngEncode' if kind=='equipment' else 'evidencePngEncode',encoded)
            (spool/(str(number)+'.png')).write_bytes(png)
        atomic(spool/(str(number)+'.json'),{'id':number,'kind':kind,'data':data or {},'image':bool(image),'savedAt':time.time()})
        deadline=time.monotonic()+40
        reply=spool/(str(number)+'.reply.json')
        while not reply.exists():
            self.guard(ignore_cancel=ignore_cancel)
            if time.monotonic()>deadline:raise RuntimeError('主程序处理截图超时，未继续输入')
            time.sleep(.06)
        result=json.loads(reply.read_text('utf-8'))
        self.timing('equipmentOcrAndSave' if kind=='equipment' else 'eventAndImageSave',started)
        if not result.get('ok'):raise RuntimeError(result.get('error','截图处理失败'))
        return result.get('result')
    def capture(self,record=True):
        self.guard();started=time.monotonic();self.s.capture(export=False);self.frame_captured_at=time.monotonic();self.pages.reset();self.timing('captureBgr',started)
        if record:self.emit('frame',{'phase':self.state['phase']},True)
    def wait(self,predicate,label,initial=.7,timeout=20,confirmations=2,record=True,interval=.65):
        self.progress(label);self.delay(initial);deadline=time.monotonic()+timeout;consecutive=0
        while time.monotonic()<deadline:
            self.capture(False);started=time.monotonic();consecutive=consecutive+1 if predicate() else 0;self.timing('verification',started)
            if consecutive>=confirmations:
                # Persist one final evidence frame, not every unsuccessful poll.
                # Multi-frame checks still use separate native captures.
                if record:self.emit('frame',{'phase':label},True)
                self.save_timings();return
            self.delay(interval)
        raise PageDeviation('等待页面确认超时：'+label)
    def input(self,label,call,click=None):
        self.guard(True)
        if self.actions>=30*len(self.request['characters'])+25:raise RuntimeError('动作预算用尽')
        self.actions+=1
        with (self.folder/'actions.jsonl').open('a',encoding='utf-8') as log:
            log.write(json.dumps({'index':self.actions,'action':label,'reservedAt':time.time(),**({'click':click} if click else {})},ensure_ascii=False)+'\n');log.flush();os.fsync(log.fileno())
        self.progress(label)
        started=time.monotonic()
        try:
            if not call().wait().succeeded:raise RuntimeError('输入请求失败，未重试：'+label)
        finally:self.timing('nativeInput',started)
    def click(self,label,box,allowed,fresh=True):
        age=None if self.frame_captured_at is None else time.monotonic()-self.frame_captured_at
        reused=not fresh and age is not None and 0<=age<=.75
        if not reused:self.capture(False)
        valid=self.pages.is_page('list') if allowed=={'list'} else self.pages.page() in allowed
        if not valid:raise PageDeviation('点击前页面已改变：'+label)
        point=safe_point(box)
        self.state['lastClick']={'targetBox':box,'point':point}
        frame_age=None if self.frame_captured_at is None else round((time.monotonic()-self.frame_captured_at)*1000,2)
        self.input(label,lambda:self.s.controller.post_click(*point),click={'targetBox':box,'point':point,'sampling':'inner-50-percent','reusedFrame':reused,'frameAgeMs':frame_age})
    def recognized_click(self,label,result,allowed,fresh=True):
        if not result['hit']:raise PageDeviation('未识别明确入口：'+label)
        self.click(label,result['box'],allowed,fresh=fresh)
    def close_popup(self,from_snapshot=False):
        result=self.pages.match('close',[680,0,560,280])
        if not result['hit']:raise PageDeviation('无法确认装备弹窗关闭锚点')
        outside=popup_outside_box(result['box'])
        if outside and random.SystemRandom().choice([False,True]):
            self.click('点击装备卡片外空白返回',outside,{'overload','non_overload','equipment_unknown'},fresh=not from_snapshot)
        else:
            self.recognized_click('关闭装备弹窗',result,{'overload','non_overload','equipment_unknown'},fresh=not from_snapshot)
        # A failed dismissal stops; do not add an unverified second click.
        try:self.wait(lambda:self.pages.page()=='detail','确认角色详情',initial=.15,confirmations=1,record=False,interval=.15)
        except PageDeviation as error:raise PopupDismissalUnconfirmed('装备弹窗退出未确认，已停止，未补点') from error
    def ensure(self,target):
        for _ in range(4):
            self.capture(False)
            page=self.pages.page()
            if page==target:
                if target=='hall':self.wait(lambda:self.pages.page()==target,'确认'+target,initial=0,record=False,interval=.25)
                return
            if page in ('overload','non_overload','equipment_unknown'):self.close_popup();continue
            if page=='detail':
                self.recognized_click('返回角色列表',self.pages.ocr([0,990,140,65],'返回'),{'detail'},fresh=False)
                self.wait(lambda:self.pages.is_page('list'),'确认返回列表',initial=.15,interval=.2,record=False)
                if target=='list':return
                continue
            if page=='list' and target=='hall':
                self.recognized_click('返回大厅',self.pages.ocr([895,940,135,135],'^大厅$'),{'list'})
                self.wait(lambda:self.pages.page()=='hall','确认大厅',initial=1.5);return
            if page=='hall' and target=='list':
                self.recognized_click('进入妮姬列表',self.pages.ocr([675,945,145,130],'^妮姬$'),{'hall'})
                self.wait(lambda:self.pages.is_page('list'),'确认妮姬列表',initial=1.5);return
            raise PageDeviation('无法识别安全恢复路线；请手动调整到大厅或妮姬列表')
        raise PageDeviation('已达到受限恢复次数，请检查游戏页面')
    def query_matches(self,name):
        return self.pages.ocr([735,286,375,58],'^'+re.escape(name).replace('：','[：:]')+'$')['hit']
    def enter_search_text(self,name):
        # A successful native input job is not proof that Unity focused its
        # input field. Check the visible outcome; retry only if still empty.
        for attempt in range(2):
            self.capture(False)
            if not self.pages.is_page('list'):raise SearchInputUnconfirmed('输入前页面已变化，已停止')
            if attempt and self.query_matches(name):return
            if not self.pages.ocr([735,286,375,58],'搜索妮姬的名字')['hit']:
                raise SearchInputUnconfirmed('搜索框不是已确认的空状态，未重复输入')
            self.click('聚焦搜索框' if not attempt else '重新聚焦空搜索框',[760,300,290,28],{'list'},fresh=False)
            self.delay(.35)
            if attempt:
                self.capture(False)
                if not self.pages.is_page('list'):raise SearchInputUnconfirmed('重新聚焦后页面已变化，已停止')
                if self.query_matches(name):return
            self.input('输入角色名',lambda:self.s.controller.post_input_text(name))
            try:
                self.wait(lambda:self.pages.is_page('list') and self.query_matches(name),'核对输入名称',initial=.15,timeout=1.5,confirmations=1,interval=.15,record=False)
                return
            except PageDeviation as error:
                if not self.pages.is_page('list'):raise SearchInputUnconfirmed('输入后页面已变化，已停止') from error
                if attempt or not self.pages.ocr([735,286,375,58],'搜索妮姬的名字')['hit']:
                    raise SearchInputUnconfirmed('搜索文字未确认，已停止；没有重复拼接或提交搜索') from error
                self.progress('搜索框仍为空，重新聚焦一次')
        raise SearchInputUnconfirmed('搜索框未进入输入状态，已停止')
    def search(self,character):
        name=character['nameCn'];self.ensure('list')
        if not self.pages.ocr([735,286,375,58],'搜索妮姬的名字')['hit']:
            clear=self.pages.match('clear',[1065,285,50,65])
            if clear['hit']:self.recognized_click('清空搜索',clear,{'list'},fresh=False)
            else:self.recognized_click('展开搜索',self.pages.match('search',[650,175,120,95]),{'list'})
        # The placeholder may precede the end of Unity's clear/focus transition.
        self.wait(lambda:self.pages.is_page('list') and self.pages.ocr([735,286,375,58],'搜索妮姬的名字')['hit'],'等待空搜索框稳定',initial=.2,confirmations=2,interval=.15,record=False)
        self.enter_search_text(name)
        self.click('提交角色搜索',[1117,300,57,28],{'list'},fresh=False)
        stable={'key':None,'n':0,'items':[]}
        def results_ready():
            if not self.pages.is_page('list') or not self.query_matches(name):return False
            items=candidates(self.s.last,details=False)
            if len(items)>8:return False # Still showing the unfiltered grid.
            if len(items)>1:items=candidates(self.s.last)
            key=[(i['box'],i.get('element'),i.get('burst')) for i in items]
            stable['n']=stable['n']+1 if stable['key']==key else 1;stable.update(key=key,items=items)
            return stable['n']>=2
        # This predicate already requires two identical frames; don't wrap it
        # in a second two-frame counter (which previously required three).
        try:self.wait(results_ready,'等待搜索结果',initial=1,confirmations=1,interval=.25)
        except PageDeviation:
            if self.pages.is_page('list') and self.query_matches(name):raise SkipRole('搜索结果未收敛，无法可靠判别')
            raise
        items=stable['items']
        if not items:raise SkipRole('未检测到可确认的角色卡，请核对截图；不代表未拥有')
        if len(items)>8:raise SkipRole('搜索结果过多，无法可靠判别')
        if len(items)>1:
            for item in items:
                x,y,_,_=item['box'];item['name']=''.join(self.pages.texts(self.pages.ocr([x+34,y+180,94,36])))
        try:chosen,reason=choose_candidate(items,character)
        except RuntimeError as error:raise SkipRole(str(error)) from error
        self.emit('candidate',{'nameCode':character['nameCode'],'candidates':items,'chosen':chosen,'reason':reason})
        x,y,_,_=chosen['box'];self.click('打开目标角色',[x+24,y+42,79,126],{'list'},fresh=False)
        self.wait(lambda:self.pages.page()=='detail','确认角色详情',initial=.4,confirmations=1,interval=.2)
    def read_character(self,character):
        if not self.pages.equipment_tab():
            self.recognized_click('切换装备标签',self.pages.ocr([1535,700,70,80],'装备'),{'detail'})
            self.wait(lambda:self.pages.page()=='detail' and self.pages.equipment_tab(),'确认装备标签',initial=.15,confirmations=1,interval=.15)
        for index,(slot,label,box) in enumerate(SLOTS):
            self.progress('读取'+label+'部装备',slot=slot)
            # Identity was resolved on the search page. Inside details, only
            # validate the current page; no scrolling-name OCR or SIFT loop.
            self.capture(False)
            if self.pages.page()!='detail':raise PageDeviation('装备读取时已离开角色详情')
            state=self.pages.slot_state(index)
            if state=='unknown':
                self.emit('equipment',{'nameCode':character['nameCode'],'slot':slot,'classification':'equipment_unknown'},True);continue
            if state=='unequipped':
                self.emit('equipment',{'nameCode':character['nameCode'],'slot':slot,'classification':'unequipped'},True);continue
            self.click('打开'+label+'部装备',box,{'detail'},fresh=False)
            self.wait_popup()
            classification=self.pages.page()
            self.emit('equipment',{'nameCode':character['nameCode'],'slot':slot,'classification':classification},True)
            # Parent acknowledges durable intake, not OCR completion. Reuse
            # the verified popup frame to close without taking another photo.
            self.close_popup(from_snapshot=True)
        self.emit('character',{'nameCode':character['nameCode']})
    def wait_popup(self,timeout=20):
        self.progress('等待装备弹窗稳定');started=time.monotonic();deadline=started+timeout;previous=None
        self.delay(.3)
        while time.monotonic()<deadline:
            self.capture(False)
            # Cheap pixel checks reject fading/moving frames before template/OCR.
            if popup_surface_ready(self.s.last):
                current=popup_signature(self.s.last)
                if previous is not None and time.monotonic()-started>=.45 and popup_unchanged(previous,current):
                    self.timing('popupVisualWait',started)
                    classified=time.monotonic();page=self.pages.page();self.timing('popupClassification',classified)
                    if page in ('overload','non_overload','equipment_unknown'):
                        self.timing('popupSettling',started);return
                    previous=None
                else:previous=current
            else:previous=None
            self.delay(.12)
        raise PageDeviation('装备弹窗未稳定，未保存过渡帧')
    def run(self):
        try:
            if not self.permission():raise RuntimeError('未实际取得管理员权限')
            self.s=self.service_factory(self.folder/'runtime');self.s.initialize();self.pages=self.pages_factory(self.s)
            target=next((w for w in self.s.windows()['windows'] if w['hwnd']==self.request['target']['hwnd'] and w['pid']==self.request['target']['pid']),None)
            if not target or target['elevated'] is not True:raise RuntimeError('国服窗口身份或权限已变化')
            self.s.connect(target['hwnd']);self.progress('等待用户准备');self.delay(5)
            self.ensure('hall');self.emit('started',{'hallConfirmed':True})
            self.ensure('list')
            done=set(self.request.get('completedCodes',[]))
            for index,character in enumerate(self.request['characters']):
                if character['nameCode'] in done:continue
                self.progress('准备角色',currentIndex=index,currentName=character['nameCn'],slot='')
                self.emit('characterBegin',{'nameCode':character['nameCode'],'index':index})
                for attempt in range(2):
                    try:
                        self.search(character);self.read_character(character);break
                    except SkipRole as error:
                        self.emit('skipped',{'nameCode':character['nameCode'],'reason':str(error)})
                        break
                    except PageDeviation:
                        if attempt:raise
                        self.progress('页面偏离，受限恢复')
                        self.ensure('list');self.emit('characterBegin',{'nameCode':character['nameCode'],'index':index})
                # Next search performs the single required return/list check.
            self.ensure('hall');self.progress('completed',slot='')
            self.emit('done',{'returnedToLobby':True,'inputRequests':self.actions})
        except Exception as error:
            self.progress('canceled' if isinstance(error,Cancelled) else 'failed',error=str(error))
            try:self.emit('failed',{'error':str(error),'canceled':isinstance(error,Cancelled),'inputRequests':self.actions},image=self.s is not None and self.s.last is not None,ignore_cancel=True)
            except Exception:pass
        finally:
            try:self.save_timings()
            finally:
                if self.s:self.s.close()

def main(file):
    file=Path(file).resolve();folder=file.parent
    if file.name!='request.json' or folder.parent.name!='maanikke-collection' or str(uuid.UUID(folder.name))!=folder.name:raise RuntimeError('Invalid collection request path')
    request=json.loads(file.read_text('utf-8-sig'))
    if request['version']!=1 or request['action']!='collect-roster' or request['runId']!=folder.name or not 0<=time.time()-request['createdAt']<=300:raise RuntimeError('Invalid or expired collection request')
    codes=request['nameCodes']
    request['characters']=load_collection_roster(PROJECT,codes)
    if any(code not in codes for code in request.get('completedCodes',[])):raise RuntimeError('Invalid resume selection')
    with (folder/'attempt.lock').open('x') as lock:lock.write(str(time.time()));lock.flush();os.fsync(lock.fileno())
    Collector(request,folder).run()

if __name__=='__main__':main(sys.argv[1])
