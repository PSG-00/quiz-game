"""Bake the approved v5 face/hair shaders and export a game-ready GLB.
Keeps approved v5 hair intact; bakes a padded face atlas and exports a three-head SD rig.
"""
import bpy,bmesh,os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'client','assets','models');BAKES=os.path.join(ROOT,'modeling','liv-sd-v6','game-textures');os.makedirs(BAKES,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v5','liv-solid-anime-wig-v5.blend'))
exec(open(os.path.join(ROOT,'modeling','member-build','standardize_sd_body.py'),encoding='utf-8-sig').read())
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.margin=8
wig=bpy.data.objects['Liv_Wig_Complete_New_Model'];hairnames={o.name for o in wig.children if o.type=='MESH'}
for obj in list(scene.objects):
 if obj.type in ['LIGHT','CAMERA'] or obj.name=='Studio floor':bpy.data.objects.remove(obj,do_unlink=True)
meshes=[o for o in scene.objects if o.type in ['MESH','CURVE']]
for o in meshes:
 if o.type=='CURVE':o.data.resolution_u=4;o.data.bevel_resolution=1
 for mod in o.modifiers:
  if mod.type=='SUBSURF':mod.levels=min(mod.levels,1)
 matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.convert(target='MESH')
meshes=[o for o in scene.objects if o.type=='MESH']
for o in meshes:
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for vertex in o.data.vertices:
  if vertex.co.z<0:vertex.co.z=0
def emit_base(material):
 if not material.use_nodes:return
 n=material.node_tree.nodes;l=material.node_tree.links;out=next((x for x in n if x.type=='OUTPUT_MATERIAL'),None)
 if not out or not out.inputs['Surface'].is_linked:return
 source=out.inputs['Surface'].links[0].from_node
 if source.type=='EMISSION':return
 if source.type!='BSDF_PRINCIPLED':raise RuntimeError('Unsupported bake material '+material.name)
 emission=n.new('ShaderNodeEmission');color=source.inputs['Base Color']
 if color.is_linked:l.new(color.links[0].from_socket,emission.inputs['Color'])
 else:emission.inputs['Color'].default_value=color.default_value
 l.new(emission.outputs[0],out.inputs['Surface'])
def unlit(name,image,lit=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeBsdfPrincipled' if lit else 'ShaderNodeEmission');tex=n.new('ShaderNodeTexImage');tex.image=image;l.new(tex.outputs['Color'],em.inputs['Base Color' if lit else 'Color']);l.new(em.outputs[0],out.inputs['Surface']);return m
def bake(obj,name,size,atlas=False,lit=False,fresh_uv=False):
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
 if fresh_uv:
  # Keep the reference texture coordinates separate from the new game atlas.
  original=obj.data.uv_layers.active.name
  for material in obj.data.materials:
   for node in list(material.node_tree.nodes):
    if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
     uv=material.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map=original;material.node_tree.links.new(uv.outputs[0],node.inputs['Vector'])
  obj.data.uv_layers.new(name='FaceGameAtlas');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
 if atlas:
  if not obj.data.uv_layers:obj.data.uv_layers.new(name='GameUV')
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025 if fresh_uv else .012);bpy.ops.object.mode_set(mode='OBJECT')
 obj.data.uv_layers.active.active_render=True
 image=bpy.data.images.new(name,width=size,height=size,alpha=False);image.generated_color=(.03,.015,.01,1)
 for m in obj.data.materials:
  emit_base(m)
  # Pin source textures to the original UV before adding the bake target.
  n=m.node_tree.nodes
  for node in list(n):
   if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
    uv=n.new('ShaderNodeUVMap');uv.uv_map=obj.data.uv_layers.active.name;m.node_tree.links.new(uv.outputs[0],node.inputs['Vector'])
  for node in n:node.select=False
  target=n.new('ShaderNodeTexImage');target.image=image;target.select=True;n.active=target
 scene.render.bake.margin=32 if fresh_uv else 8
 scene.render.bake.margin_type='EXTEND'
 bpy.ops.object.bake(type='EMIT')
 image.filepath_raw=os.path.join(BAKES,name+'.png');image.file_format='PNG';image.save();image.pack()
 # RNA layer references shift when removing preceding layers. Keep names, and
 # export only the baked atlas so glTF TEXCOORD_0 always matches the texture.
 target_uv=obj.data.uv_layers.active.name
 for uv_name in [layer.name for layer in obj.data.uv_layers]:
  if uv_name!=target_uv:obj.data.uv_layers.remove(obj.data.uv_layers[uv_name])
 obj.data.uv_layers[0].active_render=True
 obj.data.materials.clear();obj.data.materials.append(unlit(name+' — baked '+('lit' if lit else 'unlit'),image,lit))
 for p in obj.data.polygons:p.material_index=0
 print('BAKED',name,size,flush=True)
head=next(o for o in meshes if o.name.startswith('Adapted original anime face'))
# Weld geometric seams while retaining per-loop reference UVs.
bm=bmesh.new();bm.from_mesh(head.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(head.data);bm.free()
bake(head,'liv-sd-v6-face',2048,True,fresh_uv=True)
hairparts=[o for o in meshes if o.name in hairnames]
bpy.ops.object.select_all(action='DESELECT')
for o in hairparts:o.select_set(True)
bpy.context.view_layer.objects.active=hairparts[0];bpy.ops.object.join();hair=bpy.context.object;hair.name='Liv v5 solid anime hair'
bake(hair,'liv-v5-hair',1024,True)
def split_sides(o):
 result=[]
 for side in [-1,1]:
  copy=o.copy();copy.data=o.data.copy();scene.collection.objects.link(copy);bm=bmesh.new();bm.from_mesh(copy.data)
  bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.x*side<0],context='VERTS');bm.to_mesh(copy.data);bm.free();result.append((side,copy))
 bpy.data.objects.remove(o,do_unlink=True);return result
buckets={'Body':[],'Arm_-1':[],'Arm_1':[],'Leg_-1':[],'Leg_1':[]}
for o in list(scene.objects):
 if o.type!='MESH' or o in [head,hair]:continue
 name=o.name
 if name.startswith('Original hands'):
  for side,part in split_sides(o):buckets['Arm_'+str(side)].append(part)
 elif name.startswith(('Long cardigan sleeve','Sleeve cuff rib','Soft cardigan shoulder')):
  side=-1 if '-1' in name else 1;buckets['Arm_'+str(side)].append(o)
 elif name.startswith(('Original leg geometry','Original detailed shoes')):
  for side,part in split_sides(o):buckets['Leg_'+str(side)].append(part)
 elif name.startswith(('Black ankle sock','Platform boot sole')):
  side=-1 if '-1' in name else 1;buckets['Leg_'+str(side)].append(o)
 else:buckets['Body'].append(o)
model=bpy.data.objects.new('Liv_Approved_Anime_v5',None);scene.collection.objects.link(model)
limbparts={}
for name,objects in buckets.items():
 if not objects:raise RuntimeError('Missing model part '+name)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();part=bpy.context.object;part.name=name+' mesh'
 bake(part,'liv-v5-'+name,1024 if name=='Body' else 512,True,True)
 decimate=part.modifiers.new('Game geometry reduction','DECIMATE');decimate.ratio=.35
 bpy.context.view_layer.objects.active=part;bpy.ops.object.modifier_apply(modifier=decimate.name)
 part.parent=model
 if name!='Body':limbparts[name]=part
for o in [head,hair]:o.parent=model
decimate=hair.modifiers.new('Game hair geometry reduction','DECIMATE');decimate.ratio=.60
bpy.context.view_layer.objects.active=hair;bpy.ops.object.modifier_apply(modifier=decimate.name)
# Smooth joint deformation keeps the bare legs and sleeves continuous while walking.
data=bpy.data.armatures.new('Liv walk skeleton');rig=bpy.data.objects.new('Liv walk skeleton',data);scene.collection.objects.link(rig);rig.parent=model
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
anchor=data.edit_bones.new('Root');anchor.head=(0,0,.98);anchor.tail=(0,0,1.15)
for side in [-1,1]:
 def bone(name,head,tail,parent):
  b=data.edit_bones.new(name);b.head=head;b.tail=tail;b.parent=parent;return b
 upper=bone('Leg_'+str(side),(side*.095,0,.98),(side*.095,0,.48),anchor)
 knee=bone('Knee_'+str(side),(side*.095,0,.48),(side*.095,0,.16),upper)
 bone('Foot_'+str(side),(side*.095,0,.16),(side*.095,-.13,.055),knee)
 upper=bone('Arm_'+str(side),(side*.145,0,1.31),(side*.226,0,1.10),anchor)
 bone('Elbow_'+str(side),(side*.226,0,1.10),(side*.30,-.01,.85),upper)
bpy.ops.object.mode_set(mode='OBJECT')
def smooth(edge0,edge1,value):
 t=max(0,min(1,(value-edge0)/(edge1-edge0)));return t*t*(3-2*t)
for name,part in limbparts.items():
 side=-1 if '-1' in name else 1
 names=[name,('Knee_' if name.startswith('Leg') else 'Elbow_')+str(side)]
 if name.startswith('Leg'):names.append('Foot_'+str(side))
 groups=[part.vertex_groups.new(name=n) for n in names]
 rootgroup=part.vertex_groups.new(name='Root') if name.startswith('Leg') else None
 for vertex in part.data.vertices:
  z=vertex.co.z
  if name.startswith('Leg'):
   top=smooth(.43,.53,z);foot=1-smooth(.12,.20,z);pin=smooth(.67,.775,z);weights=[top*(1-pin),(1-top)*(1-foot)*(1-pin),(1-top)*foot*(1-pin)]
   if pin>.00001:rootgroup.add([vertex.index],pin,'REPLACE')
  else:
   top=smooth(1.05,1.15,z);weights=[top,1-top]
  for group,weight in zip(groups,weights):
   if weight>.00001:group.add([vertex.index],weight,'REPLACE')
 mod=part.modifiers.new('Smooth walking joints','ARMATURE');mod.object=rig
for o in list(scene.objects):
 if o.type=='EMPTY' and o!=model and not o.children:bpy.data.objects.remove(o,do_unlink=True)
# Apply the same continuous proportion map to every surface and joint AFTER baking
# and skin weighting. This keeps face shader masks and limb weights in source space.
def sd_point(point):
 x,y,z=point
 head=smooth(1.35,1.405,z);width=1.12+(1.46-1.12)*head
 if z<=.78:height=z*.60
 elif z<=1.35:height=.468+(z-.78)*.68
 elif z<=1.405:height=.8556+(z-1.35)*.45
 else:height=.88035+(z-1.405)*1.40
 return Vector((x*width,y*width,height))
for obj in model.children_recursive:
 if obj.type=='MESH':
  for vertex in obj.data.vertices:vertex.co=sd_point(vertex.co)
  obj.data.update()
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for joint in data.edit_bones:
 joint.head=sd_point(joint.head);joint.tail=sd_point(joint.tail)
bpy.ops.object.mode_set(mode='OBJECT')
model['body_reference_height']=sd_point((0,0,1.707)).z;model['body_profile']='standard-lean-v2'
model['proportions']='SD: enlarged head, shortened neck, torso and limbs';model['version']='liv-sd-v6';model['hair_style']='opaque solid bangs, no cheek-side locks'
bpy.ops.object.select_all(action='DESELECT')
model.select_set(True)
for o in model.children_recursive:o.select_set(True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'modeling','liv-sd-v6','liv-sd-v6.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'liv-sd-v6-walk.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
print('GAME_EXPORT_COMPLETE',sum(len(o.data.polygons) for o in model.children_recursive if o.type=='MESH'),'polygons',flush=True)
