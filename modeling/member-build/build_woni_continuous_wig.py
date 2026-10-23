"""Woni's entire hair is ONE connected, closed wig surface.
Executed in build_reference_members.py, replacing all scalp/curtain pieces.
"""
def wig_smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
verts=[(0,.014,1.707)];faces=[];rows=76;cols=128
for k in range(1,rows+1):
 t=k/rows
 for j in range(cols):
  angle=j*2*pi/cols;front_angle=abs(math.atan2(sin(angle),cos(angle)))
  forehead=1-wig_smooth(.60,1.00,front_angle)
  bottom=.995+.627*forehead-.046*forehead*sin(angle)**2+.007*(1-forehead)*cos(6*angle)
  if t<=.32:
   theta=1.105*(t/.32);z=1.56+.147*cos(theta);rx=.129*sin(theta);ry=.124*sin(theta)
  else:
   z=1.626+(bottom-1.626)*(t-.32)/.68
   if z>=1.56:
    shape=math.sqrt(max(.000001,1-((z-1.56)/.147)**2));rx=.129*shape;ry=.124*shape
   else:
    depth=wig_smooth(1.10,1.52,z);rx=.125+.004*depth;ry=.092+.032*depth
  drop=1-wig_smooth(1.20,1.55,z)
  front_curtain=math.exp(-((front_angle-1.08)/.40)**2)
  back=wig_smooth(1.52,2.25,front_angle)
  taper=1-.10*(1-wig_smooth(1.00,1.14,z))
  # Broad ridges are sculpted into this same sheet, never separate hair tubes.
  sculpt=1+.014*cos(8*angle+.18*drop)*wig_smooth(.04,.28,t)
  x=(rx*taper*sin(angle)-.010*front_curtain*drop*(1 if sin(angle)>=0 else -1))*sculpt
  y=.014-ry*cos(angle)-.061*front_curtain*drop+.042*back*drop
  # A shallow center-part depression flows over the crown into the forehead.
  part=math.exp(-(sin(angle)/.10)**2)*max(0,cos(angle))*wig_smooth(1.62,1.68,z)
  y+=.0036*part*min(1,rx/.06)
  verts.append((x,y,z))
for j in range(cols):faces.append((0,1+(j+1)%cols,1+j))
for k in range(rows-1):
 for j in range(cols):
  a=1+k*cols+j;b=1+k*cols+(j+1)%cols;faces.append((a,a+cols,b+cols,b))
obj=wigmesh(CHAR+' single continuous center-part wig',verts,faces,hair,1)
solid=obj.modifiers.new('Closed wig volume and joined hem','SOLIDIFY');solid.thickness=.005;solid.offset=0;solid.use_even_offset=False
# Verify actual evaluated topology, including rounded surface and solid rim.
bpy.context.view_layer.update();evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());checked=bpy.data.meshes.new_from_object(evaluated)
bm=bmesh.new();bm.from_mesh(checked);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
remaining=set(bm.verts);components=0
while remaining:
 components+=1;stack=[remaining.pop()]
 while stack:
  vertex=stack.pop()
  for edge in vertex.link_edges:
   other=edge.other_vert(vertex)
   if other in remaining:remaining.remove(other);stack.append(other)
assert components==1,('Disconnected wig geometry',components)
assert not any(edge.is_boundary for edge in bm.edges),'Open wig seam'
bm.free();bpy.data.meshes.remove(checked)
obj['continuous_wig']=True;obj['connected_components']=1;obj['closed_surface']=True
wig['construction']='One continuous manifold wig, crown through side/back hair to hem; no attached curtain tubes'
print(CHAR.upper()+'_WIG_TOPOLOGY_VERIFIED: one connected closed surface',flush=True)
