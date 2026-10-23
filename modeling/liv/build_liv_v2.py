"""Reference-model adaptation preview. Does not replace the live game avatar.
Input: user-supplied Cute_Anime_Girl_3D_Model__Stylized_Blue_Hair.usdz.
Uses its actual UV-mapped head, hair, hands, legs and shoe geometry.
All recoloring is shader-based; source texture pixels are untouched.
"""
import bpy, math, os, bmesh
from mathutils import Vector, Matrix
from math import sin,cos,pi
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','liv-v2');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'artifacts','blue-hair-base.blend'))
for o in list(bpy.context.scene.objects):
 if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
base={o.name:o for o in bpy.context.scene.objects}
def mat(name,color,rough=.7,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
skin=mat('Warm skin on hands and legs',(.84,.65,.54),.85)
knit=mat('Charcoal knitted cardigan',(.055,.065,.076),.92)
rib=mat('Charcoal ribbed edges',(.039,.045,.053),.94)
skirt=mat('Charcoal skirt fabric',(.032,.038,.048),.88)
black=mat('Black velvet ribbons',(.009,.012,.018),.88)
leather=mat('Black leather ankle boots',(.014,.018,.024),.36)
sole=mat('Black rubber soles',(.008,.01,.015),.85)
silver=mat('Silver jewelry',(.66,.71,.77),.3,.7)
pearl=mat('Pearl flower earrings',(.88,.84,.76),.3)
button=mat('Polished black cardigan buttons',(.012,.014,.02),.22)
for m in [knit,rib,skirt]:
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=750;tex.inputs['Detail'].default_value=2
 bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.19;bump.inputs['Distance'].default_value=.0007;l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
def texture_material(obj,name,kind):
 old=obj.data.materials[0];image=next(n.image for n in old.node_tree.nodes if n.type=='TEX_IMAGE')
 m=mat(name,(1,1,1),.82);n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');tex=n.new('ShaderNodeTexImage');tex.image=image
 if kind=='hair':
  bw=n.new('ShaderNodeRGBToBW');ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.06;ramp.color_ramp.elements[0].color=(.006,.003,.004,1);ramp.color_ramp.elements[1].position=.9;ramp.color_ramp.elements[1].color=(.045,.022,.016,1)
  l.new(tex.outputs['Color'],bw.inputs[0]);l.new(bw.outputs[0],ramp.inputs[0]);color=ramp.outputs[0]
 else:
  separate=n.new('ShaderNodeSeparateColor');l.new(tex.outputs['Color'],separate.inputs[0])
  subtract=n.new('ShaderNodeMath');subtract.operation='SUBTRACT';l.new(separate.outputs['Blue'],subtract.inputs[0]);l.new(separate.outputs['Green'],subtract.inputs[1])
  test=n.new('ShaderNodeMath');test.operation='GREATER_THAN';test.inputs[1].default_value=.035;l.new(subtract.outputs[0],test.inputs[0])
  bw=n.new('ShaderNodeRGBToBW');l.new(tex.outputs[0],bw.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.019,.01,.013,1);ramp.color_ramp.elements[1].color=(.39,.24,.15,1);l.new(bw.outputs[0],ramp.inputs[0])
  mix=n.new('ShaderNodeMixRGB');l.new(test.outputs[0],mix.inputs[0]);l.new(tex.outputs['Color'],mix.inputs[1]);l.new(ramp.outputs[0],mix.inputs[2]);color=mix.outputs[0]
  # Recolor the base's painted black choker on its original anatomical neck.
  geo=n.new('ShaderNodeNewGeometry');xyz=n.new('ShaderNodeSeparateXYZ');l.new(geo.outputs['Position'],xyz.inputs[0])
  low=n.new('ShaderNodeMath');low.operation='LESS_THAN';low.inputs[1].default_value=1.411;l.new(xyz.outputs['Z'],low.inputs[0])
  dark=n.new('ShaderNodeMath');dark.operation='LESS_THAN';dark.inputs[1].default_value=.14;l.new(bw.outputs[0],dark.inputs[0])
  mask=n.new('ShaderNodeMath');mask.operation='MULTIPLY';l.new(low.outputs[0],mask.inputs[0]);l.new(dark.outputs[0],mask.inputs[1])
  fade=n.new('ShaderNodeMapRange');fade.clamp=True;fade.interpolation_type='SMOOTHSTEP';fade.inputs['From Min'].default_value=1.414;fade.inputs['From Max'].default_value=1.447;fade.inputs['To Min'].default_value=1;fade.inputs['To Max'].default_value=0;l.new(xyz.outputs['Z'],fade.inputs['Value'])
  neck=n.new('ShaderNodeMixRGB');neck.inputs[2].default_value=(.84,.65,.54,1);l.new(fade.outputs[0],neck.inputs[0]);l.new(color,neck.inputs[1]);color=neck.outputs[0]
 l.new(color,p.inputs['Base Color']);l.new(color,p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.22
 obj.data.materials.clear();obj.data.materials.append(m);return m
hair=base['Object_1'];head=base['Object_2'];hands=base['Object_0'];legs=base['Object_3'];shoes=base['Object_4']
hair.name='Adapted original hair — gathered ponytail';head.name='Adapted original anime face — brown eyes'
texture_material(hair,'Espresso hair with original painted highlights','hair');texture_material(head,'Original painted face — brown iris and brows','face')
# Remove the base's separate star clips and star-shaped ponytail accessories.
# Welding only joins duplicate positions; per-corner UV coordinates remain intact.
bm=bmesh.new();bm.from_mesh(hair.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);seen=set();remove=[]
for seed in list(bm.verts):
 if seed in seen:continue
 seen.add(seed);stack=[seed];group=[]
 while stack:
  v=stack.pop();group.append(v)
  for edge in v.link_edges:
   neighbor=edge.other_vert(v)
   if neighbor not in seen:seen.add(neighbor);stack.append(neighbor)
 if len(group)<300:remove.extend(group)
bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(hair.data);bm.free()
# Gather the existing twin-tail meshes behind the neck, keeping the detailed original fringe.
for v in hair.data.vertices:
 x,y,z=v.co;w=max(0,min(1,(abs(x)-.115)/.055))*max(0,min(1,(y+.015)/.06))
 v.co.x=x*(1-.76*w)
 v.co.y=y+(.095+.035*max(0,(1.58-z)/.25))*w
 if z<1.57 and y>.015:v.co.z=z-(1.57-z)*.45*w
 if y<-.065 and abs(x)<.09 and 1.48<z<1.665:
  edge=max(0,min(1,(.09-abs(x))/.02));t=(1.665-z)/.185;v.co.z=z+.075*t**1.2*edge
# Slightly soften the jaw width and lengthen the face, preserving the base's eye geometry/UVs.
for v in head.data.vertices:
 z=v.co.z
 if 1.40<z<1.49:v.co.x*=1.035
 if z<1.48:v.co.z-=max(0,1.48-z)*.035
# Keep the existing detailed hands, replacing the sporty torso with new clothing.
bm=bmesh.new();bm.from_mesh(hands.data)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if abs(v.co.x)<.555],context='VERTS');bm.to_mesh(hands.data);bm.free()
hands.name='Original hands in relaxed pose';hands.data.materials.clear();hands.data.materials.append(skin)
for poly in hands.data.polygons:poly.material_index=0
for v in hands.data.vertices:
 s=1 if v.co.x>0 else -1;pivot=Vector((s*.145,0,1.325));v.co=pivot+Matrix.Rotation(s*math.radians(72),3,'Y')@(v.co-pivot)
# Bare legs and dark ankle footwear, based on the actual reference meshes.
legs.name='Original leg geometry with bare-skin material';legs.data.materials.clear();legs.data.materials.append(skin)
for f in legs.data.polygons:f.material_index=0
bm=bmesh.new();bm.from_mesh(legs.data)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z>.775],context='VERTS');bm.to_mesh(legs.data);bm.free()
shoes.name='Original detailed shoes adapted to black ankle boots';shoes.data.materials.clear();shoes.data.materials.append(leather)
for f in shoes.data.polygons:f.material_index=0
def finish(o,name,material):
 o.name=name;o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=True
 return o
def ball(name,loc,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=loc);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,material)
def mesh(name,v,f,material,sub=0):
 d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);finish(o,name,material)
 if sub:mod=o.modifiers.new('Smooth tailored surface','SUBSURF');mod.levels=sub
 return o
def tube(name,points,r,material):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=3;c.resolution_u=12;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(material);return o
def ringmesh(name,levels,material,pleats=0,n=96,sub=1):
 levels=sorted(levels);v=[];f=[]
 for z,rx,ry,cy in levels:
  for j in range(n):
   a=j*2*pi/n;p=1+pleats*cos(16*a);v.append((rx*cos(a)*p,cy+ry*sin(a)*p,z))
 for k in range(len(levels)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 o=mesh(name,v,f,material,sub);solid=o.modifiers.new('Cloth thickness','SOLIDIFY');solid.thickness=.002;return o
# Fitted cardigan with separate shoulders, side shaping and gently draped knit.
ringmesh('Cardigan fitted torso',[(1.006,.133,.088,0),(1.015,.135,.09,0),(1.04,.127,.084,0),(1.09,.118,.078,0),(1.15,.123,.094,-.008),(1.22,.143,.121,-.018),(1.275,.15,.108,-.005),(1.30,.15,.087,0),(1.33,.135,.07,0),(1.345,.074,.047,-.002),(1.347,.063,.044,-.003)],knit)
ringmesh('Cardigan lower rib hem',[(1.003,.135,.09,0),(1.008,.136,.091,0),(1.031,.131,.088,0),(1.035,.13,.087,0)],rib)
def sleeve(side):
 v=[];f=[];n=48
 profile=[(0,.060),(0.03,.061),(.12,.059),(.28,.052),(.48,.047),(.70,.043),(.92,.041),(1,.041)]
 start=Vector((side*.139,.006,1.306));end=Vector((side*.277,.002,.939));direction=(end-start).normalized();axis=Vector((0,1,0));cross=direction.cross(axis).normalized()
 for t,r in profile:
  center=start.lerp(end,t)
  for j in range(n):
   a=j*2*pi/n;wrinkle=1+.025*sin(a*3+t*25)*sin(t*pi)
   v.append(center+(axis*cos(a)+cross*sin(a))*r*wrinkle)
 for k in range(len(profile)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
 f.append(tuple(range(n-1,-1,-1)))
 o=mesh('Long cardigan sleeve '+str(side),v,f,knit,2);sol=o.modifiers.new('Knit thickness','SOLIDIFY');sol.thickness=.002
 for j,t in enumerate([.92,.935,.95,.965,.98]):
  center=start.lerp(end,t);coords=[center+(axis*cos(a)+cross*sin(a))*.0415 for a in [i*2*pi/48 for i in range(49)]];tube('Sleeve cuff rib '+str(side)+' '+str(j),coords,.0014,rib)
for side in [-1,1]:sleeve(side)
for side in [-1,1]:ball('Soft cardigan shoulder '+str(side),(side*.137,.004,1.304),(.062,.06,.057),knit)
tube('Cardigan center seam',[(0,-.091,1.015),(0,-.086,1.085),(0,-.114,1.18),(0,-.141,1.24),(0,-.089,1.305),(0,-.051,1.342)],.004,rib)
for z,y in [(1.035,-.095),(1.10,-.09),(1.17,-.112),(1.24,-.143),(1.305,-.09),(1.337,-.056)]:
 ball('Glossy cardigan button',(0,y-.004,z),(.009,.004,.009),button)
 for x in [-.002,.002]:ball('Button thread',(x,y-.0085,z),(.0006,.0006,.001),silver)
tube('Cardigan round collar',[(-.065,-.006,1.345),(-.047,-.043,1.334),(0,-.053,1.33),(.047,-.043,1.334),(.065,-.006,1.345)],.004,rib)
# Three overlapping tiers, with visible dark ribbon trim and subtle fabric pleats.
for i,(top,bottom,rt,rb) in enumerate([(1.024,.91,.132,.181),(.945,.82,.167,.216),(.86,.73,.20,.245)]):
 ringmesh('Skirt tier '+str(i+1),[(bottom,rb,rb*.65,.006),(bottom+.005,rb,rb*.65,.006),(top-.006,rt,rt*.65,.006),(top,rt,rt*.65,.006)],skirt,.022,sub=1)
 ringmesh('Skirt velvet horizontal trim '+str(i+1),[(bottom+.006,rb*1.004,rb*.654,.006),(bottom+.018,rb*.987,rb*.643,.006)],black,.022,sub=1)
 for j in range(16):
  a=j*2*pi/16;coords=[]
  for t in [0,.33,.66,1]:
   r=rt+(rb-rt)*t;coords.append((r*cos(a)*1.02,.006+r*.65*sin(a)*1.02,top+(bottom-top)*t))
  tube('Skirt stitched fold',coords,.00045,rib)
for s in [-1,1]:
 # Socks sit above the original high-top shoe geometry.
 ringmesh('Black ankle sock '+str(s),[(.155,.040,.041,0),(.22,.039,.039,0)],black,n=48)
 sock=bpy.context.scene.objects.get('Black ankle sock '+str(s));sock.location.x=s*.093
 ball('Platform boot sole '+str(s),(s*.096,-.033,.008),(.054,.112,.017),sole)
# Flower applique near the left shoulder.
for i in range(5):
 a=i*2*pi/5;o=ball('Fabric flower petal',(-.102+cos(a)*.013,-.078,1.315+sin(a)*.013),(.011,.003,.006),rib);o.rotation_euler[1]=-a
ball('Fabric flower knot',(-.102,-.082,1.315),(.006,.003,.006),knit)
# Delicate silver chain, pendant and tiny pearl flower earrings.
tube('Necklace chain',[(-.042,-.015,1.38),(-.031,-.054,1.353),(0,-.068,1.335),(.031,-.054,1.353),(.042,-.015,1.38)],.0009,silver)
ball('Silver necklace pendant',(0,-.073,1.332),(.004,.0015,.006),silver)
for s in [-1,1]:
 for i in range(5):
  a=i*2*pi/5;ball('Pearl earring petal',(s*.105+cos(a)*.004,-.018,1.435+sin(a)*.004),(.003,.002,.003),pearl)
 ball('Silver earring center',(s*.105,-.021,1.435),(.002,.001,.002),silver)
# Sculpted black bow above the gathered ponytail.
fringe=mat('Fine dark brown fringe',(.023,.012,.009),.85)
for i in range(13):
 x=(i-6)*.0105;points=[]
 for k in range(6):
  t=k/5;points.append((x*(.7+.3*t),-.105-.04*sin(t*pi*.7),1.646-.103*t+abs(x)*.22))
 # Flattened tapered locks over the forehead; narrow enough to reveal the skin below.
 vertices=[];faces=[]
 for k,p in enumerate(points):
  w=(.0033 if i%3 else .0025)*(1-k/5)+.00015;vertices.extend([(p[0]-w,p[1],p[2]),(p[0],p[1]-.0014,p[2]),(p[0]+w,p[1],p[2])])
 for k in range(5):
  for j in range(2):a=k*3+j;faces.append((a,a+1,a+4,a+3))
 mesh('Fine wispy fringe '+str(i),vertices,faces,fringe,1)
for side in [-1,1]:
 v=[];f=[]
 for k in range(9):
  t=k/8;x=side*(.008+.078*t);width=.008+.024*sin(pi*t)**.7
  for j in range(7):
   u=j/6;v.append((x,.075-.018*sin(pi*t)*sin(pi*u),1.684+(u-.5)*2*width+.014*t))
 for k in range(8):
  for j in range(6):a=k*7+j;f.append((a,a+1,a+8,a+7))
 o=mesh('Black satin bow loop '+str(side),v,f,black,2);sol=o.modifiers.new('Ribbon thickness','SOLIDIFY');sol.thickness=.001
 tube('Ribbon hanging tail '+str(side),[(side*.015,.085,1.682),(side*.036,.104,1.62),(side*.055,.115,1.56)],.006,black)
ball('Black bow knot',(0,.068,1.684),(.013,.008,.01),black)
# Save a self-contained editable source before studio geometry is added.
for image in bpy.data.images:
 if image.source=='FILE':image.pack()
world=bpy.data.worlds.new('Soft studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.34,.38,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
ground=mat('Studio warm stone',(.15,.16,.18),.9)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012));bpy.context.object.name='Studio floor';bpy.context.object.data.materials.append(ground)
def area(name,loc,power,size):
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large key',(-2,-3,4),180,3);area('Gentle fill',(2,-2,2),55,2.5);area('Hair rim',(1,2,3),180,2)
bpy.ops.object.camera_add();camera=bpy.context.object;bpy.context.scene.camera=camera;camera.data.type='ORTHO'
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True;scene.view_settings.view_transform='Standard';scene.render.resolution_percentage=100
def render(name,position,target,scale,width,height):
 camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=os.path.join(OUT,name+'.png');bpy.ops.render.render(write_still=True)
camera.location=(.38,-3,1.5);camera.rotation_euler=(Vector((0,0,.88))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=1.95
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'liv-anime-adapted-v2.blend'))
render('liv-v2-full',(.25,-3,1.22),(0,0,.87),1.95,850,1100)
render('liv-v2-face',(.12,-3,1.64),(0,-.015,1.49),.59,950,1000)
render('liv-v2-three-quarter',(.95,-2.3,1.35),(0,0,.88),1.96,850,1100)
print('V2_RENDER_COMPLETE',flush=True)
