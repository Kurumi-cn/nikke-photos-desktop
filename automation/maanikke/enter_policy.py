"""Pure validation for the single user-triggered elevated navigation experiment."""
import math

def choose_point(recognition):
    if recognition['listPage']['verified']:
        raise RuntimeError('当前已在妮姬列表，未发送点击；请手动返回大厅后再触发新的测试')
    if not recognition['lobby'] or not recognition['nikkeLocated']:
        raise RuntimeError('未确认大厅或妮姬按钮，拒绝输入')
    # Require both OCR paths to agree on the actual bottom navigation text.
    direct=recognition['results']['PhotosNikkeText']
    agent=recognition['agentRotatedOCR']
    if not direct['hit'] or not agent['hit']:
        raise RuntimeError('妮姬双重文字识别未通过，拒绝输入')
    a,b=direct['box'],agent['box']
    if abs((a[0]+a[2]/2)-(b[0]+b[2]/2))>12 or abs((a[1]+a[3]/2)-(b[1]+b[3]/2))>12:
        raise RuntimeError('妮姬文字识别位置不一致，拒绝输入')
    w,h=recognition['originalSize']
    x,y,bw,bh=recognition['nikkeBox']
    point=(round(x+bw/2),round(y+bh/2))
    if not all(math.isfinite(v) for v in (x,y,bw,bh)) or bw<=0 or bh<=0 or not (0<=x<x+bw<=w and 0<=y<y+bh<=h):
        raise RuntimeError('妮姬命中框无效')
    if not (w*.32<point[0]<w*.46 and h*.87<point[1]<h):
        raise RuntimeError('命中点不在妮姬底部导航安全区域')
    return point

def validate_pair(first,second):
    a,b=choose_point(first),choose_point(second)
    if first['originalSize']!=second['originalSize'] or max(abs(a[i]-b[i]) for i in (0,1))>5:
        raise RuntimeError('两帧目标位置或画面尺寸不稳定，拒绝输入')
    return b
