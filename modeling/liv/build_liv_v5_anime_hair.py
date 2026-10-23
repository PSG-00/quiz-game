"""Opaque sculpted anime hairstyle. No strand/curve groom or see-through fibers.
Retains the entirely new standalone wig, face and costume from v4.
"""
import bpy,os,math,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','liv-v5');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v4','liv-complete-new-wig-v4.blend'))
bpy.context.preferences.filepaths.save_version=0
root=bpy.data.objects['Liv_Wig_Complete_New_Model'];collection=root.users_collection[0]
for o in list(root.children):
 if o.type=='CURVE':bpy.data.objects.remove(o,do_unlink=True)
cap=bpy.data.objects['Wig — complete fitted scalp']
for v in cap.data.vertices:
 if v.co.z>1.56:v.co.z=1.56+(v.co.z-1.56)*.875
def toon(name,base):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
 geo=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.35,-.65,.72)).normalized();l.new(geo.outputs['Normal'],dot.inputs[0])
 ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='EASE'
 ramp.color_ramp.elements[0].position=-.15;ramp.color_ramp.elements[0].color=(*[v*.60 for v in base],1)
 ramp.color_ramp.elements[1].position=.72;ramp.color_ramp.elements[1].color=(*[v*1.22 for v in base],1)
 middle=ramp.color_ramp.elements.new(.19);middle.color=(*base,1);l.new(dot.outputs['Value'],ramp.inputs[0])
 emission=n.new('ShaderNodeEmission');l.new(ramp.outputs['Color'],emission.inputs['Color']);output=n.new('ShaderNodeOutputMaterial');l.new(emission.outputs[0],output.inputs['Surface']);return m
hair=toon('Anime espresso — opaque three-tone shade',(.053,.026,.016))
hairlight=toon('Anime espresso — painted highlight',(.115,.070,.046))
edgehair=bpy.data.materials.new('Anime espresso — clean outer bangs');edgehair.use_nodes=True
nodes=edgehair.node_tree.nodes;nodes.clear();emission=nodes.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(.053,.026,.016,1);output=nodes.new('ShaderNodeOutputMaterial');edgehair.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
cap.data.materials.clear();cap.data.materials.append(hair)
tail=bpy.data.objects['Wig — complete ponytail behind head'];tail.data.materials.clear();tail.data.materials.append(hair)
head=next(o for o in bpy.data.objects if o.name.startswith('Adapted original anime face'))
bpy.context.view_layer.update();bvh=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
def mesh(name,verts,faces,material,sub=1):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);collection.objects.link(o);o.parent=root;d.materials.append(material)
 for f in d.polygons:f.use_smooth=True
 if sub:mod=o.modifiers.new('Rounded anime lock','SUBSURF');mod.levels=sub
 return o
def bez(a,b,c,d,t):return a*(1-t)**3+b*(3*t*(1-t)**2)+c*(3*t*t*(1-t))+d*t**3
# Broad interlocking leaf-shaped bangs cover the forehead down to the eyebrows.
# They are volumetric opaque meshes with a few clear tips, not individual hairs.
designs=[
 ('left outer',(-.022,-.018,1.681),(-.065,-.074,1.674),(-.095,-.102,1.591),(-.105,-.075,1.548),.024),
 ('left sweep',(-.009,-.026,1.688),(-.029,-.09,1.67),(-.050,-.133,1.575),(-.062,-.111,1.538),.034),
 ('center sweep',(.008,-.027,1.689),(.015,-.098,1.67),(.009,-.139,1.574),(-.020,-.124,1.537),.035),
 ('right sweep',(.022,-.021,1.685),(.045,-.082,1.66),(.060,-.12,1.581),(.047,-.116,1.545),.031),
 ('right outer',(.032,-.014,1.679),(.077,-.065,1.651),(.088,-.088,1.586),(.103,-.068,1.558),.022),
]
def point(design,t,u):
 _,a,b,c,d,width=design;p=bez(Vector(a),Vector(b),Vector(c),Vector(d),t)
 w=width*(.56+.44*math.sin(math.pi*t))*math.sqrt(max(0,1-t**3))
 p.x+=u*w;p.z+=.003*u*u*math.sin(t*math.pi)
 q=1-(p.x/.119)**2-((p.z-1.56)/(.151*.875))**2
 if q>0:p.y=min(p.y,.014-.125*math.sqrt(q)-.002)
 hit=bvh.ray_cast(Vector((p.x,-.5,p.z)),Vector((0,1,0)),1)
 if hit[0] is not None and p.z<1.652:
  blend=max(0,min(1,(1.652-p.z)/.023));blend=blend*blend*(3-2*blend)
  p.y=p.y*(1-blend)+(hit[0].y-.005-.005*(1-u*u))*blend
 p.y-=.0035*(1-u*u)*math.sin(math.pi*t)
 return p
for design in designs:
 verts=[];faces=[];rows=32;cols=12
 for k in range(rows+1):
  for j in range(cols+1):verts.append(point(design,k/rows,j/cols*2-1))
 for k in range(rows):
  for j in range(cols):a=k*(cols+1)+j;faces.append((a,a+cols+1,a+cols+2,a+1))
 obj=mesh('Anime bang — '+design[0],verts,faces,edgehair if 'outer' in design[0] else hair,2);solid=obj.modifiers.new('Opaque lock thickness','SOLIDIFY');solid.thickness=.0018
root['style']='Entirely new opaque sculpted anime wig; five solid bangs; no cheek-side locks'
root['individual_hair_fibers']=False
assert not any(o.type=='CURVE' for o in root.children)
scene=bpy.context.scene;scene.cycles.samples=32;scene.cycles.use_denoising=True
cam=scene.camera;cam.location=(.1,-3,1.60);cam.rotation_euler=(Vector((0,0,1.50))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.57
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'liv-solid-anime-wig-v5.blend'))
def render(name,pos,target,scale,w,h):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
if os.environ.get('OX_HAIR_PREVIEW')=='1':
 scene.cycles.samples=16;render('liv-v5-check',(.1,-3,1.60),(0,0,1.50),.57,700,780)
else:
 render('liv-v5-front',(.1,-3,1.60),(0,0,1.50),.57,900,1000)
 render('liv-v5-side',(.75,-2,1.61),(0,.015,1.49),.62,900,1000)
 render('liv-v5-full',(.25,-3,1.22),(0,0,.87),1.95,850,1100)
print('SOLID_ANIME_WIG_READY',len(designs),'opaque bangs; zero hair curves',flush=True)
