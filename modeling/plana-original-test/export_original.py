import bpy,json,hashlib
from pathlib import Path
source=Path('C:/Users/psg00/Downloads/새 폴더/Plana/Plana/Plana2.blend')
before=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.visible_get() and len(o.data.polygons)]
rigs={m.object for o in meshes for m in o.modifiers if m.type=='ARMATURE' and m.object}
bpy.ops.object.select_all(action='DESELECT')
for o in meshes+list(rigs):o.select_set(True)
bpy.context.view_layer.objects.active=next(iter(rigs))
materials=[]
for m in {m for o in meshes for m in o.data.materials if m}:
 outputs=[n for n in m.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output] if m.use_nodes else []
 materials.append({'name':m.name,'surface':[(n.name,[(l.from_node.name,l.from_node.type)for l in n.inputs['Surface'].links])for n in outputs]})
report={'sourceHash':before,'meshes':[o.name for o in meshes],'rigs':[(o.name,len(o.data.bones))for o in rigs],'materials':materials,'actions':[a.name for a in bpy.data.actions]}
Path('artifacts/plana-original-export-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
bpy.ops.export_scene.gltf(filepath=str(Path('client/assets/models/plana-original-test.glb').resolve()),export_format='GLB',use_selection=True,export_extras=False,export_animations=False,export_morph=True,export_skins=True,export_def_bones=False,export_apply=False)
assert hashlib.sha256(source.read_bytes()).hexdigest()==before
print('PLANA_ORIGINAL_EXPORTED_SOURCE_UNCHANGED',flush=True)
