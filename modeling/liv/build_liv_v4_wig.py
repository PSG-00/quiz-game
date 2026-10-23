"""A completely new standalone wig: scalp, swept groom, bangs, ponytail, bow.
No geometry from the blue-haired source hairstyle is retained.
"""
import bpy,bmesh,os,math,random
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','liv-v4');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v2','liv-anime-adapted-v2.blend'))
bpy.context.preferences.filepaths.save_version=0
removed=[]
for o in list(bpy.data.objects):
 if o.name.startswith(('Adapted original hair','Fine wispy fringe','Black satin bow','Ribbon hanging tail','Black bow knot')):
  removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
assert not any(o.name.startswith('Adapted original hair') for o in bpy.data.objects)
for o in bpy.data.objects:
 if o.name.startswith(('Pearl earring petal','Silver earring center')):
  o.location.z+=.048;o.location.x*=.95
collection=bpy.data.collections.new('Liv — independent complete wig');bpy.context.scene.collection.children.link(collection)
root=bpy.data.objects.new('Liv_Wig_Complete_New_Model',None);collection.objects.link(root)
random.seed(103)
def add(o):collection.objects.link(o);o.parent=root;return o
def material(name,col,rough=.75):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=max(.85,rough);p.inputs['Specular IOR Level'].default_value=.08
 return m
dark=material('New wig — deep warm brown',(.018,.009,.006))
bowmat=material('New wig — black satin ribbon',(.007,.008,.011),.65)
def mesh(name,v,f,m):
 d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=add(bpy.data.objects.new(name,d));d.materials.append(m)
 for p in d.polygons:p.use_smooth=True
 return o
def curves(name,radius):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=2;d.bevel_depth=radius;d.bevel_resolution=1;d.materials.append(dark);return add(bpy.data.objects.new(name,d))
def fiber(obj,points,radii):
 s=obj.data.splines.new('POLY');s.points.add(len(points)-1)
 for p,co,r in zip(s.points,points,radii):p.co=(*co,1);p.radius=r
def limit(phi):
 s=math.sin(phi)
 return 1.70-.74*(-s)**1.4 if s<0 else 1.70+.75*s
def scalp(direction,offset=0):
 q=Vector(direction).normalized();return Vector((q.x*(.119+offset),.014+q.y*(.125+offset),1.56+q.z*(.151+offset)))
def sphere(theta,phi):return Vector((math.sin(theta)*math.cos(phi),math.sin(theta)*math.sin(phi),math.cos(theta)))
# Thin complete scalp, fitted above the skull. The sides stop by the ears;
# there are deliberately no locks descending beside the cheeks.
v=[];f=[];fade=[];n=144;rows=42
for k in range(rows+1):
 for j in range(n):
  phi=j*math.tau/n;theta=.004+(limit(phi)-.004)*k/rows
  v.append(scalp(sphere(theta,phi)))
  edge=max(0,min(1,(k/rows-.70)/.30));edge=edge*edge*(3-2*edge)
  fade.append(1-edge*max(0,-math.sin(phi))**.3)
for k in range(rows):
 for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
cap=mesh('Wig — complete fitted scalp',v,f,dark)
bm=bmesh.new();bm.from_mesh(cap.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(cap.data);bm.free()
attribute=cap.data.color_attributes.new(name='SoftHairline',type='FLOAT_COLOR',domain='POINT')
for i,value in enumerate(fade):attribute.data[i].color=(value,value,value,1)
soft=dark.copy();soft.name='New wig — feathered hairline';cap.data.materials[0]=soft
nodes=soft.node_tree.nodes;links=soft.node_tree.links;surface=nodes.get('Principled BSDF');output=nodes.get('Material Output');color=nodes.new('ShaderNodeVertexColor');color.layer_name='SoftHairline';transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader');links.new(color.outputs['Color'],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(surface.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
# Swept scalp fibers flow from the hairline toward the tied section behind the head.
groom=curves('Wig — swept-back scalp fibers',.00010)
tie=Vector((0,.73,.685)).normalized()
for i in range(1900):
 phi=random.uniform(0,math.tau);theta=limit(phi)*random.uniform(.91,1)
 start=sphere(theta,phi);end=(tie+Vector((random.uniform(-.08,.08),random.uniform(-.015,.015),random.uniform(-.03,.03)))).normalized()
 points=[];r=[];size=random.uniform(.6,1.25)
 for k in range(27):
  t=k/26;q=(start*(1-t)+end*t).normalized();points.append(scalp(q,.0005+random.random()*.00015));r.append(size*(.82+.18*math.sin(math.pi*t)))
 fiber(groom,points,r)
# New airy fringe: many independent thin fibers, with varied lengths and curved flow.
head=next(o for o in bpy.data.objects if o.name.startswith('Adapted original anime face'))
bpy.context.view_layer.update();headsurface=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
bangs=curves('Wig — soft see-through bang fibers',.000085)
matte=bpy.data.materials.new('New wig — matte espresso fringe');matte.use_nodes=True
nodes=matte.node_tree.nodes;nodes.clear();diffuse=nodes.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(.012,.0055,.0035,1);diffuse.inputs['Roughness'].default_value=.75;output=nodes.new('ShaderNodeOutputMaterial');matte.node_tree.links.new(diffuse.outputs[0],output.inputs['Surface']);bangs.data.materials[0]=matte
def bez(a,b,c,d,t):return a*(1-t)**3+b*(3*(1-t)**2*t)+c*(3*(1-t)*t*t)+d*t**3
for group in range(82):
 center=(group-40.5)*.00232+random.uniform(-.00035,.00035)
 bottom=1.548+.019*(abs(center)/.098)**1.65+random.uniform(-.0035,.0035)
 bend=random.uniform(-.004,.004)
 for fine in range(16):
  x=center+(fine/15-.5)*.0021+random.uniform(-.00012,.00012)
  a=Vector((x*.40,-.014,1.704-.014*(abs(x)/.1)))
  b=Vector((x*.73+bend,-.094,1.686))
  c=Vector((x*1.04+bend,-.123,1.59))
  d=Vector((x+random.uniform(-.001,.001),-.123, bottom+random.uniform(-.003,.003)))
  points=[];r=[];size=random.uniform(.65,1.1)
  for k in range(33):
   t=k/32;p=bez(a,b,c,d,t)
   q=1-(p.x/.119)**2-((p.z-1.56)/.151)**2
   if q>0 and p.z>1.637:p.y=min(p.y,.014-.125*math.sqrt(q)-.001)
   hit=headsurface.ray_cast(Vector((p.x,-.5,p.z)),Vector((0,1,0)),1)
   if hit[0] is not None and p.z<1.653:
    blend=max(0,min(1,(1.653-p.z)/.026));blend=blend*blend*(3-2*blend)
    p.y=p.y*(1-blend)+(hit[0].y-.003)*blend
   points.append(p);r.append(size*max(.015,1-t**6)**.65)
  fiber(bangs,points,r)
# A cohesive ponytail behind the neck, built afresh as a loft plus fine surface fibers.
def tailcenter(t):return bez(Vector((0,.119,1.665)),Vector((-.008,.19,1.56)),Vector((.045,.168,1.29)),Vector((.052,.115,1.135)),t)
def tailradius(t):return (.017+.027*math.sin(math.pi*t)**.8)*(1-t**3)**.7
v=[];f=[];ns=64;steps=42
for k in range(steps+1):
 t=k/steps;c=tailcenter(t);r=tailradius(t)
 for j in range(ns):
  a=j*math.tau/ns;wr=1+.025*math.sin(a*9+t*7);v.append(c+Vector((math.cos(a)*r*wr,math.sin(a)*r*.68*wr,0)))
for k in range(steps):
 for j in range(ns):a=k*ns+j;b=k*ns+(j+1)%ns;f.append((a,b,b+ns,a+ns))
tail=mesh('Wig — complete ponytail behind head',v,f,dark)
bm=bmesh.new();bm.from_mesh(tail.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(tail.data);bm.free()
tailhair=curves('Wig — fine ponytail fibers',.00010)
for i in range(1250):
 angle=random.uniform(0,math.tau);depth=random.uniform(.96,1.04);length=random.uniform(.9,1);points=[];r=[]
 for k in range(37):
  t=k/36*length;c=tailcenter(t);rad=tailradius(t)*depth+.0005;a=angle+.065*math.sin(t*8+angle)
  points.append(c+Vector((math.cos(a)*rad,math.sin(a)*rad*.68,0)));r.append(random.uniform(.7,1)*max(.015,1-(k/36)**8)**.6)
 fiber(tailhair,points,r)
# Fresh black bow attached to the ponytail tie, part of the removable wig.
for side in [-1,1]:
 v=[];f=[]
 for k in range(13):
  t=k/12;w=.005+.02*math.sin(math.pi*t)**.8
  for j in range(9):
   u=j/8*2-1;v.append((side*(.006+.07*t),.109-.014*math.sin(math.pi*t)*(1-u*u),1.672+u*w+.012*t))
 for k in range(12):
  for j in range(8):a=k*9+j;f.append((a,a+1,a+10,a+9))
 o=mesh('Wig — black bow loop '+str(side),v,f,bowmat);s=o.modifiers.new('Soft satin','SUBSURF');s.levels=2;s=o.modifiers.new('Ribbon thickness','SOLIDIFY');s.thickness=.0008
 # Flat, tapered ribbon tails rather than round strands.
 v=[];f=[]
 for k in range(13):
  t=k/12;x=side*(.007+.035*t);y=.124+.012*math.sin(math.pi*t);z=1.667-.10*t;w=.006*(1-.4*t)
  v.extend([(x-w,y,z),(x+w,y,z)])
 for k in range(12):a=k*2;f.append((a,a+1,a+3,a+2))
 mesh('Wig — black ribbon tail '+str(side),v,f,bowmat)
scene=bpy.context.scene;scene.cycles.samples=40;scene.cycles.use_denoising=True
camera=scene.camera;camera.location=(.10,-3,1.63);camera.rotation_euler=(Vector((0,0,1.50))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.60
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
root['original_hair_geometry_retained']=False;root['style']='New complete swept-back ponytail wig; no cheek-side locks'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'liv-complete-new-wig-v4.blend'))
def render(name,pos,target,scale,w,h):
 camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale;scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
if os.environ.get('OX_HAIR_PREVIEW')=='1':
 scene.cycles.samples=20;render('liv-v4-check',(.10,-3,1.63),(0,0,1.50),.60,700,780)
else:
 render('liv-v4-front',(.10,-3,1.63),(0,0,1.50),.60,900,1000)
 render('liv-v4-side',(.9,-1.9,1.66),(0,.025,1.49),.65,900,1000)
 render('liv-v4-back',(.6,2,1.58),(0,.06,1.43),.80,900,1000)
 render('liv-v4-full',(.25,-3,1.22),(0,0,.87),1.95,850,1100)
print('NEW_WIG_COMPLETE',len(removed),'old hairstyle objects removed;',len(collection.objects),'new wig objects',flush=True)
