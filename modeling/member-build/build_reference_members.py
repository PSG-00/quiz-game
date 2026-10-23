"""Build Zena red-beret and Woni black-tracksuit SD avatars from the user's references.
Run Blender --background --python this_file -- zena|woni.
"""
import bpy,bmesh,os,sys,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from math import sin,cos,pi
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHAR=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'zena';assert CHAR in ['zena','woni']
OUT=os.path.join(ROOT,'modeling',CHAR+'-sd');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v5','liv-solid-anime-wig-v5.blend'))
bpy.context.preferences.filepaths.save_version=0
for o in list(bpy.context.scene.objects):
 if not o.name.startswith(('Adapted original anime face','Original hands','Original leg geometry')):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene

def mat(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.88;return m
skin=mat('Soft peach skin',(.66,.44,.36));white=mat('Warm white fabric',(.60,.59,.56));black=mat('Deep black fabric',(.009,.011,.016));rubber=mat('Black rubber sole',(.005,.006,.009));silver=mat('Silver jewelry',(.60,.63,.65));red=mat('Crimson red trim',(.44,.006,.025))
helper=open(os.path.join(ROOT,'modeling','may-school-sd','build_may_school_sd.py'),encoding='utf-8').read();exec(helper[helper.index('def mesh('):helper.index('# Oversized knit body')])
for obj in scene.objects:
 if obj.name.startswith(('Original hands','Original leg geometry')):
  obj.data.materials.clear();obj.data.materials.append(skin)
  for polygon in obj.data.polygons:polygon.material_index=0;polygon.use_smooth=True
  if obj.name.startswith('Original leg geometry'):
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<.15],context='VERTS');bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(obj.data);bm.free()
if CHAR=='woni':
 for obj in list(scene.objects):
  if obj.name.startswith('Original leg geometry'):bpy.data.objects.remove(obj,do_unlink=True)
head=next(o for o in scene.objects if o.name.startswith('Adapted original anime face'))
for node in head.data.materials[0].node_tree.nodes:
 if node.type=='VALTORGB':node.color_ramp.elements[0].color=(.014,.009,.008,1);node.color_ramp.elements[1].color=(.27,.15,.085,1)
bpy.context.view_layer.update();bvh=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())

def toon(name,lo,hi):
 m=mat(name,lo);n=m.node_tree.nodes;l=m.node_tree.links;g=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.35,-.65,.72)).normalized();l.new(g.outputs['Normal'],dot.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.interpolation='EASE';r.color_ramp.elements[0].position=-.35;r.color_ramp.elements[0].color=(*lo,1);r.color_ramp.elements[1].position=.8;r.color_ramp.elements[1].color=(*hi,1);l.new(dot.outputs['Value'],r.inputs[0]);l.new(r.outputs[0],n.get('Principled BSDF').inputs['Base Color']);return m
hair=toon('Chestnut straight hair' if CHAR=='zena' else 'Cool black straight hair',(.041,.012,.006) if CHAR=='zena' else (.003,.004,.007),(.21,.082,.031) if CHAR=='zena' else (.027,.035,.049))
wig=bpy.data.objects.new('Liv_Wig_Complete_New_Model',None);scene.collection.objects.link(wig)
def wigmesh(name,v,f,m,sub=1):
 o=mesh(name,v,f,m,sub);o.parent=wig;return o
exec(open(os.path.join(ROOT,'modeling','member-build','build_woni_continuous_wig.py'),encoding='utf-8-sig').read())

def bare_arm(side):
 start=Vector((side*.144,.006,1.304));end=Vector((side*.292,0,.884));direction=(end-start).normalized();axis=Vector((0,1,0));cross=direction.cross(axis).normalized();v=[];f=[];n=40
 profile=[(0,.047),(.06,.048),(.24,.043),(.47,.035),(.55,.032),(.76,.030),(1,.026)]
 for t,r in profile:
  c=start.lerp(end,t)
  for j in range(n):a=j*2*pi/n;v.append(c+(axis*cos(a)+cross*sin(a))*r)
 for k in range(len(profile)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
 mesh('Bare arm '+str(side),v,f,skin,1)
 return start,end,axis,cross

def sleeve(side,start,end,axis,cross,profile,material,name):
 v=[];f=[];n=48
 for t,r in profile:
  c=start.lerp(end,t)
  for j in range(n):a=j*2*pi/n;wrinkle=1+.02*sin(3*a+t*18)*sin(pi*t);v.append(c+(axis*cos(a)+cross*sin(a))*r*wrinkle)
 for k in range(len(profile)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
 return mesh(name+' '+str(side),v,f,material,1)
if CHAR=='zena':
 # Soft asymmetric red beret, with no baseball visor or cat ears.
 beret=toon('Ruby red wool beret',(.27,.002,.012),(.72,.012,.034));v=[];f=[];n=96
 for z,rx,ry in [(1.650,.128,.107),(1.660,.139,.116),(1.696,.158,.136),(1.735,.146,.126),(1.757,.105,.092),(1.766,.025,.022),(1.766,.003,.003)]:
  for j in range(n):a=j*2*pi/n;v.append((rx*cos(a)-.016*max(0,(z-1.65)/.116),.015+ry*sin(a),z+.13*rx*cos(a)))
 for k in range(6):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 wigmesh('Soft tilted red beret',v,f,beret,1)
 tuft=ball('Beret small stem',(-.017,.015,1.773),(.008,.007,.014),red);tuft.parent=wig
 # Fitted white cap-sleeve shirt with a high round neckline.
 levels=[(1.0,.129,.088,0),(1.025,.131,.089,0),(1.08,.12,.081,0),(1.16,.13,.10,-.005),(1.23,.145,.11,-.005),(1.27,.145,.097,0)];v=[];f=[];n=80
 for z,rx,ry,cy in levels:
  for j in range(n):a=j*2*pi/n;v.append((rx*cos(a),cy+ry*sin(a),z))
 for j in range(n):a=j*2*pi/n;front=max(0,-sin(a));v.append((.056*cos(a),(.042+.045*front**2)*sin(a),1.365-.04*front**2))
 for k in range(len(levels)):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 mesh('White fitted round-neck tee',v,f,white,2)
 tube('White round collar',[(-.056,-.001,1.36),(-.046,-.057,1.34),(0,-.09,1.324),(.046,-.057,1.34),(.056,-.001,1.36)],.003,white)
 for side in [-1,1]:
  start,end,axis,cross=bare_arm(side);sleeve(side,start,end,axis,cross,[(0,.055),(.05,.059),(.18,.057),(.30,.053)],white,'Short white sleeve');ball('White tee shoulder '+str(side),(side*.139,.006,1.303),(.057,.059,.054),white)
  tube('Small gold hoop '+str(side),[(side*(.108+.008*cos(a)),-.014,1.481+.014*sin(a)) for a in [j*2*pi/28 for j in range(29)]],.0013,silver)
 # Subtle crystals and red ribbon fastenings, without copying tiny unreadable text.
 for row in range(4):
  for col in range(7):
   if (row+col)%3!=0:ball('Silver chest crystal',((col-3)*.011,-.115,1.12+row*.018),(.0018,.0012,.0023),silver)
 for z in [1.09,1.215]:
  for side in [-1,1]:tube('Red shirt bow',[(side*.026,-.117,z),(side*.046,-.119,z+.007),(side*.049,-.119,z-.004),(side*.026,-.117,z)],.0022,red)
 # Tartan uses crossed dark/ivory bands in a baked 3D material.
 plaid=mat('Burgundy red tartan',(.21,.014,.032));n=plaid.node_tree.nodes;l=plaid.node_tree.links;g=n.new('ShaderNodeNewGeometry');xyz=n.new('ShaderNodeSeparateXYZ');l.new(g.outputs['Position'],xyz.inputs[0]);masks=[]
 for axis,freq in [('X',105),('Z',126)]:
  mul=n.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=freq;l.new(xyz.outputs[axis],mul.inputs[0]);wave=n.new('ShaderNodeMath');wave.operation='SINE';l.new(mul.outputs[0],wave.inputs[0]);ab=n.new('ShaderNodeMath');ab.operation='ABSOLUTE';l.new(wave.outputs[0],ab.inputs[0]);masks.append(ab.outputs[0])
 dark_masks=[];fine_masks=[]
 for value in masks:
  d=n.new('ShaderNodeMath');d.operation='LESS_THAN';d.inputs[1].default_value=.45;l.new(value,d.inputs[0]);dark_masks.append(d.outputs[0]);q=n.new('ShaderNodeMath');q.operation='LESS_THAN';q.inputs[1].default_value=.075;l.new(value,q.inputs[0]);fine_masks.append(q.outputs[0])
 def union(values):
  node=n.new('ShaderNodeMath');node.operation='MAXIMUM';l.new(values[0],node.inputs[0]);l.new(values[1],node.inputs[1]);return node.outputs[0]
 mix=n.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.22,.014,.035,1);mix.inputs[2].default_value=(.013,.01,.014,1);l.new(union(dark_masks),mix.inputs[0]);fine=n.new('ShaderNodeMixRGB');fine.inputs[2].default_value=(.66,.60,.52,1);l.new(mix.outputs[0],fine.inputs[1]);l.new(union(fine_masks),fine.inputs[0]);l.new(fine.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
 for tier,(top,bottom,rt,rb) in enumerate([(1.018,.834,.132,.199),(.897,.727,.179,.224)]):
  v=[];f=[];count=96
  for z,radius in [(bottom,rb),(bottom+.005,rb),(top-.005,rt),(top,rt)]:
   for j in range(count):a=j*2*pi/count;fold=[1.025,1.025,.95,.95][j%4];v.append((radius*cos(a)*fold,.006+radius*.65*sin(a)*fold,z))
  for k in range(3):
   for j in range(count):a=k*count+j;b=k*count+(j+1)%count;f.append((a,b,b+count,a+count))
  o=mesh('Red tartan pleated skirt '+str(tier),v,f,plaid);mod=o.modifiers.new('Pleated cloth thickness','SOLIDIFY');mod.thickness=.0015
 # White watch on the reference's wrist, attached to the arm rig.
 c=Vector((.281,0,.943));tube('White wristwatch band 1',[c+Vector((.029*cos(a),.029*sin(a),0)) for a in [j*2*pi/32 for j in range(33)]],.004,white);ball('Watch face 1',(.281,-.030,.943),(.012,.003,.015),silver)
 # Lower footwear was not shown: use simple black Mary Janes and white ankle socks.
 for side in [-1,1]:
  rings('White ankle sock '+str(side),[(.134,.042,.045,0),(.24,.041,.043,0)],white,cx=side*.095)
  ball('Mary Jane sole '+str(side),(side*.095,-.039,.021),(.055,.108,.022),rubber);ball('Mary Jane upper '+str(side),(side*.095,-.043,.072),(.052,.103,.055),black)
  tube('Mary Jane strap '+str(side),[(side*.095-.044,-.012,.085),(side*.095,-.018,.127),(side*.095+.044,-.012,.085)],.0045,black)
  ball('Mary Jane buckle '+str(side),(side*.095+side*.042,-.015,.09),(.006,.004,.006),silver)
else:
 # Loose zip-up tracksuit jacket with a small stand collar and white piping.
 levels=[(.985,.157,.10,0),(1.01,.164,.108,0),(1.08,.167,.113,0),(1.16,.171,.12,0),(1.24,.172,.121,0),(1.28,.163,.105,0)];v=[];f=[];n=80
 for z,rx,ry,cy in levels:
  for j in range(n):a=j*2*pi/n;v.append((rx*cos(a),cy+ry*sin(a),z))
 for j in range(n):a=j*2*pi/n;front=max(0,-sin(a));v.append((.07*cos(a),(.045+.055*front**2)*sin(a),1.366-.075*front**3))
 for k in range(len(levels)):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 mesh('Loose black track jacket',v,f,black,2)
 rings('White elastic jacket hem',[(.979,.159,.103,0),(1.012,.166,.110,0)],white)
 tube('White jacket zipper',[(0,-.106,.985),(0,-.116,1.08),(0,-.124,1.20),(0,-.107,1.29)],.0033,white)
 tube('White open collar piping',[(-.069,-.001,1.366),(-.055,-.062,1.341),(0,-.109,1.287),(.055,-.062,1.341),(.069,-.001,1.366)],.003,white)
 ball('Silver zip pull',(0,-.111,1.26),(.006,.003,.010),silver)
 # Original white chest markings are represented by clean simple geometric stitches.
 for x in [-.053,-.041]:tube('Left chest monogram',[(x,-.123,1.17),(x,-.123,1.205)],.0023,white)
 tube('Left chest diagonal',[(-.053,-.123,1.205),(-.041,-.123,1.17)],.0023,white)
 for j in range(3):ball('Right chest stitched mark',(.041+j*.007,-.123,1.19),(.0023,.0015,.003),white)
 for side in [-1,1]:
  start=Vector((side*.15,.006,1.302));end=Vector((side*.280,.001,.929));direction=(end-start).normalized();axis=Vector((0,1,0));cross=direction.cross(axis).normalized()
  sleeve(side,start,end,axis,cross,[(0,.065),(.06,.067),(.2,.068),(.4,.062),(.65,.056),(.90,.048),(1,.042)],black,'Track sleeve');ball('Track shoulder '+str(side),(side*.145,.006,1.30),(.065,.067,.064),black)
  sleeve(side,start,end,axis,cross,[(.93,.046),(.96,.045),(1.01,.043)],white,'Track cuff')
  for angle in [-.95,-.45]:
   points=[]
   for t in [0,.12,.30,.5,.7,.9,.93]:
    radius=.069-.021*t;c=start.lerp(end,t);points.append(c+cross*side*(radius*cos(angle))+axis*(radius*sin(angle)))
   tube('Track sleeve stripe '+str(side),points,.0027,white)
 # Full wide trousers, with two white side stripes per leg.
 for side in [-1,1]:
  profile=[(.12,.074,.069,0),(.135,.076,.070,0),(.3,.075,.070,0),(.5,.073,.070,0),(.69,.077,.074,0),(.86,.083,.078,0),(.94,.080,.074,0)]
  rings('Track pant leg '+str(side),profile,black,cx=side*.094,fold=.012)
  for y in [-.032,-.010]:tube('Track pant stripe '+str(side),[(side*(.094+rx*.98),y,z) for z,rx,ry,cy in profile],.0025,white)
 rings('Black trouser hips',[(.83,.178,.09,0),(.88,.179,.094,0),(.97,.143,.09,0),(1.0,.138,.087,0)],black)
 clog=mat('Blue charcoal clogs',(.028,.042,.057))
 for side in [-1,1]:
  ball('Clog sole '+str(side),(side*.095,-.039,.021),(.058,.111,.022),rubber);ball('Clog upper '+str(side),(side*.095,-.043,.073),(.055,.107,.055),clog)
  for row in range(2):
   for col in [-1,0,1]:ball('Clog vent '+str(side),(side*.095+col*.021,-.065-row*.022,.121-row*.007),(.004,.005,.0016),rubber)
  tube('Clog heel strap '+str(side),[(side*.095-.05,.005,.073),(side*.095,.056,.082),(side*.095+.05,.005,.073)],.004,clog)
scene['reference']='User photographs: '+('red beret, chestnut center-part hair, white tee and red tartan skirt' if CHAR=='zena' else 'long black center-part hair, black/white striped zip tracksuit and dark clogs')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,CHAR+'-outfit-source.blend'))
source=open(os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),encoding='utf-8').read()
source=source.replace("'modeling','liv-v5','liv-solid-anime-wig-v5.blend'", "'modeling','"+CHAR+"-sd','"+CHAR+"-outfit-source.blend'")
source=source.replace("'modeling','liv-sd-v6'", "'modeling','"+CHAR+"-sd'").replace('liv-sd-v6',CHAR+'-sd-v1').replace('liv-v5-',CHAR+'-sd-v1-')
source=source.replace("'Soft cardigan shoulder'))","'Soft cardigan shoulder','Bare arm','Short white sleeve','White tee shoulder','White wristwatch','Watch face','Track sleeve','Track shoulder','Track cuff'))")
source=source.replace("'Platform boot sole'))","'Platform boot sole','White ankle sock','Mary Jane','Track pant','Clog'))")
source=source.replace("'Liv v5 solid anime hair'",repr(CHAR+' long center-part hair')).replace("'Liv_Approved_Anime_v5'",repr(CHAR+'_SD_Character')).replace("'opaque solid bangs, no cheek-side locks'",repr('center-part long hair, '+('red beret' if CHAR=='zena' else 'black tracksuit')))
source=source.replace("bake(part,'"+CHAR+"-sd-v1-'+name,1024 if name=='Body' else 512,True,True)","bake(part,'"+CHAR+"-sd-v1-'+name,1024 if name=='Body' or name.startswith('Leg') else 512,True,True,fresh_uv=name.startswith('Leg'))")
source=source.replace("for vertex in obj.data.vertices:vertex.co=sd_point(vertex.co)","for vertex in obj.data.vertices:\n   before=vertex.co.copy();vertex.co=sd_point(before)\n   if obj==hair:vertex.co.x=before.x*1.46;vertex.co.y=before.y*1.46")
source=source.replace("  obj.data.update()","  obj.data.update();obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))")
if CHAR=='woni':source=source.replace('woni-sd-v1','woni-sd-v3')
else:source=source.replace('zena-sd-v1','zena-sd-v2')
exec(compile(source,os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),'exec'))
