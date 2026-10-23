"""Rebuild the Liv reference-inspired anime avatar with Blender 4.5.
Run: blender --background --python modeling/liv/build_liv.py
Front is -Y; glTF exports Y-up. No external assets or face photographs are embedded.
"""
import bpy, math, os
from mathutils import Vector
from math import sin, cos, pi
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def material(name,color,rough=.7,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    return m
skin=material('Warm porcelain',(.72,.48,.40)); hair=material('Espresso brown hair',(.025,.014,.013),.7)
hairLight=material('Hair soft highlight',(.085,.052,.044),.45)
knit=material('Charcoal cardigan',(.105,.125,.145)); rib=material('Knit rib trim',(.075,.09,.108))
skirt=material('Graphite tiered skirt',(.065,.073,.089)); black=material('Black ribbon and skirt trim',(.015,.018,.024),.55)
boot=material('Black leather boots',(.025,.03,.04),.35); silver=material('Silver jewelry',(.65,.7,.76),.3,.65)
pearl=material('Pearl earrings',(.96,.91,.85),.28); white=material('Eye ivory',(.96,.96,.94),.35)
iris=material('Warm brown iris',(.17,.105,.083),.35); irisLight=material('Amber iris lower',(.36,.23,.15),.4)
pupil=material('Pupils and lashes',(.018,.012,.016),.45); lip=material('Soft rose lips',(.58,.22,.25),.7)
blush=material('Soft peach cheeks',(.72,.33,.30),.85)
parts=[]
def finish(obj,name,mat,parent=None):
    obj.name=name; obj.data.materials.append(mat)
    for f in obj.data.polygons:f.use_smooth=True
    if parent:obj.parent=parent
    parts.append(obj);return obj
def ball(name,loc,scale,mat,parent=None,segments=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent)
def mesh(name,verts,faces,mat,parent=None):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);return finish(o,name,mat,parent)
def tube(name,coords,radius,mat,parent=None):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=radius;c.bevel_resolution=2
    s=c.splines.new('BEZIER');s.bezier_points.add(len(coords)-1)
    for p,co in zip(s.bezier_points,coords):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return finish(o,name,mat,parent)
def rings(name,levels,mat,n=48,pleat=0,parent=None):
    levels=sorted(levels,key=lambda level:level[0])
    v=[]
    for z,rx,ry in levels:
        for j in range(n):
            a=2*pi*j/n;p=1+pleat*cos(a*16);v.append((rx*cos(a)*p,ry*sin(a)*p,z))
    f=[tuple(range(n-1,-1,-1))]
    for k in range(len(levels)-1):
        for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
    f.append(tuple((len(levels)-1)*n+j for j in range(n)))
    return mesh(name,v,f,mat,parent)
root=bpy.data.objects.new('Liv_Anime_Reference_v1',None);bpy.context.collection.objects.link(root)
body=bpy.data.objects.new('Body',None);bpy.context.collection.objects.link(body);body.parent=root
# Five-head anime proportions, slender cardigan silhouette and tiered skirt.
rings('Cardigan tailored body',[(1.28,.255,.17),(1.43,.245,.16),(1.67,.235,.155),(1.9,.285,.18),(2.08,.32,.165),(2.16,.23,.145)],knit,parent=body)
rings('Cardigan lower rib',[(1.27,.26,.177),(1.34,.258,.176)],rib,parent=body)
ball('Neck',(0,0,2.19),(.105,.095,.19),skin,body)
tube('Round neckline',[(-.21,-.09,2.13),(-.14,-.15,2.07),(0,-.169,2.045),(.14,-.15,2.07),(.21,-.09,2.13)],.017,rib,body)
tube('Button placket',[(0,-.18,1.3),(0,-.173,1.62),(0,-.191,1.9),(0,-.165,2.05)],.016,rib,body)
for z in [1.36,1.55,1.74,1.93,2.055]:
    ball('Cardigan black button',(0,-(.19 if z<2 else .18),z),(.027,.014,.027),black,body)
    for x in [-.006,.006]:ball('Button stitch',(x,-.207,z),(.002,.002,.005),silver,body,12,8)
for z,r in [(1.35,.3),(1.21,.36),(1.07,.415),(.94,.46)]:
    rings('Skirt layered pleats',[(z+.165,r*.84,r*.61),(z,r,r*.73)],skirt,64,.035,body)
    rings('Skirt black tier ribbon',[(z+.027,r*.982,r*.717),(z+.005,r,r*.73)],black,64,.035,body)
for side in [-1,1]:
    leg=bpy.data.objects.new('Leg_'+str(side),None);bpy.context.collection.objects.link(leg);leg.parent=body;leg.location=(side*.14,0,1.13)
    ball('Bare leg',(side*.14,0,.69),(.085,.086,.46),skin,leg)
    # Preserve world positions while giving animation a hip pivot.
    leg.children[-1].location-=leg.location
    o=ball('Ankle sock',(side*.14,-.005,.29),(.089,.09,.16),black,leg);o.location-=leg.location
    o=ball('Boot upper',(side*.14,-.015,.18),(.101,.11,.14),boot,leg);o.location-=leg.location
    o=ball('Platform boot toe',(side*.14,-.075,.09),(.11,.19,.085),boot,leg);o.location-=leg.location
    o=ball('Platform sole',(side*.14,-.07,.045),(.115,.194,.044),black,leg);o.location-=leg.location
    arm=bpy.data.objects.new('Arm_'+str(side),None);bpy.context.collection.objects.link(arm);arm.parent=body;arm.location=(side*.29,0,2.03)
    o=ball('Cardigan sleeve',(side*.345,0,1.77),(.105,.12,.32),knit,arm);o.rotation_euler[1]=side*.13;o.location-=arm.location
    o=ball('Sleeve rib cuff',(side*.39,-.018,1.48),(.09,.10,.055),rib,arm);o.location-=arm.location
    o=ball('Hand',(side*.395,-.02,1.365),(.064,.057,.103),skin,arm);o.location-=arm.location
    o=ball('Thumb',(side*.344,-.062,1.38),(.027,.03,.054),skin,arm);o.rotation_euler[1]=side*.25;o.location-=arm.location
# Small fabric flower on the photographed cardigan shoulder.
for i in range(5):
    a=i*2*pi/5;ball('Cardigan flower petal',(-.205+cos(a)*.033,-.177,2.065+sin(a)*.033),(.029,.014,.02),rib,body)
ball('Flower center',(-.205,-.193,2.065),(.014,.008,.014),knit,body)
tube('Silver necklace',[(-.105,-.06,2.21),(-.08,-.128,2.18),(0,-.155,2.12),(.08,-.128,2.18),(.105,-.06,2.21)],.004,silver,body)
ball('Necklace pendant',(0,-.166,2.115),(.012,.006,.018),silver,body)
# Sculpted face rings taper into an anime chin instead of a spherical head.
face=rings('Anime face sculpt',[(2.28,.025,.055),(2.32,.12,.12),(2.4,.218,.19),(2.52,.276,.224),(2.66,.294,.235),(2.8,.294,.23),(2.94,.27,.214),(3.045,.18,.15),(3.09,.025,.04)],skin,64,parent=body)
sub=face.modifiers.new('Smooth face','SUBSURF');sub.levels=2
bpy.context.view_layer.objects.active=face;bpy.ops.object.modifier_apply(modifier=sub.name)
for side in [-1,1]:
    ball('Ear',(side*.287,.003,2.58),(.055,.04,.09),skin,body)
    # Eyes sit on the front surface; layered convex shapes give clear anime eyes.
    x=side*.126
    ball('Eye white',(x,-.221,2.655),(.102,.025,.069),white,body,32,20)
    ball('Brown iris',(x-side*.007,-.247,2.655),(.048,.012,.057),iris,body,32,20)
    ball('Iris amber crescent',(x-side*.007,-.258,2.636),(.037,.004,.032),irisLight,body)
    ball('Pupil',(x-side*.007,-.263,2.663),(.022,.004,.035),pupil,body)
    ball('Eye catchlight',(x-.015,-.27,2.681),(.012,.004,.014),white,body,16,12)
    ball('Eye small glint',(x+.019,-.267,2.632),(.005,.003,.006),white,body,12,8)
    tube('Upper eyeliner',[(x-.102,-.229,2.656),(x-.06,-.247,2.706),(x,-.251,2.723),(x+.065,-.245,2.706),(x+.107,-.225,2.669)],.007,pupil,body)
    tube('Lower lash',[(x-.08,-.237,2.624),(x,-.251,2.592),(x+.077,-.233,2.628)],.0025,hairLight,body)
    tube('Outer lash',[(side*.208,-.238,2.69),(side*.243,-.218,2.711)],.005,pupil,body)
    tube('Eyebrow',[(side*.052,-.224,2.782),(side*.116,-.235,2.798),(side*.205,-.205,2.777)],.007,hair,body)
    ball('Cheek tint',(side*.198,-.192,2.516),(.031,.002,.008),blush,body)
    for i in range(5):
        a=i*2*pi/5;ball('Pearl flower earring',(side*.305+cos(a)*.015,-.028,2.51+sin(a)*.015),(.011,.009,.011),pearl,body,12,8)
    ball('Earring center',(side*.305,-.041,2.51),(.008,.006,.008),silver,body,12,8)
ball('Nose bridge',(0,-.224,2.535),(.024,.027,.05),skin,body)
ball('Nose tip',(0,-.25,2.507),(.027,.023,.021),skin,body)
tube('Soft smile',[(-.061,-.181,2.415),(-.027,-.195,2.411),(0,-.2,2.413),(.027,-.195,2.411),(.061,-.181,2.415)],.0045,lip,body)
ball('Lower lip',(0,-.197,2.4),(.035,.006,.009),lip,body)
# Hair cap covers only the crown and back, leaving the forehead and face visible.
v=[];f=[];n=64;rows=16
for k in range(rows):
    for j in range(n):
        a=2*pi*j/n;front=max(0,-sin(a));end=2.05-.83*front
        t=.025+(end-.025)*k/(rows-1)
        v.append((.319*sin(t)*cos(a),.266*sin(t)*sin(a)+.018,2.733+.405*cos(t)))
for k in range(rows-1):
    for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
cap=mesh('Swept hair crown',v,f,hair,body)
mod=cap.modifiers.new('Smooth swept crown','SUBSURF');mod.levels=1
bpy.context.view_layer.objects.active=cap;bpy.ops.object.modifier_apply(modifier=mod.name)
def strand(name,coords,width,mat=hair):
    # Curved tapered ribbon with rounded cross section, rather than round hair blobs.
    v=[];f=[]
    for k,p in enumerate(coords):
        w=width*(sin(pi*(k+.4)/(len(coords)+.3))**.6) if k<len(coords)-1 else .001
        for j in range(8):
            a=j*2*pi/8;v.append((p[0]+w*cos(a),p[1]+w*.28*sin(a),p[2]))
    for k in range(len(coords)-1):
        for j in range(8):a=k*8+j;b=k*8+(j+1)%8;f.append((a,a+8,b+8,b))
    o=mesh(name,v,f,mat,body)
    mod=o.modifiers.new('Smooth hair lock','SUBSURF');mod.levels=1
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
for i in range(13):
    x=(i-6)*.04
    strand('Wispy forehead fringe',[(x*.5,-.14,3.102),(x*.87,-.241,2.99),(x,-.257,2.88),(x*1.05,-.249,2.77+abs(x)*.22)],.018 if i%3 else .023,hairLight if i%4==0 else hair)
for side in [-1,1]:
    strand('Face framing side lock',[(side*.23,-.13,3.01),(side*.299,-.15,2.79),(side*.292,-.13,2.55),(side*.25,-.09,2.35)],.042)
    for i in range(5):
        x=side*(.025+i*.045)
        strand('Tied back hair length',[(x,.19,3.03),(x*1.1,.31,2.78),(x*.9+side*.02,.32,2.5),(x*.7+side*.1,.29,2.2),(x*.5+side*.09,.22,1.95+i*.02)],.065,hairLight if i==2 else hair)
# Black bow at the ponytail tie, readable from both front and rear.
for side in [-1,1]:
    o=ball('Black ribbon loop',(side*.125,.09,3.112),(.13,.045,.052),black,body);o.rotation_euler[1]=side*-.28
    strand('Ribbon tail',[(side*.04,.12,3.12),(side*.08,.14,2.99),(side*.12,.15,2.9)],.028,black)
ball('Ribbon knot',(0,.07,3.12),(.041,.038,.04),black,body)
# Combine parts by material within each animated group to reduce multiplayer draw calls.
groups={}
for o in list(parts):groups.setdefault((o.parent,o.data.materials[0]),[]).append(o)
for (parent,mat),objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name=parent.name+'__'+mat.name
parts=[o for o in root.children_recursive if o.type=='MESH']
# Export only the avatar. Meshes are intentionally rigid parts for cheap shared geometry
# and per-instance procedural walk animation in the 100-player game.
bpy.ops.object.select_all(action='DESELECT')
for o in [root,body]+list(root.children_recursive):o.select_set(True)
out=os.path.join(ROOT,'client','assets','models');os.makedirs(out,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'liv-reference-v1.glb'),export_format='GLB',use_selection=True,export_yup=True)
# Studio preview; lighting and backdrop are excluded from the GLB above.
ground=material('Studio warm grey',(.26,.28,.31))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));bpy.context.object.data.materials.append(ground)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.48,.55,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
def area(name,loc,power,size):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1.7))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large softbox',(-3,-4,6),450,4);area('Soft fill',(3,-2,3),220,3);area('Hair rim',(1,3,5),500,3)
bpy.ops.object.camera_add(location=(3.3,-8,3.4));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.6))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.65
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'modeling','liv','liv-reference-v1.blend'))
scene.render.filepath=os.path.join(ROOT,'modeling','liv','liv-preview.png');bpy.ops.render.render(write_still=True)
print('LIV_MODEL_READY',sum(len(o.data.polygons) for o in parts),len(parts))
