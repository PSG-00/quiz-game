# Prepared atlas models, 50% render pixels, PC FXAA

## Approved defaults (2026-10-26)

On `codex/ox-race-20261026`, a plain URL now selects atlas models and the same +50% render-pixel budget previously requested with `model=atlas&quality=ultra`. PC enables FXAA by default; coarse-pointer/small-touch devices render directly with no postprocess target. The quality comparison button has been removed; FPS is the only rendering-status overlay on either device. Explicit model/quality parameters remain available for audits, with `aa=off` as the PC FXAA opt-out. Earlier experiment notes below describe the original opt-in comparison.

Branch: codex/avatar-atlas-50p-20261026. Baseline compact models remain on codex/model-compact-20261026 (b11f0cc). Original and compact assets are retained. No server/game-rule code changes.

## Comparison URLs

- Original assets/resolution: /
- Prepared 2-mesh models, original resolution: /?model=atlas
- Prepared models, 50% more render pixels: /?model=atlas&quality=ultra
- Same, plus requested PC FXAA: /?model=atlas&quality=ultra&aa=fxaa

The normal URL retains original assets/resolution and no postprocessing. The palette deduplication improvement applies to both original and prepared instancing. Existing model=compact and quality=crisp comparisons remain available. Ultra means 1.5 times pixel count, about 1.2247 times width/height; maximum render budget 2,592,000 versus 1,728,000. There is no claim of 50% more width and height. The pixel budget is fixed by URL and screen dimensions/DPR, not adapted based on FPS.

## Offline model preparation

Run `node scripts/build-avatar-atlases.cjs` then `node scripts/build-atlas-models.cjs`. Intermediate atlas PNGs/JSON are generated beside compact assets and ignored by Git. Final `*-atlas-v1.glb` files embed the two images, 19-joint prepared rig, and two meshes/materials; associated LOD files retain the compact model's exact triangles per level. The runtime performs no canvas atlas generation or mesh merging. The shared AvatarRig recognizes an already prepared 19-joint rig and skips enhancement.

Faces, hair, clothing, UV content and texture dimensions are not regenerated or downsampled. The previous compact geometry is reused. The offline merge runs AFTER rig enhancement, so each vertex already has its final head/torso/arm/leg influences. Vertices/normals are transformed into a common bind space and corresponding LOD indices receive vertex offsets. This preserves the same walk hierarchy and weights. Each original texture occupies a slot at its original pixel size with an 8-pixel extruded border. Separate MeshBasic and MeshToon materials preserve lighting behavior; original DoubleSide settings remain. No appearance-risking name-based backface culling or aggressive new simplification is added.

The head/hair and body/limbs groups each use one image and material. This reduces 7 meshes/materials to 2. Atlas padding/packing increases estimated RGBA8 base-level texture storage across six models from 192 MiB to 222.305 MiB (+15.8%); mipmaps and actual driver formats add overhead. This is a memory/quality tradeoff, not a blanket reduction in texture memory. Atlas files are not KTX2/Draco compressed. No image quality is sacrificed to fit a 1024px atlas.

## Animation and antialiasing

InstancedAvatars shares identical bone palette textures across parts and LODs. Before this change, each of 7 parts and 3 LODs allocated a separate copy: 842,688 bytes/model. Current measured six-model palette storage is 240,768 bytes total (40,128/model), compared with 5,056,128 bytes total previously. Matrix contents must compare exactly before sharing; different bind transforms keep separate palettes. This is bone-matrix texture animation, not vertex VAT. The local player retains a live 19-joint rig; remotes retain independent phase, blend and heading.

PC FXAA restores the same r128 NVIDIA shader removed in commit 88a39fb, retaining its license. It uses the existing postprocess wrapper with raw RGBA8 encoded color storage and packed 24/8 depth/stencil, not the old 16-bit depth target. It adds one fullscreen triangle/draw. On the aa=fxaa URL, the bottom-left 화질 button toggles FXAA/direct without reloading. Coarse-pointer or small touch devices ignore the PC FXAA request and render directly. No MSAA or shadows are enabled. CAS/upscale comparisons remain separate; FXAA mode does not combine two postprocessing passes. Support/failure fallback uses the existing wrapper.

## Validation and measured limits

- 143 unit tests passed, including exact compact face/texture preservation, 2-mesh/2-image/19-joint GLB structure, source texture slot dimensions, nonoverlapping atlas rectangles, unchanged compact triangle totals/LOD counts, valid indices/source hashes, and 50% pixel-budget gating.
- Six saved GLBs were reloaded and compared with original LOD0 front/side/back under identical lighting at 512px. The same checks ran in a walking pose at compact LOD2. All remained below the 3.5% silhouette-mask test threshold; images were visually inspected. This does not prove pixel identity for every angle or pose. Atlas packing/filtering can slightly change sampled edge colors.
- PC browser gameplay regression passed with model=atlas, quality=ultra and aa=fxaa. Mobile viewport/DPR3 passed with the same query and confirmed FXAA off, no postprocess target, actual local model 2 meshes/19 logical bones, normal walking/judgement/reconnect/spectator behavior and no page errors. Mobile viewport results are not physical-phone performance measurements.
- The clarity audit compiled FXAA, checked one extra draw, 24-bit depth preservation, switching and fallback. CAS strength-zero identity tests still passed.
- Khronos glTF Validator 2.0.0-dev.3.10 reported zero errors for all six final GLBs. Each has two warnings about skinned nodes under an identity grouping node, plus informational NPOT image dimensions. The prepared models were tested in the actual r128 loader; these warnings are not claimed to be absent. Empty child arrays were omitted to satisfy the glTF node schema.

`PROFILE_ATLAS=1 node scripts/profile-crowd.cjs` uses one isolated 50-person room (48 moving bots, one stationary bot, browser), measures modes sequentially twice, and excludes startup warmup. Recorded 1280x800 headless Chrome results:

| Mode | FPS runs | Scene draws | Approx scene triangles | Drawing buffer |
|---|---|---:|---:|---|
| Original | 75.00 / 74.98 | 115 | 1.66 million | 1330x708 |
| Atlas | 74.82 / 74.90 | 64 | 1.03 million | 1330x708 |
| Atlas +50% pixels | 74.94 / 75.01 | 64 | 1.03 million | 1629x868 |
| Same + PC FXAA | 74.93 / 74.89 | 65 | 1.03 million | 1629x868 |

Observed rAF ceiling was about 75 Hz. This establishes reduced draw submission/geometry work, not guaranteed 100/144 FPS on a phone or laptop. CPU wall time around render submission was roughly 2.0–2.3ms original vs .95–1.18ms for atlas/options in this run; it is NOT GPU timing. Positions/LOD occupancy vary, so draw counts and triangles are not universal constants. Actual devices must be compared with the same room, monitor refresh, power mode and thermal conditions. Detailed reports/images are in ignored artifacts/.
