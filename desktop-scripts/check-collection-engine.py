"""State-machine simulation: no native library, no game, no UAC."""
import json
import re
import sys
import tempfile
from pathlib import Path
sys.dont_write_bytecode=True
project=Path(__file__).resolve().parents[1];sys.path.insert(0,str(project/'automation/maanikke'))
import collection_worker as engine
roster={c['nameCn']:c for c in json.loads((project/'src/data/roster.json').read_text('utf-8'))['characters']}
class Job:
    succeeded=True
    def wait(self):return self
class FakeService:
    def __init__(self,_):self.page='hall';self.query='';self.expanded=False;self.controller=self;self.last=None;self.connection=None;self.selected='';self.slot=0;self.inputs=[]
    def initialize(self):pass
    def windows(self):return {'windows':[{'hwnd':'123','pid':123,'elevated':True}]}
    def connect(self,_):self.connection=self.windows()['windows'][0]
    def close(self):pass
    def post_input_text(self,text):self.query=text;self.inputs.append(('text',text));return Job()
    def post_click(self,x,y):
        self.inputs.append(('click',x,y))
        if self.page=='hall':assert 675<x<820 and y>945;self.page='list'
        elif self.page=='list':
            if y>940:self.page='hall'
            elif y<270:self.expanded=True
            elif x>1080 and x<1110 and y<350:self.query=''
            elif y>370:self.page='detail';self.selected=self.query
        elif self.page=='detail':
            if x<140 and y>990:self.page='list'
            elif x>1600:self.slot=1 if x>1740 and y<830 else 2 if x<1740 else 3;self.page='non_overload' if self.slot==1 else 'overload'
        else:assert (x>1150 and y<115) or (1260<=x<=1470 and 250<=y<=750);self.page='detail'
        return Job()
class FakePages:
    def __init__(self,s):self.s=s
    def reset(self):pass
    def page(self):return self.s.page
    def is_page(self,expected):return self.s.page==expected
    def detail_matches(self,c):raise AssertionError('Fast flow must not re-identify inside details')
    def equipment_tab(self):return True
    def slot_state(self,index):return 'unequipped' if index==0 else 'equipped'
    def match(self,name,roi,threshold=.83):
        hit=name=='close' and self.s.page in ('overload','non_overload') or name=='clear' and bool(self.s.query) or name=='search' and not self.s.expanded
        box=[1159,78,30,30] if name=='close' else [1084,304,20,20] if name=='clear' else [672,193,63,53]
        return {'hit':hit,'box':box}
    def ocr(self,roi,expected='.+'):
        hit=False;box=[0,0,10,10]
        if roi==[735,286,375,58]:hit=self.s.expanded and not self.s.query if expected=='搜索妮姬的名字' else bool(re.search(expected,self.s.query));box=[850,301,160,28]
        elif expected=='^大厅$':hit=self.s.page=='list';box=[942,1025,40,25]
        elif expected=='^妮姬$':hit=self.s.page=='hall';box=[725,1024,45,28]
        elif expected=='返回':hit=self.s.page=='detail';box=[65,1006,45,28]
        return {'hit':hit,'box':box,'detail':{'filtered':[]}}
    texts=staticmethod(lambda result:[])
class TestCollector(engine.Collector):
    def __init__(self,request,folder):super().__init__(request,folder,FakeService,FakePages,lambda:True);self.events=[];self.wait_calls=[]
    def guard(self,*_,**__):pass
    def capture(self,record=True):self.frame_captured_at=engine.time.monotonic()
    def emit(self,kind,data=None,image=False,ignore_cancel=False):self.events.append((kind,data or {}));return {}
    def wait(self,predicate,label,**kwargs):
        self.wait_calls.append((label,kwargs))
        return super().wait(predicate,label,**kwargs)
    def wait_popup(self,timeout=20):self.wait(lambda:self.pages.page() in ('overload','non_overload','equipment_unknown'),'popup',initial=0,confirmations=1,record=False)

saved_sleep=engine.time.sleep;saved_candidates=engine.candidates
engine.time.sleep=lambda _:None
try:
    root=project.parent/'codex temp/nikke-desktop/automation-dev-copy'
    folder=Path(tempfile.mkdtemp(prefix='collection-engine-',dir=root))
    request={'characters':[roster['桃乐丝'],roster['红莲']],'target':{'hwnd':'123','pid':123},'ownerPid':1}
    test=TestCollector(request,folder)
    def items(_,details=True):
        character=roster[test.s.query]
        if test.s.query=='桃乐丝':assert not details,'Unique result must skip icon recognition'
        a={'box':[80,389,128,218],'element':character['element'],'burst':character['use_burst_skill']}
        return [a] if test.s.query=='桃乐丝' else [a,{**a,'box':[229,389,128,218]}]
    engine.candidates=items;test.run()
    assert test.state['phase']=='completed',test.state
    assert test.s.page=='hall'
    equipment=[data for kind,data in test.events if kind=='equipment'];assert len(equipment)==4,equipment
    assert equipment[0]['classification']=='unequipped';assert equipment[1]['classification']=='non_overload'
    assert [kind for kind,_ in test.events].count('character')==1
    assert [kind for kind,_ in test.events].count('skipped')==1
    assert any(kind=='done' and data['returnedToLobby'] for kind,data in test.events)
    assert not any(label=='确认list' for label,_ in test.wait_calls)
    returns=[kwargs for label,kwargs in test.wait_calls if label=='确认返回列表']
    assert len(returns)==1 and returns[0]['record'] is False and returns[0]['initial']==.15 and returns[0]['interval']==.2
    actions=[json.loads(line) for line in (folder/'actions.jsonl').read_text('utf-8').splitlines()]
    assert all('click' in event for event in actions if event['action']!='输入角色名')
    assert not any('升级' in str(value) or '交换' in str(value) for value in test.s.inputs)
    # Same full program with a completed checkpoint must not reread that role.
    second=TestCollector({**request,'completedCodes':[roster['桃乐丝']['nameCode']]},folder)
    def items2(_,details=True):
        c=roster[second.s.query];return [{'box':[80,389,128,218],'element':c['element'],'burst':c['use_burst_skill']},{'box':[229,389,128,218],'element':c['element'],'burst':c['use_burst_skill']}]
    engine.candidates=items2;second.run()
    assert second.state['phase']=='completed';assert not any(kind=='equipment' for kind,_ in second.events)
    print(json.dumps({'passed':True,'fullAutomaticFlow':True,'skipAmbiguous':True,'nonT10':True,'unequipped':True,'returnedHall':True,'resumeNoDuplicate':True,'noDuplicateListVerification':True,'shortBoundedReturnPoll':True,'clickCoordinatesLogged':True,'gameInputs':0,'evidence':str(folder)}))
finally:engine.time.sleep=saved_sleep;engine.candidates=saved_candidates
