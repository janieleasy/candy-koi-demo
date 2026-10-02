import sys
from PIL import Image
import numpy as np
f=sys.argv[1]
im=np.asarray(Image.open(f).convert('RGB')).astype(float)
H,W,_=im.shape
def reg(name,y0,y1,x0=0,x1=1):
    r=im[int(y0*H):int(y1*H), int(x0*W):int(x1*W)]
    lum=(r*[.299,.587,.114]).sum(-1)
    print(f'{name:10s} mean={lum.mean():6.1f} p95={np.percentile(lum,95):6.1f} white%={(lum>235).mean()*100:5.1f}  rgb={r.reshape(-1,3).mean(0).round(0)}')
reg('title',0.30,0.42); reg('number',0.42,0.50); reg('hero/low',0.5,0.8); reg('top',0.0,0.2); reg('all',0,1)
