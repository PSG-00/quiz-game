"""Additional May SD variant: ash bob, V-neck knit, shirt/tie, pleated skirt, leg warmers and loafers."""
import bpy,bmesh,os,math
from mathutils import Vector
from math import sin,cos,pi
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','may-school-sd');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','may-sd','may-outfit-source.blend'))
bpy.context.preferences.filepaths.save_version=0
wig=bpy.data.objects['Liv_Wig_Complete_New_Model'];hairnames={o.name for o in wig.children}
for o in list(bpy.context.scene.objects):
 if o!=wig and o.name not in hairnames and not o.name.startswith(('Adapted original anime face','Original hands')):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
# Bring back the detailed anatomical legs (the first May outfit covered them in trousers).
with bpy.data.libraries.load(os.path.join(ROOT,'modeling','liv-v5','liv-solid-anime-wig-v5.blend'),link=False) as (available,loaded):
 loaded.objects=[n for n in available.objects if n.startswith('Original leg geometry')]
for o in loaded.objects:
 if o:scene.collection.objects.link(o)

def mat(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.9;return m
skin=mat('Soft peach skin',(.66,.44,.36));knit=mat('Soft grey lavender sweater',(.29,.27,.34));rib=mat('Grey lavender ribbing',(.235,.215,.28));shirt=mat('Pale blue shirt',(.63,.73,.82));skirt=mat('Sand taupe pleated skirt',(.34,.255,.195));skirtshade=mat('Pleat shadow',(.255,.185,.145));ivory=mat('Warm white leg warmers',(.81,.78,.71));black=mat('Black leather loafers',(.015,.017,.024));sole=mat('Dark loafer soles',(.007,.008,.012));tie=mat('Muted lavender tie',(.17,.17,.27));tiestripe=mat('Ivory tie stripes',(.69,.72,.79));silver=mat('Silver earrings',(.56,.59,.63))
for o in scene.objects:
 if o.name.startswith(('Original hands','Original leg geometry')):
  o.data.materials.clear();o.data.materials.append(skin)
  for p in o.data.polygons:p.material_index=0
# Smooth anatomical seams and remove the old base's feet, which would protrude
# through the new low-cut loafer toe boxes.
for obj in scene.objects:
 if obj.name.startswith('Original leg geometry'):
  bm=bmesh.new();bm.from_mesh(obj.data)
  bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<.15],context='VERTS')
  bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(obj.data);bm.free()
  for polygon in obj.data.polygons:polygon.use_smooth=True
# Repaint the full wig to an ash/light brown, avoiding stage-light purple skin.
hair=next(o for o in wig.children if o.type=='MESH').data.materials[0]
for n in hair.node_tree.nodes:
 if n.type=='VALTORGB':
  n.color_ramp.elements[0].color=(.075,.047,.035,1);n.color_ramp.elements[1].color=(.28,.205,.16,1)
for o in wig.children:
 if o.type=='MESH' and o.name.startswith('Bob complete'):
  for v in o.data.vertices:
   if v.co.z<1.435:
    t=max(0,min(1,(1.435-v.co.z)/.06));v.co.x*=1+.11*t*t
wig['variant']='Ash bob with gently turned-out ends'

def mesh(name,v,f,m,sub=0):
 d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);d.materials.append(m)
 for p in d.polygons:p.use_smooth=True
 if sub:mod=o.modifiers.new('Soft tailored surface','SUBSURF');mod.levels=sub
 return o

def tube(name,points,radius,material):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=radius;d.bevel_resolution=2;d.resolution_u=12;s=d.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);d.materials.append(material);return o

def ball(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 return o

def rings(name,levels,material,cx=0,fold=0,n=64,sub=1):
 v=[];f=[]
 for z,rx,ry,cy in levels:
  for j in range(n):a=j*2*pi/n;w=1+fold*cos(14*a);v.append((cx+rx*cos(a)*w,cy+ry*sin(a)*w,z))
 for k in range(len(levels)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 return mesh(name,v,f,material,sub)
# Oversized knit body with a true V-shaped front opening, not a painted triangle.
levels=[(1.002,.153,.098,0),(1.01,.156,.102,0),(1.04,.159,.106,0),(1.09,.160,.112,0),(1.15,.165,.119,-.003),(1.21,.169,.123,-.003),(1.24,.164,.117,0)]
v=[];f=[];count=96
for z,rx,ry,cy in levels:
 for j in range(count):a=j*2*pi/count;v.append((rx*cos(a),cy+ry*sin(a),z))
for j in range(count):
 a=j*2*pi/count;front=max(0,-sin(a));v.append((.072*cos(a),(.047+.079*front**2)*sin(a),1.347-.094*front**2))
for k in range(len(levels)):
 for j in range(count):a=k*count+j;b=k*count+(j+1)%count;f.append((a,b,b+count,a+count))
o=mesh('Oversized V-neck knit torso',v,f,knit,2)
mod=o.modifiers.new('Knit fabric thickness','SOLIDIFY');mod.thickness=.002
rings('Sweater relaxed rib hem',[(1.001,.154,.100,0),(1.008,.157,.103,0),(1.03,.157,.104,0)],rib)
tube('V-neck rib border',[(-.072,-.002,1.347),(-.060,-.065,1.321),(-.036,-.111,1.277),(0,-.128,1.25),(.036,-.111,1.277),(.060,-.065,1.321),(.072,-.002,1.347)],.006,rib)
# Shirt chest, pointed collar and hem hanging below the knit.
mesh('Shirt visible chest',[(-.07,-.046,1.351),(.07,-.046,1.351),(.05,-.109,1.279),(0,-.126,1.244),(-.05,-.109,1.279)],[(0,1,2,3,4)],shirt)
rings('Shirt collar stand',[(1.345,.048,.040,0),(1.366,.047,.038,0)],shirt)
for s in [-1,1]:
 o=mesh('Shirt pointed collar '+str(s),[(s*.006,-.047,1.355),(s*.045,-.041,1.366),(s*.081,-.058,1.326),(s*.045,-.10,1.292),(s*.019,-.079,1.331)],[(0,1,2,3,4)],shirt)
 sol=o.modifiers.new('Crisp collar thickness','SOLIDIFY');sol.thickness=.0018
rings('Untucked blue shirt hem',[(.962,.150,.099,0),(.97,.153,.101,0),(1.015,.151,.100,0)],shirt)
mesh('Shirt split hem left',[(-.145,-.082,.985),(-.008,-.105,.985),(-.016,-.108,.949),(-.123,-.085,.955)],[(0,1,2,3)],shirt)
mesh('Shirt split hem right',[(.008,-.105,.985),(.145,-.082,.985),(.124,-.085,.95),(.017,-.108,.957)],[(0,1,2,3)],shirt)
ball('Tie small knot',(0,-.076,1.323),(.019,.010,.018),tie)
mesh('Tie blade',[(-.010,-.084,1.318),(.010,-.084,1.318),(.020,-.116,1.268),(0,-.131,1.245),(-.020,-.116,1.268)],[(0,1,2,3,4)],tie)
for z in [1.277,1.30]:tube('Tie diagonal stripe',[(-.012,-(.084+(1.318-z)*.65)-.003,z+.006),(.012,-(.084+(1.318-z)*.65)-.003,z-.006)],.0013,tiestripe)
# Oversized sleeves, wrist cuffs and softly rounded dropped shoulders.
for side in [-1,1]:
 start=Vector((side*.15,.006,1.302));end=Vector((side*.280,.001,.93));direction=(end-start).normalized();axis=Vector((0,1,0));cross=direction.cross(axis).normalized();v=[];f=[];n=48
 profile=[(0,.064),(.03,.067),(.18,.070),(.4,.065),(.6,.059),(.77,.055),(.90,.049),(1,.043)]
 for t,r in profile:
  c=start.lerp(end,t)
  for j in range(n):a=j*2*pi/n;wrinkle=1+.035*sin(3*a+20*t)*sin(pi*t);v.append(c+(axis*cos(a)+cross*sin(a))*r*wrinkle)
 for k in range(len(profile)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
 mesh('Long cardigan sleeve '+str(side),v,f,knit,2)
 ball('Soft cardigan shoulder '+str(side),(side*.145,.006,1.30),(.065,.068,.064),knit)
 for t in [.925,.95,.975,1.0]:
  c=start.lerp(end,t);tube('Sleeve cuff rib '+str(side)+' '+str(t),[c+(axis*cos(a)+cross*sin(a))*.044 for a in [j*2*pi/40 for j in range(41)]],.0016,rib)
# Two overlapping tiers of individually folded pleats; actual pleat faces, no printed lines.
for tier,(top,bottom,rt,rb) in enumerate([(.998,.823,.139,.208),(.883,.752,.190,.223)]):
 v=[];f=[];n=80
 for z,r in [(bottom,rb),(bottom+.004,rb),(top-.004,rt),(top,rt)]:
  for j in range(n):
   a=j*2*pi/n;step=j%4;depth=[1.035,1.035,.94,.94][step];v.append((r*cos(a)*depth,.006+r*.65*sin(a)*depth,z))
 for k in range(3):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 o=mesh('Layered pleated taupe skirt '+str(tier),v,f,skirt);o.data.materials.append(skirtshade)
 for p in o.data.polygons:p.material_index=1 if p.index%4==1 else 0;p.use_smooth=False
 solid=o.modifiers.new('Pleat cloth edge','SOLIDIFY');solid.thickness=.0014
# Loose white leg warmers with stacked folds, and low-cut loafers.
for s in [-1,1]:
 rings('Leg warmer '+str(s),[(.135,.045,.052,-.002),(.15,.055,.054,0),(.174,.057,.055,0),(.19,.047,.048,0),(.218,.061,.056,0),(.238,.053,.049,0),(.27,.050,.048,0),(.296,.061,.055,0),(.316,.052,.048,0),(.35,.048,.046,0),(.38,.051,.047,0),(.401,.048,.045,0)],ivory,cx=s*.095,fold=.025)
 rings('Leg warmer top rib '+str(s),[(.386,.050,.047,0),(.410,.049,.046,0)],ivory,cx=s*.095)
 ball('Loafer sole '+str(s),(s*.095,-.038,.022),(.055,.108,.022),sole)
 ball('Loafer upper '+str(s),(s*.095,-.043,.073),(.052,.103,.056),black)
 ball('Loafer heel '+str(s),(s*.095,.029,.042),(.048,.040,.040),black)
 tube('Loafer penny strap '+str(s),[(s*.095-.046,-.050,.084),(s*.095-.025,-.06,.109),(s*.095+.025,-.06,.109),(s*.095+.046,-.05,.084)],.0055,black)
 tube('Silver small hoop '+str(s),[(s*(.105+.009*cos(a)),-.013,1.482+.013*sin(a)) for a in [j*2*pi/28 for j in range(29)]],.0018,silver)
# A compact stage headset sits beside the cheek and leaves the eyes unobstructed.
tube('Stage headset wire',[(.103,-.008,1.49),(.106,-.052,1.474),(.080,-.095,1.456),(.041,-.115,1.45)],.0017,black)
ball('Stage microphone capsule',(.041,-.116,1.45),(.008,.006,.006),black)
scene['reference']='May school stage look: ash bob, grey-lavender knit, shirt and tie, taupe pleated skirt, white leg warmers, black loafers'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'may-school-outfit-source.blend'))
source=open(os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),encoding='utf-8').read()
source=source.replace("'modeling','liv-v5','liv-solid-anime-wig-v5.blend'","'modeling','may-school-sd','may-school-outfit-source.blend'")
source=source.replace("'modeling','liv-sd-v6'","'modeling','may-school-sd'").replace('liv-sd-v6','may-school-sd-v1').replace('liv-v5-','may-school-sd-v1-')
source=source.replace("'Platform boot sole'))","'Platform boot sole','Leg warmer','Loafer'))")
source=source.replace("'Liv v5 solid anime hair'","'May school ash bob'").replace("'Liv_Approved_Anime_v5'","'May_School_SD_Character'").replace("'opaque solid bangs, no cheek-side locks'","'opaque ash bob with gently turned-out ends'")
source=source.replace("bake(part,'may-school-sd-v1-'+name,1024 if name=='Body' else 512,True,True)","bake(part,'may-school-sd-v1-'+name,1024 if name=='Body' or name.startswith('Leg') else 512,True,True,fresh_uv=name.startswith('Leg'))")
source=source.replace('may-school-sd-v1','may-school-sd-v2')
exec(compile(source,os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),'exec'))
