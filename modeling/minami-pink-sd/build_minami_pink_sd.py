"""Minami SD pink-cap variant, modeled from the user's two reference photographs."""
import bpy,bmesh,os,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from math import sin,cos,pi
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT=os.path.join(ROOT,'modeling','minami-pink-sd');os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'modeling','liv-v5','liv-solid-anime-wig-v5.blend'))
bpy.context.preferences.filepaths.save_version=0
for o in list(bpy.context.scene.objects):
 if not o.name.startswith(('Adapted original anime face','Original hands','Original leg geometry')):bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene

def mat(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.85;return m
skin=mat('Warm peach skin',(.66,.44,.36));mint=mat('Turquoise mint tee',(.012,.43,.37));mintedge=mat('Mint collar and seams',(.012,.32,.29));pink=mat('Soft candy pink',(.70,.34,.44));darkpink=mat('Deep pink trim',(.45,.12,.24));pale=mat('Pale pink boot socks',(.72,.44,.51));white=mat('Warm ivory platform boots',(.60,.59,.55));silver=mat('Silver metal and crystals',(.62,.66,.69));charm=mat('White fluffy charm',(.91,.87,.82))

def toon(name,lo,hi):
 m=mat(name,lo);n=m.node_tree.nodes;l=m.node_tree.links;g=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.35,-.65,.72)).normalized();l.new(g.outputs['Normal'],dot.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.interpolation='EASE';r.color_ramp.elements[0].position=-.35;r.color_ramp.elements[0].color=(*lo,1);r.color_ramp.elements[1].position=.8;r.color_ramp.elements[1].color=(*hi,1);l.new(dot.outputs['Value'],r.inputs[0]);l.new(r.outputs[0],n.get('Principled BSDF').inputs['Base Color']);return m
hair=toon('Honey brown sculpted waves',(.045,.022,.010),(.24,.145,.063));cappink=toon('Pink cap painted shade',(.42,.17,.25),(.86,.48,.58))
# Shared verified geometry helpers; no existing outfit geometry is carried over.
helper=open(os.path.join(ROOT,'modeling','may-school-sd','build_may_school_sd.py'),encoding='utf-8').read();exec(helper[helper.index('def mesh('):helper.index('# Oversized knit body')])
for obj in scene.objects:
 if obj.name.startswith(('Original hands','Original leg geometry')):
  obj.data.materials.clear();obj.data.materials.append(skin)
  for polygon in obj.data.polygons:polygon.material_index=0;polygon.use_smooth=True
  if obj.name.startswith('Original leg geometry'):
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<.15],context='VERTS');bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bm.to_mesh(obj.data);bm.free()
head=next(o for o in scene.objects if o.name.startswith('Adapted original anime face'))
for node in head.data.materials[0].node_tree.nodes:
 if node.type=='VALTORGB':node.color_ramp.elements[0].color=(.009,.018,.026,1);node.color_ramp.elements[1].color=(.17,.32,.43,1)
bpy.context.view_layer.update();bvh=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
wig=bpy.data.objects.new('Liv_Wig_Complete_New_Model',None);scene.collection.objects.link(wig)
def wigmesh(name,v,f,m,sub=1):
 o=mesh(name,v,f,m,sub);o.parent=wig;return o
# Long complete back wig, with a wide front opening and gently scalloped waves.
v=[];f=[];rows=52;cols=96
for k in range(rows+1):
 t=k/rows
 for j in range(cols):
  a=j*2*pi/cols;angle=abs(math.atan2(sin(a),cos(a)));front=max(0,min(1,(1.43-angle)/.42));front=front*front*(3-2*front);bottom=1.045+.545*front+.012*cos(5*a)*(1-front)
  z=1.702+(bottom-1.702)*t
  if z>=1.56:width=math.sqrt(max(.00001,1-((z-1.56)/.145)**2))
  else:width=1+.08*sin((1.56-z)*15)*min(1,(1.56-z)/.16)
  neck=max(0,min(1,(1.56-z)/.22));neck=neck*neck*(3-2*neck);taper=1-.20*max(0,(1.16-z)/.12);rx=.127*width*taper;ry=(.12-.025*neck)*width
  back=max(0,min(1,(1.50-z)/.36));back=back*back*(3-2*back)
  v.append((rx*sin(a),.014-ry*cos(a)+.045*back*(1-front),z))
for k in range(rows):
 for j in range(cols):a=k*cols+j;b=k*cols+(j+1)%cols;f.append((a,a+cols,b+cols,b))
wigmesh('Long complete wavy back wig',v,f,hair)
def bez(a,b,c,d,t):return a*(1-t)**3+b*3*t*(1-t)**2+c*3*t*t*(1-t)+d*t**3
# Broad opaque fringe with a soft side sweep, not individual hair fibers.
for i,(start,end,w) in enumerate([(-.035,-.100,.026),(-.020,-.068,.029),(-.003,-.032,.030),(.014,.012,.030),(.03,.056,.029),(.043,.100,.026)]):
 v=[];f=[];nr=28;nc=10
 for k in range(nr+1):
  t=k/nr;c=bez(Vector((start,-.022,1.692)),Vector((start-.008,-.09,1.664)),Vector((end-.013,-.13,1.59)),Vector((end,-.112 if abs(end)<.08 else -.073,1.551+abs(end)*.12)),t);width=w*(.7+.3*sin(pi*t))*math.sqrt(max(0,1-t**4))
  for j in range(nc+1):
   u=2*j/nc-1;p=c.copy();p.x+=u*width;q=1-(p.x/.13)**2-((p.z-1.56)/.145)**2
   if q>0:p.y=min(p.y,.014-.123*math.sqrt(q)-.003)
   hit=bvh.ray_cast(Vector((p.x,-.5,p.z)),Vector((0,1,0)),1)
   if hit[0] is not None and p.z<1.64:p.y=min(p.y,hit[0].y-.006)
   v.append(p)
 for k in range(nr):
  for j in range(nc):a=k*(nc+1)+j;f.append((a,a+nc+1,a+nc+2,a+1))
 o=wigmesh('Swept solid fringe '+str(i),v,f,hair);mod=o.modifiers.new('Opaque hair thickness','SOLIDIFY');mod.thickness=.0015
# Six thick sculpted locks flow in front of the shoulders into broad S-curves.
for side in [-1,1]:
 for lock in range(3):
  v=[];f=[];n=16;nr=44;offset=(lock-1)*.015
  for k in range(nr+1):
   t=k/nr;z=1.65-.60*t+(lock-1)*.010;cx=side*(.081+.024*min(1,t/.15)+.014*sin(t*pi*2.2)+.010*t+offset);cy=-.020-.080*sin(min(1,t*1.9)*pi/2)-.008*lock
   width=(.021 if lock==1 else .019)*math.sqrt(max(.002,min(1,t/.10)))*(.8+.2*sin(pi*t))*max(.035,math.sqrt(max(0,1-t**5)))
   for j in range(n):a=j*2*pi/n;v.append((cx+width*cos(a),cy+.015*sin(a)*max(.1,1-t*t),z+.006*cos(a)*sin(pi*t)))
  for k in range(nr):
   for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
  wigmesh('Broad front wave '+str(side)+' '+str(lock),v,f,hair)
exec(open(os.path.join(ROOT,'modeling','member-build','build_minami_continuous_cap.py'),encoding='utf-8-sig').read())
for x in [-.084,0,.084]:
 y=.008-.117*math.sqrt(max(0,1-(x/.138)**2))-.070*(1-(x/.138)**2);z=1.652
 for s in [-1,1]:tube('White cap bow',[(x,y-.002,z),(x+s*.012,y-.004,z+.006),(x+s*.014,y-.004,z-.002),(x,y-.003,z)],.0012,white)
# Mint scoop-neck tee, fitted torso and short sleeves over bare relaxed arms.
levels=[(.997,.129,.088,0),(1.01,.134,.091,0),(1.07,.124,.083,0),(1.14,.128,.097,-.005),(1.21,.142,.110,-.008),(1.255,.145,.102,0)]
v=[];f=[];n=80
for z,rx,ry,cy in levels:
 for j in range(n):a=j*2*pi/n;v.append((rx*cos(a),cy+ry*sin(a),z))
for j in range(n):
 a=j*2*pi/n;front=max(0,-sin(a));v.append((.059*cos(a),(.041+.066*front**2)*sin(a),1.366-.075*front**2))
for k in range(len(levels)):
 for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
mesh('Mint fitted scoop-neck tee',v,f,mint,2)
tube('Mint collar',[(-.059,-.001,1.36),(-.049,-.066,1.325),(0,-.110,1.289),(.049,-.066,1.325),(.059,-.001,1.36)],.003,mintedge)
rings('Mint tee hem',[(.995,.130,.09,0),(1.012,.133,.091,0)],mintedge)
# Small painted-like silver rhinestones keep the shirt graphic readable at game scale.
for row in range(4):
 for col in range(7):
  x=(col-3)*.012;z=1.115+row*.019
  if (row+col)%3!=0:ball('Silver tee crystal',(x,-.111+.20*x*x,z),(.0024,.0015,.0026),silver)
for side in [-1,1]:
 start=Vector((side*.144,.006,1.304));end=Vector((side*.292,0,.884));axis=(end-start).normalized();cross=axis.cross(Vector((0,1,0))).normalized();v=[];f=[];n=40
 profile=[(0,.047),(.06,.048),(.24,.043),(.47,.035),(.55,.032),(.76,.030),(1,.026)]
 for t,r in profile:
  c=start.lerp(end,t)
  for j in range(n):a=j*2*pi/n;v.append(c+(Vector((0,1,0))*cos(a)+cross*sin(a))*r)
 for k in range(len(profile)-1):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
 mesh('Bare arm '+str(side),v,f,skin,1)
 v=[];f=[]
 for t,r in [(0,.057),(.05,.060),(.15,.058),(.27,.054),(.31,.053)]:
  c=start.lerp(end,t)
  for j in range(n):a=j*2*pi/n;v.append(c+(Vector((0,1,0))*cos(a)+cross*sin(a))*r)
 for k in range(4):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,a+n,b+n,b))
 mesh('Short mint sleeve '+str(side),v,f,mint,1);ball('Mint shoulder '+str(side),(side*.139,.006,1.303),(.057,.059,.054),mint)
 # Pink wrist bangles lie around the forearm, attached to the arm's walking rig.
 c=start.lerp(end,.83)
 for ring in range(3):tube('Wrist bangle '+str(side)+' '+str(ring),[c+axis*(ring-.8)*.009+(Vector((0,1,0))*cos(a)+cross*sin(a))*.033 for a in [j*2*pi/32 for j in range(33)]],.0023,pink if ring%2==0 else darkpink)
# Rosette print uses a 3D procedural pattern, baked into the cloth atlas.
printpink=mat('Pink leopard rosette fabric',(.7,.34,.44));n=printpink.node_tree.nodes;l=printpink.node_tree.links;g=n.new('ShaderNodeNewGeometry');voro=n.new('ShaderNodeTexVoronoi');voro.inputs['Scale'].default_value=62;l.new(g.outputs['Position'],voro.inputs['Vector']);r=n.new('ShaderNodeValToRGB');r.color_ramp.interpolation='CONSTANT';r.color_ramp.elements[0].position=.0;r.color_ramp.elements[0].color=(.76,.40,.49,1);r.color_ramp.elements[1].position=.29;r.color_ramp.elements[1].color=(.76,.4,.49,1);mid=r.color_ramp.elements.new(.215);mid.color=(.23,.07,.12,1);l.new(voro.outputs['Distance'],r.inputs[0]);l.new(r.outputs[0],n.get('Principled BSDF').inputs['Base Color'])
for tier,(top,bottom,rt,rb) in enumerate([(1.01,.87,.133,.177),(.93,.78,.162,.206),(.84,.702,.194,.225)]):
 v=[];f=[];n=112
 for z,radius in [(bottom,rb),(bottom+.005,rb),(top-.005,rt),(top,rt)]:
  depth=(top-z)/(top-bottom)
  for j in range(n):a=j*2*pi/n;fold=1+(.012+.043*depth)*cos(20*a);v.append((radius*cos(a)*fold,.006+radius*.65*sin(a)*fold,z+.003*sin(20*a)*depth))
 for k in range(3):
  for j in range(n):a=k*n+j;b=k*n+(j+1)%n;f.append((a,b,b+n,a+n))
 mesh('Pink ruffle skirt tier '+str(tier),v,f,printpink if tier<2 else pink,1)
 rings('Pink ruffle hem '+str(tier),[(bottom,rb*1.003,rb*.653,.006),(bottom+.008,rb*.993,rb*.646,.006)],pale,fold=.05,n=112)
# Pink-and-white lace-up platform boots.
for side in [-1,1]:
 rings('Pink boot sock '+str(side),[(.33,.041,.043,0),(.43,.040,.041,0)],pale,cx=side*.095)
 rings('Boot shaft '+str(side),[(.13,.049,.055,0),(.18,.050,.054,0),(.27,.050,.052,0),(.35,.053,.053,0)],white,cx=side*.095)
 rings('Boot pink top cuff '+str(side),[(.34,.054,.054,0),(.359,.054,.054,0)],pink,cx=side*.095)
 ball('Boot platform sole '+str(side),(side*.095,-.039,.020),(.060,.118,.025),white)
 ball('Boot rounded toe '+str(side),(side*.095,-.045,.073),(.057,.110,.058),white)
 mesh('Boot pink lace tongue '+str(side),[(side*.095-.026,-.057,.155),(side*.095+.026,-.057,.155),(side*.095+.029,-.055,.343),(side*.095-.029,-.055,.343)],[(0,1,2,3)],pink)
 for k in range(6):
  z=.17+k*.027
  tube('Boot crossing lace '+str(side),[(side*.095-.026,-.061,z),(side*.095+.026,-.061,z+.025)],.0016,darkpink)
  tube('Boot crossing lace '+str(side),[(side*.095+.026,-.062,z),(side*.095-.026,-.062,z+.025)],.0016,darkpink)
 tube('Boot toe pink strap '+str(side),[(side*.095-.046,-.068,.10),(side*.095,-.092,.127),(side*.095+.046,-.068,.10)],.004,pink)
 tube('Silver hoop '+str(side),[(side*(.108+.012*cos(a)),-.02,1.481+.021*sin(a)) for a in [j*2*pi/32 for j in range(33)]],.0016,silver)
# Fine necklace and pink cat-outline pendant, plus a fluffy charm hanging at the waist.
tube('Silver necklace chain',[(-.042,-.017,1.381),(-.035,-.069,1.331),(0,-.113,1.282),(.035,-.069,1.331),(.042,-.017,1.381)],.001,silver)
cat=[(-.013,1.284),(-.014,1.297),(-.005,1.292),(.005,1.292),(.014,1.297),(.013,1.284),(.015,1.275),(.009,1.269),(-.009,1.269),(-.015,1.275),(-.013,1.284)]
tube('Pink cat pendant',[(x,-.118,z) for x,z in cat],.0015,pink)
tube('Silver waist chain',[(-.055,-.108,1.20),(-.068,-.112,1.12),(-.061,-.111,1.03)],.0013,silver)
ball('Fluffy white charm',(-.061,-.116,1.045),(.017,.011,.021),charm)
scene['reference']='Minami: pink cat-ear cap with white bows, honey-brown waves, turquoise tee, pink leopard ruffle skirt, pink-white platform boots'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'minami-pink-outfit-source.blend'))
source=open(os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),encoding='utf-8').read()
source=source.replace("'modeling','liv-v5','liv-solid-anime-wig-v5.blend'","'modeling','minami-pink-sd','minami-pink-outfit-source.blend'")
source=source.replace("'modeling','liv-sd-v6'","'modeling','minami-pink-sd'").replace('liv-sd-v6','minami-pink-sd-v1').replace('liv-v5-','minami-pink-sd-v1-')
source=source.replace("'Soft cardigan shoulder'))","'Soft cardigan shoulder','Bare arm','Short mint sleeve','Mint shoulder','Wrist bangle'))")
source=source.replace("'Platform boot sole'))","'Platform boot sole','Pink boot sock','Boot'))")
source=source.replace("'Liv v5 solid anime hair'","'Minami long waves and pink cat cap'").replace("'Liv_Approved_Anime_v5'","'Minami_Pink_SD_Character'").replace("'opaque solid bangs, no cheek-side locks'","'opaque honey-brown waves, pink cat-ear cap'")
source=source.replace("bake(part,'minami-pink-sd-v1-'+name,1024 if name=='Body' else 512,True,True)","bake(part,'minami-pink-sd-v1-'+name,1024 if name=='Body' or name.startswith('Leg') else 512,True,True,fresh_uv=name.startswith('Leg'))")
source=source.replace("for vertex in obj.data.vertices:vertex.co=sd_point(vertex.co)","for vertex in obj.data.vertices:\n   before=vertex.co.copy();vertex.co=sd_point(before)\n   if obj==hair:vertex.co.x=before.x*1.46;vertex.co.y=before.y*1.46")
source=source.replace("  obj.data.update()","  obj.data.update();obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))")
source=source.replace('minami-pink-sd-v1','minami-pink-sd-v2')
exec(compile(source,os.path.join(ROOT,'modeling','liv','export_liv_sd_v6_game.py'),'exec'))
