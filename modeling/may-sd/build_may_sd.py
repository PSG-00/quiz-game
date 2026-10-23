"""New opaque bob wig, striped camisole and wide-leg trousers on the shared anime base.
Reference: the two user-provided photographs. Uses the existing SD export/rig map.
"""
import bpy, math, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from math import sin, cos, pi
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','may-sd');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v5','liv-solid-anime-wig-v5.blend'))
bpy.context.preferences.filepaths.save_version=0
# Retain only the textured anime face, detailed relaxed hands and shoe topology.
for o in list(bpy.context.scene.objects):
 if not o.name.startswith(('Adapted original anime face','Original hands','Original detailed shoes')):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene

def mat(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.85;return m
skin=mat('Warm peach skin',(.66,.44,.36));navy=mat('Deep navy fabric',(.014,.027,.095));white=mat('Soft ivory stripes',(.88,.88,.81));sand=mat('Warm beige wide trousers',(.48,.41,.28));seam=mat('Beige seams',(.35,.29,.19));silver=mat('Silver jewelry',(.61,.64,.67));sole=mat('Ivory sneaker soles',(.73,.71,.64))
hair=mat('Chestnut anime bob',(.095,.048,.026))
# A soft normal-based painted gradient, baked into the opaque hair atlas.
n=hair.node_tree.nodes;l=hair.node_tree.links;p=n.get('Principled BSDF');g=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.35,-.65,.72)).normalized();l.new(g.outputs['Normal'],dot.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.interpolation='EASE';r.color_ramp.elements[0].position=-.3;r.color_ramp.elements[0].color=(.037,.016,.009,1);r.color_ramp.elements[1].position=.8;r.color_ramp.elements[1].color=(.15,.081,.044,1);l.new(dot.outputs['Value'],r.inputs[0]);l.new(r.outputs[0],p.inputs['Base Color'])

def mesh(name,v,f,m,sub=0):
 d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);d.materials.append(m)
 for q in d.polygons:q.use_smooth=True
 if sub:mod=o.modifiers.new('Smooth sculpted surface','SUBSURF');mod.levels=sub
 return o

def tube(name,points,radius,material):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=radius;d.bevel_resolution=2;d.resolution_u=12;s=d.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);d.materials.append(material);return o

def ball(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o

def rings(name,levels,material,cx=0,fold=0):
 v=[];f=[];count=64
 for z,rx,ry,cy in levels:
  for j in range(count):
   a=j*2*pi/count;w=1+fold*(.65*cos(10*a)+.35*sin(7*a+z*9));v.append((cx+rx*cos(a)*w,cy+ry*sin(a)*w,z))
 for k in range(len(levels)-1):
  for j in range(count):a=k*count+j;b=k*count+(j+1)%count;f.append((a,b,b+count,a+count))
 return mesh(name,v,f,material,1)

# Independent complete bob: rounded crown, broad curved side/back masses and solid bangs.
wig=bpy.data.objects.new('Liv_Wig_Complete_New_Model',None);scene.collection.objects.link(wig);wig['style']='New chestnut chin-length bob, opaque sculpted clumps'
v=[];f=[];rows=40;cols=96
for k in range(rows+1):
 t=k/rows
 for j in range(cols):
  a=j*2*pi/cols;angle=abs(math.atan2(sin(a),cos(a)));front=max(0,min(1,(1.40-angle)/.43));front=front*front*(3-2*front);bottom=1.375+.214*front+.012*sin(a)**2
  z=1.704+(bottom-1.704)*t
  if z>=1.56:width=math.sqrt(max(.00001,1-((z-1.56)/.145)**2))
  else:width=1-.24*((1.56-z)/.19)**2
  relief=.0024*cos(10*a)*sin(pi*t)**2
  x=(.126*width+relief)*sin(a);y=.014-(.118*width+relief)*cos(a)
  # Round the lower cut inward rather than making a flat helmet edge.
  x*=1-.065*max(0,(t-.86)/.14)**2;y+=.006*max(0,(t-.84)/.16)**2*cos(a)
  v.append((x,y,z))
for k in range(rows):
 for j in range(cols):a=k*cols+j;b=k*cols+(j+1)%cols;f.append((a,a+cols,b+cols,b))
cap=mesh('Bob complete rounded crown and inward-curved ends',v,f,hair,1);cap.parent=wig
head=next(o for o in scene.objects if o.name.startswith('Adapted original anime face'));bpy.context.view_layer.update();bvh=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
def bez(a,b,c,d,t):return a*(1-t)**3+b*(3*t*(1-t)**2)+c*(3*t*t*(1-t))+d*t**3
# Seven readable, connected anime locks; no individual fiber geometry.
for i,(start,end,width) in enumerate([(-.04,-.102,.025),(-.026,-.073,.026),(-.012,-.039,.023),(.003,-.008,.023),(.019,.028,.025),(.034,.061,.027),(.045,.100,.025)]):
 v=[];f=[];nr=28;nc=10
 for k in range(nr+1):
  t=k/nr;center=bez(Vector((start,-.017,1.702-.012*(start/.045)**2)),Vector((start*.9,-.083,1.68)),Vector((end*.9,-.133,1.60)),Vector((end,-.112 if abs(end)<.08 else -.075,1.545+abs(end)*.15)),t)
  w=width*(.65+.35*sin(pi*t))*math.sqrt(max(0,1-t**4))
  for j in range(nc+1):
   u=2*j/nc-1;p=center.copy();p.x+=u*w;p.y-=.003*(1-u*u)*sin(pi*t)
   q=1-(p.x/.129)**2-((p.z-1.56)/.145)**2
   if q>0:p.y=min(p.y,.014-.12*math.sqrt(q)-.002)
   hit=bvh.ray_cast(Vector((p.x,-.5,p.z)),Vector((0,1,0)),1)
   if hit[0] is not None and p.z<1.64:p.y=min(p.y,hit[0].y-.006)
   v.append(p)
 for k in range(nr):
  for j in range(nc):a=k*(nc+1)+j;f.append((a,a+nc+1,a+nc+2,a+1))
 o=mesh('Bob sculpted fringe '+str(i),v,f,hair,1);o.parent=wig;mod=o.modifiers.new('Opaque hair thickness','SOLIDIFY');mod.thickness=.0015
# Skin torso and cropped striped top. Shoulder blades remain bare.
rings('Bare torso and shoulders',[(.91,.128,.080,0),(.95,.122,.078,0),(1.01,.104,.068,0),(1.08,.108,.073,0),(1.15,.119,.087,-.006),(1.23,.136,.102,-.007),(1.29,.137,.077,0),(1.32,.130,.061,0),(1.35,.077,.045,0),(1.385,.042,.037,0)],skin)
def top_profile(z):
 return .113+(z-1.055)/.22*.023,.080+(z-1.055)/.22*.023,-.008
for i,(lo,hi,m) in enumerate([(1.055,1.158,navy),(1.158,1.176,white),(1.176,1.192,navy),(1.192,1.234,white),(1.234,1.246,navy),(1.246,1.258,white),(1.258,1.276,navy)]):
 levels=[]
 for z in [lo,lo+.001,(lo+hi)/2,hi-.001,hi]:
  rx,ry,cy=top_profile(z);levels.append((z,rx+.004,ry+.004,cy))
 rings('Camisole stripe '+str(i),levels,m)
for s in [-1,1]:
 ball('Bare arm shoulder '+str(s),(s*.143,.006,1.30),(.046,.046,.046),skin)
 tube('Navy thin shoulder strap '+str(s),[(s*.112,-.079,1.265),(s*.119,-.047,1.315),(s*.116,.004,1.334),(s*.112,.063,1.305),(s*.108,.075,1.26)],.0045,navy)
 # Bare arm follows the original relaxed hand pose and existing elbow rig.
 start=Vector((s*.144,.006,1.304));end=Vector((s*.292,0,.884));axis=(end-start).normalized();tangent=axis.cross(Vector((0,1,0))).normalized();v=[];f=[];count=40
 for t,radius in [(0,.047),(.06,.048),(.24,.043),(.47,.035),(.55,.032),(.76,.030),(1,.026)]:
  c=start.lerp(end,t)
  for j in range(count):a=j*2*pi/count;v.append(c+(Vector((0,1,0))*cos(a)+tangent*sin(a))*radius)
 for k in range(6):
  for j in range(count):a=k*count+j;b=k*count+(j+1)%count;f.append((a,a+count,b+count,b))
 f.append(tuple(range(count-1,-1,-1)));mesh('Bare arm '+str(s),v,f,skin,1)
 # Wide trousers have two full-volume separate legs, not a skirt.
 rings('Wide trouser leg '+str(s),[(.12,.086,.074,-.003),(.128,.087,.075,-.003),(.19,.085,.076,0),(.36,.082,.076,0),(.53,.085,.079,0),(.68,.088,.080,0),(.81,.091,.083,0),(.88,.087,.080,0)],sand,cx=s*.094,fold=.035)
 rings('Trouser hem '+str(s),[(.121,.087,.076,-.003),(.135,.088,.077,-.003)],sand,cx=s*.094)
 tube('Trouser outside seam '+str(s),[(s*.180,0,.14),(s*.177,0,.4),(s*.184,0,.7),(s*.18,0,.87)],.00065,seam)
 # Hoop earrings and a fine bracelet, matching the supplied reference.
 tube('Silver hoop earring '+str(s),[(s*(.105+.012*cos(a)),-.012,1.482+.016*sin(a)) for a in [j*2*pi/32 for j in range(33)]],.0018,silver)
 if s==1:tube('Wrist chain',[(s*.283+.027*cos(a),.028*sin(a),.93) for a in [j*2*pi/32 for j in range(33)]],.0011,silver)
rings('Relaxed trouser hips',[(.81,.175,.089,0),(.86,.179,.092,0),(.93,.154,.091,0),(.98,.135,.084,0)],sand,fold=.015)
rings('Gathered elastic waistband',[(.956,.140,.087,0),(.964,.138,.086,0),(.983,.134,.084,0),(.988,.133,.083,0)],sand,fold=.025)
for x in [-.083,.083]:ball('Waistband button',(x,-.078,.966),(.006,.0025,.006),seam)
tube('Waist drawstring',[(0,-.087,.973),(-.012,-.091,.947),(-.008,-.093,.921)],.0018,white)
# Small clean shield badge with a stylized star rather than unreadable microtext.
badge=mesh('Ivory crest patch',[(-.024,-.119,1.241),(.024,-.119,1.241),(.021,-.12,1.208),(0,-.121,1.194),(-.021,-.12,1.208)],[(0,1,2,3,4)],white)
v=[(0,-.123,1.22)]+[(sin(j*pi/5)*(.013 if j%2==0 else .006),-.123,1.22+cos(j*pi/5)*(.013 if j%2==0 else .006)) for j in range(10)];mesh('Navy embroidered crest star',v,[(0,j+1,(j+1)%10+1) for j in range(10)],navy)
tube('Fine silver necklace',[(-.044,-.014,1.382),(-.055,-.041,1.36),(0,-.071,1.337),(.055,-.041,1.36),(.044,-.014,1.382)],.001,silver)
# No full-length shoe reference was supplied; use understated navy/ivory sneakers.
for o in scene.objects:
 if o.name.startswith('Original hands'):
  o.data.materials.clear();o.data.materials.append(skin)
  for p in o.data.polygons:p.material_index=0
 if o.name.startswith('Original detailed shoes'):
  o.data.materials.clear();o.data.materials.append(navy)
  for p in o.data.polygons:p.material_index=0
for s in [-1,1]:ball('Sneaker ivory sole '+str(s),(s*.096,-.033,.013),(.053,.108,.016),sole)
scene['reference']='User photographs: chestnut bob, navy/ivory striped crop top, wide beige trousers'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'may-outfit-source.blend'))
# Reuse the verified face bake, SD coordinate map and smooth walking rig.
source=open(os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),encoding='utf-8').read()
source=source.replace("'modeling','liv-v5','liv-solid-anime-wig-v5.blend'","'modeling','may-sd','may-outfit-source.blend'")
source=source.replace("'modeling','liv-sd-v6'","'modeling','may-sd'").replace('liv-sd-v6','may-sd-v1').replace('liv-v5-','may-sd-v1-')
source=source.replace("'Soft cardigan shoulder'))","'Soft cardigan shoulder','Bare arm','Wrist chain'))")
source=source.replace("'Platform boot sole'))","'Platform boot sole','Wide trouser leg','Trouser hem','Trouser outside seam','Sneaker ivory sole'))")
source=source.replace("'Liv v5 solid anime hair'","'Chestnut bob sculpted wig'").replace("'Liv_Approved_Anime_v5'","'May_SD_Character'").replace("'opaque solid bangs, no cheek-side locks'","'opaque chestnut chin-length bob'")
source=source.replace('may-sd-v1','may-sd-v2')
exec(compile(source,os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),'exec'))
