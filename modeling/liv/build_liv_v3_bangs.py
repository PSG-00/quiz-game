"""Replace the old chunky fringe with curved, tapered see-through bang meshes.
Edits actual Blender geometry; keeps the reference model's face and outfit.
"""
import bpy,bmesh,os,math,random
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','liv-v3');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v2','liv-anime-adapted-v2.blend'))
bpy.context.preferences.filepaths.save_version=0
for obj in list(bpy.data.objects):
 if obj.name.startswith('Fine wispy fringe'):bpy.data.objects.remove(obj,do_unlink=True)
hair=next(o for o in bpy.data.objects if o.name.startswith('Adapted original hair'))
head=next(o for o in bpy.data.objects if o.name.startswith('Adapted original anime face'))
bm=bmesh.new();bm.from_mesh(hair.data)
remove=[]
for face in bm.faces:
 c=face.calc_center_median()
 if c.y<-.045 and c.z>1.533 and abs(c.x)<.111:remove.append(face)
bmesh.ops.delete(bm,geom=remove,context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.to_mesh(hair.data);bm.free()
bpy.context.view_layer.update();bvh=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
def forehead_y(x,z):
 hit=bvh.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1)
 return hit[0].y if hit[0] else None
def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.64
 if p.inputs.get('Anisotropic'):p.inputs['Anisotropic'].default_value=.28
 p.inputs['Coat Weight'].default_value=0
 p.inputs['Specular IOR Level'].default_value=.2
 p.inputs['Roughness'].default_value=.83
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=.18
 return m
mats=[material('See-through espresso strand '+str(i),c) for i,c in enumerate([(.025,.013,.009),(.031,.016,.012),(.020,.010,.007),(.037,.02,.014)])]
# Bridge the old cut edges with a continuous thin curved scalp surface.
capmat=material('Soft espresso crown',(.025,.013,.009))
vertices=[];faces=[];rows=48;columns=160
for k in range(rows+1):
 for j in range(columns+1):
  phi=math.pi+math.pi*j/columns;front=max(0,-math.sin(phi))
  end=1.64-.95*front**1.8+.012*math.sin(phi*43)*front**4
  theta=.008+(end-.008)*k/rows;ridge=1+.0015*math.sin(phi*95+theta*4)
  vertices.append((.137*math.sin(theta)*math.cos(phi)*ridge,.012+.147*math.sin(theta)*math.sin(phi)*ridge,1.565+.162*math.cos(theta)))
for k in range(rows):
 for j in range(columns):a=k*(columns+1)+j;faces.append((a,a+columns+1,a+columns+2,a+1))
d=bpy.data.meshes.new('Continuous swept crown');d.from_pydata(vertices,[],faces);d.update();o=bpy.data.objects.new('Continuous swept crown',d);bpy.context.collection.objects.link(o);d.materials.append(capmat)
for f in d.polygons:f.use_smooth=True
random.seed(41)
fiberdata=bpy.data.curves.new('Soft fine bang fibers','CURVE');fiberdata.dimensions='3D';fiberdata.resolution_u=2;fiberdata.bevel_depth=.00013;fiberdata.bevel_resolution=1
fiberobj=bpy.data.objects.new('Soft fine see-through bangs',fiberdata);bpy.context.collection.objects.link(fiberobj)
fibermat=bpy.data.materials.new('Natural espresso hair fibers');fibermat.use_nodes=True
nodes=fibermat.node_tree.nodes;links=fibermat.node_tree.links;nodes.clear();output=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfHairPrincipled');shader.parametrization='COLOR';shader.inputs['Color'].default_value=(.025,.014,.01,1);shader.inputs['Roughness'].default_value=.72;shader.inputs['IOR'].default_value=1.3;links.new(shader.outputs[0],output.inputs['Surface']);fiberdata.materials.append(fibermat)
def strand(index,endx,endz,width):
 n=30;across=6;vertices=[];faces=[]
 sign=1 if endx>=0 else -1
 startx=endx*.60
 startz=1.565+.162*math.sqrt(max(.01,1-(startx/.137)**2))-.0005
 # Each lock follows the forehead, curves to a tiny side-swept tip and has its
 # own length/width. Density fades gradually, with no thick cap above a comb.
 sway=random.uniform(-.009,.009)
 for k in range(n+1):
  t=k/n
  x=startx+(endx-startx)*math.sin(t*math.pi/2)**1.15+sway*math.sin(t*math.pi)+sign*.0025*t**5
  z=startz+(endz-startz)*t
  natural_y=.010-.168*math.sin(t*math.pi*.52)-.003*t**5
  surface=forehead_y(x,z)
  y=min(natural_y,surface-.0045) if surface is not None else natural_y
  crown=1-(x/.137)**2-((z-1.565)/.162)**2
  if crown>0:y=min(y,.012-.147*math.sqrt(crown)-.0014)
  # Full hair coverage at the roots, fine separated tips across the forehead.
  taper=max(.0001,1-t**4)**.60
  w=width*taper*(1+.10*math.sin(t*math.pi))*(1+max(0,1-t/.38))+.000025
  for j in range(across+1):
   u=j/across*2-1;vertices.append((x+u*w,y-.0012*(1-u*u)*(1-t*.6),z+.0005*u*math.sin(t*math.pi)))
 for k in range(n):
  for j in range(across):
   a=k*(across+1)+j;faces.append((a,a+across+1,a+across+2,a+1))
 for fine in range(11):
  spline=fiberdata.splines.new('POLY');spline.points.add(n)
  offset=width*((fine/10)*2-1)*.9;phase=random.uniform(0,math.pi*2);tip=random.uniform(-.004,.004);size=random.uniform(.65,1.1)
  for k,point in enumerate(spline.points):
   t=k/n;center=vertices[k*(across+1)+across//2]
   point.co=(center[0]+offset*(.35+.65*t)+.00018*math.sin(phase+t*math.pi*2),center[1]-.0002*math.sin(phase+t*4),center[2]+tip*t**3,1)
   point.radius=size*max(.025,1-t**7)**.65
index=0
for group in range(24):
 center=(group-11.5)*.0085+random.uniform(-.002,.002)
 length=1.544+.014*(abs(center)/.104)**1.8+random.uniform(-.005,.005)
 for fine in range(random.choice([3,3,4])):
  x=center+(fine-1.2)*.0011+random.uniform(-.00035,.00035)
  width=random.uniform(.00065,.00125) if abs(x)<.065 else random.uniform(.0011,.0018)
  strand(index,x,length+random.uniform(-.002,.002),width);index+=1
for side in [-1,1]:
 for j in range(4):
  strand(index,side*(.107+j*.004),1.524-j*.009,.0045);index+=1
for fill in range(47):
 x=(fill-23)*.00425+random.uniform(-.0008,.0008)
 strand(index,x,1.548+.012*(abs(x)/.104)**1.8+random.uniform(-.005,.005),random.uniform(.0013,.0020));index+=1
scene=bpy.context.scene;scene.cycles.samples=48;scene.cycles.use_denoising=True
camera=scene.camera
camera.location=(.12,-3,1.64);camera.rotation_euler=(Vector((0,-.015,1.49))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=.59
scene.render.resolution_x=950;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'liv-see-through-bangs-v3.blend'))
def render(name,pos,target,scale,w,h):
 camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale;scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
if os.environ.get('OX_HAIR_PREVIEW')=='1':
 scene.cycles.samples=20
 render('liv-v3-face-check',(.12,-3,1.64),(0,-.015,1.49),.59,700,740)
else:
 render('liv-v3-face',(.12,-3,1.64),(0,-.015,1.49),.59,950,1000)
 render('liv-v3-face-angle',(.7,-2.4,1.65),(0,0,1.51),.59,950,1000)
 render('liv-v3-full',(.25,-3,1.22),(0,0,.87),1.95,850,1100)
print('SEE_THROUGH_BANGS_COMPLETE',len(remove),'old faces removed;',index,'fine curved locks',flush=True)
