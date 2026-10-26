# Optional clarity experiment

Stable baseline: `codex/save-smooth-50p-20261026` at `48ac5b5`.
Experiment: `codex/sharpness-experiment-20261026`.

Open `/?clarity=compare` and use the bottom-left 화질 button in one tab:

| Mode | Behavior |
|---|---|
| 기본 | Existing renderer; no postprocessing target or additional draw |
| 선명 | Existing resolution plus CAS-derived five-sample adaptive sharpening |
| 균형 | 85% width/height scene buffer, bilinear enlargement plus the same sharpening |

The normal URL stays 기본. These are client-only options; no server messages or persisted preferences are added. Unsupported WebGL2/highp or a caught rendering failure falls back to 기본. Switching off disposes the render target. Scene resolution/LOD, shadows, avatar animation, frame pacing, and moving-text compositor optimizations retain their baseline settings.

This is not a complete FSR implementation and does not use AI or frame generation. The kernel adapts the fast sharpening path from [AMD FidelityFX CAS](https://github.com/GPUOpen-Effects/FidelityFX-CAS/blob/master/ffx-cas/ffx_cas.h); its MIT notice ships in client/AMD-CAS-LICENSE.txt. Balanced mode does not implement CAS's scaling kernel or FSR EASU. Sharpening adds one fullscreen triangle and five texture samples per output pixel. The extra RGBA8/depth buffer and postprocessing have real memory/GPU costs. Balanced reduces scene pixels to about 72% but can look softer, especially on photos; it is optional.

Validation: 137 unit tests passed. Default-URL game regression checks confirmed off mode, zero targets, and a hidden experiment button. PC and mobile-viewport Chromium audits validated all modes, actual button cycling, one extra draw, unchanged output dimensions, target reuse across 12 switches, and fallback after an injected target failure. With sharpening strength zero, both frozen game pixels and a transparent-material calibration matched the original exactly (maximum byte difference 0). Mobile viewport testing is not physical phone testing.

An isolated 50-person room benchmark (48 moving bots, one stationary bot, one browser) measured approximately 73–75 FPS across two runs of each mode. That environment's observed refresh ceiling was about 75 Hz, so these results do not establish spare GPU capacity or performance at 100/144 FPS on a real phone. Compare on each physical device with the same room, power mode, and screen refresh rate. Browser audit images/results and benchmark results are under ignored artifacts/.
