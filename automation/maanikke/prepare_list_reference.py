"""Create recognition templates from the user's list-page reference, no game input."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parent
source=Path(sys.argv[1]); cache=Path(sys.argv[2]);cache.mkdir(parents=True,exist_ok=True)
shutil.copyfile(source,cache/'list-reference.png')
image=Image.open(source).convert('RGB')
if image.size!=(1920,1080):raise ValueError('Expected supplied 1920x1080 list reference')
image=image.resize((1280,720),Image.Resampling.LANCZOS)
dest=ROOT/'resource/image/photos';dest.mkdir(parents=True,exist_ok=True)
# Coordinates are on the normalized reference, never used as click coordinates.
regions={
 'header':(17,16,76,36), 'toolbar':(448,130,832,163),
 'search':(456,136,482,158), 'burst1':(505,136,520,157),
 'burst2':(548,136,566,157), 'burst3':(591,136,612,157),
 'favorite':(633,137,654,157), 'circle':(675,138,691,155),
}
definitions={
 'PhotosListTitle':{'type':'OCR','param':{'roi':[0,0,100,45],'expected':['^妮姬$'],'threshold':0.8}},
 'PhotosListSort':{'type':'OCR','param':{'roi':[710,125,125,45],'expected':['战斗力'],'threshold':0.8}},
}
names={'header':'Header','toolbar':'Toolbar','search':'Search','burst1':'BurstI','burst2':'BurstII','burst3':'BurstIII','favorite':'Favorite','circle':'Circle'}
hashes={}
for key,box in regions.items():
    name=f'photos/list-{key}.png';file=ROOT/'resource/image'/name
    image.crop(box).save(file)
    hashes[name]=hashlib.sha256(file.read_bytes()).hexdigest()
    definitions['PhotosList'+names[key]]={'type':'TemplateMatch','param':{'template':[name],
      'roi':[0,0,110,50] if key=='header' else [442,120,400,55], 'threshold':[0.86]}}
(ROOT/'list-definitions.json').write_text(json.dumps(definitions,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
pipeline=ROOT/'resource/pipeline/photos.json'
nodes=json.loads(pipeline.read_text('utf-8'))
for key,reco in definitions.items():nodes[key]={'recognition':reco,'action':{'type':'DoNothing'},'next':[]}
pipeline.write_text(json.dumps(nodes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'list-reference-provenance.json').write_text(json.dumps({'source':'User supplied list page reference (2026-10-27)',
 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'size':[1920,1080],'normalizedSize':[1280,720],
 'regions':regions,'templateHashes':hashes},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'nodes':list(definitions),'templates':len(hashes)}))
