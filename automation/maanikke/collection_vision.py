"""Small deterministic image helpers for the supported 1920x1080 layout."""
import re
import random
from pathlib import Path
import numpy as np
from PIL import Image

ASSETS=Path(__file__).resolve().parent/'resource/image/collection'

def normalized_name(text):
    return re.sub(r'[^\u3400-\u9fffA-Za-z0-9]','',text).lower()

def name_fragment_matches(target,text):
    target=normalized_name(target);text=normalized_name(text)
    if len(target)==1:return text==target
    variants=[text,text[1:],text[:-1]]
    return any(len(v)>=2 and (v in target or target in v) for v in variants)

def safe_point(box,rng=None):
    x,y,w,h=box
    if not all(np.isfinite(v) for v in box) or w<2 or h<2 or x<0 or y<0 or x+w>1920 or y+h>1080:
        raise ValueError('点击目标框无效')
    rng=rng or random.SystemRandom()
    return round(rng.uniform(x+w*.25,x+w*.75)),round(rng.uniform(y+h*.25,y+h*.75))

def template_score(image,template):
    """NCC of a small RGB template over a tightly bounded icon ROI."""
    if image.shape[0]<template.shape[0] or image.shape[1]<template.shape[1]:return -1
    a=np.mean(image.astype(np.float32),axis=2)
    b=np.mean(template.astype(np.float32),axis=2);b=b-b.mean()
    windows=np.lib.stride_tricks.sliding_window_view(a,b.shape)
    centered=windows-windows.mean(axis=(-2,-1),keepdims=True)
    denominator=np.sqrt(np.sum(centered**2,axis=(-2,-1))*np.sum(b**2))
    scores=np.sum(centered*b,axis=(-2,-1))/np.maximum(denominator,1)
    return float(scores.max())

def element(image,box):
    x,y,w,h=map(int,box);rgb=image[y:y+h,x:x+w,::-1].astype(np.int16)
    maximum=rgb.max(axis=2);minimum=rgb.min(axis=2)
    mask=(maximum-minimum>55)&(maximum>80)
    if mask.sum()<8:return None
    r,g,b=np.median(rgb[mask],axis=0)
    if g>r*1.3 and g>b*1.15:return 'Wind'
    if b>r*1.4 and b>g*1.05:return 'Water'
    if r>b*1.5 and g>b*1.2 and r>g*1.1:return 'Iron'
    if r>b*1.7 and r>g*1.6:return 'Fire'
    if r>g*1.5 and b>g*1.5:return 'Electronic'
    return None

def popup_surface_ready(image):
    """Blank modal margins must be opaque, not the character underneath."""
    if image is None or image.shape[:2]!=(1080,1920):return False
    for x in (704,1204):
        strip=image[180:900:4,x:x+10]
        if np.median(strip)<225 or np.percentile(strip,10)<215:return False
    return True

def popup_signature(image):
    # Restrict comparison to the modal; the animated character outside it is
    # irrelevant. Subsampling makes this much cheaper than another OCR pass.
    return image[95:935:5,725:1195:5].astype(np.int16)

def popup_unchanged(previous,current):
    delta=np.abs(current-previous)
    return float(delta.mean())<=1.5 and float((delta>12).mean())<=.02

BURSTS={name:np.asarray(Image.open(ASSETS/('burst-'+name+'.png')).convert('RGB'))[:,:,::-1] for name in ['Step1','Step2','Step3','AllStep']}

def card_geometry_present(image,x,y,gray=None):
    """Recognize the card frame, independently of portrait color or texture."""
    if image is None or image.shape[:2]!=(1080,1920):return False
    if gray is None:gray=image.mean(axis=2)
    # Compare three continuous frame edges with the nearby canvas. Multiple
    # samples across each edge tolerate the supported layout's small offsets.
    surrounding=np.concatenate((gray[y+24:y+194,x-9:x-3].ravel(),gray[y+24:y+194,x+133:x+140].ravel()))
    threshold=float(np.percentile(surrounding,75))-20
    left=(gray[y+20:y+200,x-1:x+6]<threshold).mean(axis=0).max()
    right=(gray[y+20:y+200,x+122:x+130]<threshold).mean(axis=0).max()
    bottom=(gray[y+207:y+219,x+12:x+116]<threshold).mean(axis=1).max()
    return min(float(left),float(right),float(bottom))>=.8


def popup_outside_box(close_box):
    """Blank overlay corridor, separate from the modal and detail controls."""
    x,y,w,h=close_box
    box=[x+w+90,y+h+220,160,260]
    bx,by,bw,bh=box
    if bx<1260 or bx+bw>1470 or by<250 or by+bh>750:return None
    return box


def candidates(image,details=True):
    if image is None or image.shape[:2]!=(1080,1920):return []
    gray=image.mean(axis=2)
    found=[]
    for row in range(2):
        y=389+252*row
        for column in range(12):
            x=80+149*column
            if not card_geometry_present(image,x,y,gray):continue
            if not details:
                found.append({'box':[x,y,128,218]});continue
            icon=image[y+54:y+100,x:x+39]
            ranks=sorted([(template_score(icon,t),name) for name,t in BURSTS.items()],reverse=True)
            burst=ranks[0][1] if ranks[0][0]>.76 and ranks[0][0]-ranks[1][0]>.025 else None
            found.append({'box':[x,y,128,218],'element':element(image,[x+2,y,30,31]),'burst':burst,'burstScores':ranks})
    return found

def choose_candidate(items,character):
    if len(items)==1:return items[0], 'unique-query-result'
    canonical=lambda value:'Electronic' if value in ('Electric','Electronic') else value
    matching_element=[item for item in items if canonical(item.get('element'))==canonical(character['element'])]
    matches=[item for item in matching_element if item.get('burst')==character['use_burst_skill']]
    if len(matches)==1:return matches[0], 'element-and-burst'
    if len(matching_element)==1 and all(item.get('element') for item in items) and matching_element[0].get('burst') in (None,character['use_burst_skill']):
        return matching_element[0], 'unique-element'
    exact=[item for item in matching_element if normalized_name(item.get('name',''))==normalized_name(character['nameCn']) and (item.get('burst') in (None,character['use_burst_skill']))]
    if len(exact)==1:return exact[0], 'exact-name-and-element'
    raise RuntimeError('搜索候选无法唯一确认，不默认点击第一名')
