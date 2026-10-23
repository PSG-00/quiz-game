"""Shared smooth, slender bare-leg geometry and scale metadata for all SD avatars."""
import math
from mathutils import Matrix
scene=bpy.context.scene
skin=bpy.data.materials.new('Unified SD skin');skin.use_nodes=True;skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.66,.44,.36,1);skin.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
for obj in list(scene.objects):
 if obj.name.startswith('Original hands'):
  obj.data.materials.clear();obj.data.materials.append(skin)
  for polygon in obj.data.polygons:polygon.material_index=0
 if not obj.name.startswith('Original leg geometry'):continue
 # One smooth anatomical profile, shared by every skirt/shorts character.
 profile=[(.13,.024,.027),(.18,.025,.028),(.25,.028,.031),(.32,.033,.035),(.38,.036,.038),(.43,.034,.036),(.48,.032,.034),(.53,.035,.036),(.61,.043,.045),(.69,.048,.050),(.76,.050,.052),(.80,.050,.052)]
 verts=[];faces=[];count=48
 for side in [-1,1]:
  base=len(verts)
  for z,rx,ry in profile:
   for j in range(count):a=j*2*math.pi/count;verts.append((side*.095+rx*math.cos(a),ry*math.sin(a),z))
  for k in range(len(profile)-1):
   for j in range(count):a=base+k*count+j;b=base+k*count+(j+1)%count;faces.append((a,b,b+count,a+count))
  faces.append(tuple(base+j for j in reversed(range(count))));top=base+(len(profile)-1)*count;faces.append(tuple(top+j for j in range(count)))
 data=bpy.data.meshes.new('Unified slender SD legs');data.from_pydata(verts,[],faces);data.update();data.materials.append(skin);obj.data=data;obj.parent=None;obj.matrix_world=Matrix.Identity(4)
 for polygon in data.polygons:polygon.use_smooth=True
 sub=obj.modifiers.new('Smooth shared leg profile','SUBSURF');sub.levels=1
 obj['body_profile']='standard-lean-v2'
