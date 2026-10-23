"""One connected cap: sculpted cat-ear crown and visor share the same surface."""
verts=[(0,.016,1.753)];faces=[];nr=32;n=128
for k in range(1,nr+1):
 theta=(pi/2)*k/nr
 for j in range(n):
  a=j*2*pi/n;x=.139*sin(theta)*sin(a);y=.016-.127*sin(theta)*cos(a);z=1.659+.094*cos(theta)
  for side in [-1,1]:
   distance=abs(x-side*.085)/.036
   if distance<1:z+=.058*(1-distance)**1.35*math.exp(-((y-.003)/.034)**2)
  verts.append((x,y,z))
for j in range(n):faces.append((0,1+(j+1)%n,1+j))
for k in range(nr-1):
 for j in range(n):a=1+k*n+j;b=1+k*n+(j+1)%n;faces.append((a,a+n,b+n,b))
# The front hem vertices themselves become the visor's first row.
front_indices=list(range(-n//4,n//4+1));last=[1+(nr-1)*n+(j%n) for j in front_indices];edge_left,last_right=last[0],last[-1]
for k in range(1,11):
 t=k/10;row=[]
 for column,j in enumerate(front_indices):
  if column==0:row.append(edge_left);continue
  if column==len(front_indices)-1:row.append(last_right);continue
  a=j*2*pi/n;c=max(0,cos(a));row.append(len(verts));verts.append((.139*sin(a),.016-.127*c-.085*t*c**1.4,1.659-.022*t*c**.6))
 for j in range(len(row)-1):
  face=tuple(dict.fromkeys((last[j],row[j],row[j+1],last[j+1])))
  if len(face)>=3:faces.append(face)
 last=row
obj=wigmesh('Minami continuous sculpted cat-ear baseball cap',verts,faces,cappink,1)
solid=obj.modifiers.new('Closed cap and visor volume','SOLIDIFY');solid.thickness=.0035;solid.offset=0;solid.use_even_offset=False
bpy.context.view_layer.update();evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());check=bpy.data.meshes.new_from_object(evaluated);bm=bmesh.new();bm.from_mesh(check);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
remaining=set(bm.verts);components=0
while remaining:
 components+=1;stack=[remaining.pop()]
 while stack:
  vertex=stack.pop()
  for edge in vertex.link_edges:
   other=edge.other_vert(vertex)
   if other in remaining:remaining.remove(other);stack.append(other)
assert components==1,('Disconnected cap',components)
assert not any(edge.is_boundary for edge in bm.edges),'Open cap seam'
bm.free();bpy.data.meshes.remove(check)
obj['continuous_cap']=True;obj['cap_connected_components']=1;obj['integrated_cat_ears']=True;obj['integrated_visor']=True
print('MINAMI_CAP_TOPOLOGY_VERIFIED: crown, sculpted ears and visor are one connected surface',flush=True)
