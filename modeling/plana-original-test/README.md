# Local original PLANA stress test

Source: user-provided `C:/Users/psg00/Downloads/새 폴더/Plana/Plana/Plana2.blend`.
This is NOT one of the retired, edited PLANA member variants. The source file
is opened with scripts disabled, never saved, and SHA-256 is checked before/after.

Export with the local Blender tool:

```
artifacts/tools/blender-4.5.3-windows-x64/blender.exe --background --factory-startup --disable-autoexec --python modeling/plana-original-test/export_original.py
```

The generated self-contained GLB is `client/assets/models/plana-original-test.glb`
(66,979,180 bytes in this export). It and the original preview PNG are local-only
ignored assets, not uploaded with the code branch. Copy original Preview2.png to
client/assets/models/plana-original-preview.png to reproduce the picker preview.

No decimation, remeshing, LOD, texture resizing, atlas, new body proportions or
replacement rig is applied. Visible character meshes and the armature used by
their modifiers are selected; invisible rig UI widgets/cameras/lights are not
character meshes. Blender exporter compatibility determines which Blender-only
modifiers/shader features can be represented. The resulting GLB has 13 glTF
meshes/26 material primitives, 72,514 triangles, 26 images (up to 4096x4096),
1,675 original joints, and facial morph data retained. Only SunAction existed,
so there is no character walk animation to play.

The web adapter applies a uniform fit and ground placement, retaining the
original proportions. r128 cannot compile the source's many unused morph inputs
together with skinning on the tested GPU; their default weights are all zero,
so the adapter disables unused morph shader inputs without changing GLB data.
Blender's emission-only exports lost PNG alpha on eye/line layers. The adapter
uses the same unchanged RGBA images as unlit maps with alpha-test .01, opaque
depth-writing cutouts. This is a rendering compatibility conversion; it does
not reproduce every Blender-specific shader effect. Materials are not merged.

Remote instances use the existing instancing renderer, full detail at every
distance. They share the original neutral bone palette (no invented walk clip).
The local player retains the original skeleton. All characters move around in
their original pose. The stored avatar/geometry data is not simplified. If the
GPU cannot support the wide palette texture, the existing individual-model
fallback is used. Low-spec mode is initially off on test=plana URLs.

Run a separate local server with PORT=3106, OX_PLANA_TEST=1,
OX_PUBLIC_TEST_BOTS=0, OX_DISABLE_PERSISTENCE=1. It makes one room with 49 PLANA
bots and one human slot; every participant is forced to the same test avatar.
The previous 3105 server/48-bot room need not restart. Test URL:

http://localhost:3106/?model=atlas&quality=ultra&aa=fxaa&test=plana

model=atlas/quality=ultra retain the accepted +50% pixel setting; PLANA itself
does not load atlas assets. PC-only FXAA behavior is unchanged. On test=plana,
the six unrelated member GLBs are not eagerly loaded. Ordinary pages keep the
previous six choices; the original PLANA card is visible only in this test page.

Validation: 145 tests passed including isolated 49-bot/one-human capacity and
forced-avatar rules, and existing room/avatar behavior. Browser audits confirmed
50 PLANA players, 49 remote instances at original detail, original 1,675 bones,
26 local material meshes, approximately 3.63 million scene triangles and no page
or shader errors, on desktop and mobile-viewport/DPR3 Chrome. GPU compiler
warnings about the generic crowd pose function were observed; no visual failure
remained after alpha compatibility correction. This is not a physical-phone FPS
measurement. Original source/export/audit reports and screenshots are in artifacts/.
