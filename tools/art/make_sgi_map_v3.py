# SGI interactive map v20 (v3 build: no ghost castle in the floor): cover v20 (text-free) on top, extended down to 16:9 with
# sgi-hero-v1's deep blue/purple lightning nebula band and navy floor carried in.
from PIL import Image, ImageFilter
import numpy as np
import os,sys
R=(sys.argv[1] if len(sys.argv)>1 else os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','assets'))+'/'
cov=Image.open(R+'v2/hero-cover-v20-textfree-1500x500.png').convert('RGB')
old=Image.open(R+'sgi-hero-v1-1600x900.png').convert('RGB')
W,H=1500,844; rng=np.random.default_rng(20)
y=np.arange(H)[:,None,None].astype(float)
# 1) navy floor: cover's bottom-left tone -> sgi-hero-v1's bottom navy (2,3,12)
t=np.clip((y-500)/(H-500),0,1)
img=(np.array([2,5,20])*(1-t)+np.array([2,3,12])*t)*np.ones((H,W,3))
# 2) procedural stars (no tiling seams)
n=900; xs=rng.integers(0,W,n); ys=rng.integers(480,H,n); br=rng.uniform(60,230,n)
for x0,y0,b in zip(xs,ys,br):
    img[y0,x0]=np.maximum(img[y0,x0],[b*.85,b*.9,b])
# 3) glossy reflection of the cover's beam floor so the beam/shield glow continues past the seam
refl=np.array(cov.crop((0,380,W,500)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(2)),float)
ra=(np.clip((620-np.arange(500,620))/120,0,1)**2.6)[:,None,None]*0.92   # v3: faster fade, no shield-ring ghost
img[500:620]=refl*ra+img[500:620]*(1-ra)   # mirror is continuous with the cover's last row
# 4) sgi-hero-v1's blue/purple lightning band (under its castle), mirrored, as the nebula floor
# v3: build the band only from sgi-hero-v1's lightning clouds left and right of its castle, so no castle
# towers/windows get mirrored into the floor (the v2 band, x 60-1400, ran straight under the castle).
Lp=np.array(old.crop((240,388,540,500)),float); Rp=np.array(old.crop((1110,388,1400,500)),float)
def join(pieces,ov=90):   # cross-fade neighbours over ov px so the mirrored tiles have no seams
    out=pieces[0]
    for q in pieces[1:]:
        w=np.linspace(0,1,ov)[None,:,None]
        out=np.concatenate([out[:,:-ov],out[:,-ov:]*(1-w)+q[:,:ov]*w,q[:,ov:]],axis=1)
    return out
band=Image.fromarray(join([Lp,Lp[:,::-1],Rp[:,::-1],Rp]).clip(0,255).astype('uint8'))
band=band.resize((W,150),Image.LANCZOS)
# mirrored copy on top + upright copy below: 300px of nebula without heavy vertical stretching
neb=np.concatenate([np.array(band.transpose(Image.FLIP_TOP_BOTTOM),float),np.array(band,float)],axis=0)
ny=np.arange(300)[:,None,None]
na=np.clip(ny/40,0,1)*np.clip((300-ny)/120,0,1)*0.95
# keep the blue/purple glow, drop grey castle-wall texture: weight by blue dominance (B - R)
blue=np.clip((neb[...,2:3]-neb[...,0:1]-8)/45,0,1)
img[470:770]=np.maximum(img[470:770],neb*na*blue)   # lighten blend
glow=np.array(band.resize((W,200)).filter(ImageFilter.GaussianBlur(18)),float)
gy=np.arange(200)[:,None,None]; ga=np.clip(gy/50,0,1)*np.clip((200-gy)/60,0,1)*0.6
img[630:830]=np.maximum(img[630:830],glow*ga)
# 5) cover v20 on top, whole; the mirrored floor (step 3) continues it, so there is no seam line
c=np.array(cov,float)
img[:500]=np.maximum(c,img[:500]*(np.arange(500)[:,None,None]>=470))   # cover kept whole; nebula may glow into its last 30px
# 6) soften where the reflection hands over to the nebula (around y 540)
pre=Image.fromarray(np.clip(img,0,255).astype('uint8'))
bl=np.array(pre.filter(ImageFilter.BoxBlur(0)).crop((0,430,W,590)).filter(ImageFilter.GaussianBlur((1,22)) if False else ImageFilter.GaussianBlur(14)),float)
sy=np.arange(430,590)[:,None,None]; sm=np.clip(1-np.abs(sy-540)/60,0,1)**1.2*0.6
img[430:590]=img[430:590]*(1-sm)+bl*sm
out=Image.fromarray(np.clip(img,0,255).astype('uint8'))
out.save(R+'v2/sgi-map-v20-1500x844.png',optimize=True)
out.save(R+'v2/sgi-map-v20-1500x844.webp',quality=85,method=6)
print(out.size)
