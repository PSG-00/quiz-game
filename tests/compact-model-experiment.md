# Appearance-preserving compact models

Branch: codex/model-compact-20261026. Original GLBs, their LODs, and normal URLs remain unchanged. This experiment uses offline meshoptimizer simplification and vertex compaction of the approved GLBs, not a new AI generation or a Blender rebuild.

## Compare on one physical device

- Original: http://localhost:3105/
- Compact at the original pixel budget: http://localhost:3105/?model=compact
- Compact with 20% more render pixels: http://localhost:3105/?model=compact&quality=crisp

Use the PC's LAN IP instead of localhost from a phone. These options apply to all six member models, including the local player, remote instancing, and avatar preview. Postprocessing, MSAA, shadows and material sidedness remain unchanged. Crisp uses no CAS pass unless a separate clarity query is explicitly added. Its maximum render budget is 2,073,600 pixels; the original remains 1,728,000. +20% pixels means about +9.5% linear resolution, not +20% width and height. Actual phone quality/FPS/thermal effects require device testing.

## Build and preservation

Run `node scripts/build-compact-avatars.cjs`, then pass all six compact basenames to `node scripts/build-avatar-lod.cjs` to rebuild their external LOD indices. Outputs have `-compact-v1.glb` names. No original asset is overwritten.

Face triangles and all face vertex attributes are retained exactly (only index numbering/vertex order changes). All embedded PNG bytes and texture resolutions are identical. Other parts use attribute-aware edge collapse with relative error limit .002, normal weights .3, UV weights 1 and skin-joint weights .7, and RegularizeLight/PreserveFolds options. Targets retain .22 of hair, .45 of torso, .60 of arm/leg indices, but the error/attribute constraints can stop before those targets. This is not a guaranteed Hausdorff or silhouette bound. Surviving positions/UVs/normals/skin bytes are copied exactly; unused vertices are removed consistently from every attribute. Original nodes, material settings, 11-joint bind rig and body height metadata are retained. Runtime rig enhancement still supplies the same 19 logical bones.

| Model | Original triangles | Compact triangles | Compact vertices |
|---|---:|---:|---:|
| Woni | 116009 | 38652 | 28446 |
| Liv | 87950 | 51760 | 46166 |
| Minami | 141191 | 49292 | 39838 |
| May | 65322 | 32016 | 28228 |
| May school | 70352 | 40778 | 32314 |
| Zena | 124060 | 42313 | 32915 |

Compact mid/low LOD triangle totals respectively: Woni 20945/11712; Liv 33169/20617; Minami 26229/14896; May 20893/13270; May school 24896/14397; Zena 24563/14926. LODs still share the compact vertex attributes. Compact LOD profiles use ratios .45/.24 with tighter error limits .004/.008 and PreserveFolds. Reusing the old aggressive LOD errors caused cap surface damage in a walking close-up; these limits preserve appearance at the expense of some triangle savings.

## Validation

`tests/compact-avatars.test.cjs` checks exact face triangle/attribute equivalence, identical image bytes, node/material/joint preservation, valid compact indices and matching LOD hashes/ranges. Render budget tests check opt-in gating and the 20% pixel bound. `scripts/audit-compact-avatars.cjs` renders original and compact models front/side/back at 512px in identical light/pose; the maximum silhouette foreground-mask disagreement across 18 standing comparisons was 0.1674% of the union. The same 18-view walking-pose check comparing compact LOD2 against original LOD0 reached maximum silhouette disagreement 1.386%. This comparison does not prove equality for every angle, animation, distance, or LOD. Images were visually inspected for major appearance changes.

`PROFILE_COMPACT=1 node scripts/profile-crowd.cjs` compares original/compact/crisp twice in a single browser with one 50-person room (48 moving bots, one stationary bot, browser). Reloads explicitly rejoin the waiting room. Final 1280x800 headless Chrome measurements: original 74.98/74.71 FPS, 129/115 draws, 1.418/1.652 million triangles; compact 74.94/74.60 FPS, 115 draws, 1.135/1.138 million triangles; crisp 71.92/75.05 FPS, 115/129 draws, 1.140/1.025 million triangles. The observed refresh ceiling was about 75 Hz. Moving positions and LOD occupancy vary, so these are scene samples, not a fixed guaranteed reduction. Earlier more aggressive compact LOD results are superseded by these final appearance-preserving results. Crisp drawing buffer was 1457x776 vs 1330x708. This establishes workload reduction, not guaranteed real-phone FPS improvement. CPU wall time around render submission is not GPU timing. Draw counts can vary with active LOD occupancy and visible positions.

`AUDIT_QUERY=/?model=compact&quality=crisp node scripts/audit-client-judgement.cjs` validates actual gameplay, walking, judgement, reconnect, spectator and overlay paths; AUDIT_MOBILE=1/AUDIT_DPR=3 selects a mobile viewport with high DPR, not a physical phone. Generated audit images, JSON and profiler results are in ignored artifacts/.
