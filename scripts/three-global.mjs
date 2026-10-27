// `npm run build:three` bundles this into client/vendor/three.bundle.min.js.
// The client is plain classic scripts, so the current three.js release (no UMD
// build since r160) is exposed as the same global THREE the code always used.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';

// Keep the approved r128 look: material colors are used as authored numbers,
// not converted from sRGB (r152+ default).
THREE.ColorManagement.enabled=false;
window.THREE=Object.assign({},THREE,{GLTFLoader,SkeletonUtils,FXAAShader});
