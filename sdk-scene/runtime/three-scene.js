import * as THREE from 'three';
import {
  createAnimationManifest,
  createAvatarPresentation,
  DEFAULT_ANIMATION_BASE_URL,
  DEFAULT_ANIMATION_REVISION
} from '../components/avatar-presentation/avatar-presentation.js?v=20260823-vrma-cache';
import { createSceneAvatarController } from './scene-avatar-controller.js';

export async function createVrmScene(options) {
  const {
    canvas,
    avatarStatus,
    setLoadingState,
    animations: initialAnimations = null,
    animationBaseUrl = DEFAULT_ANIMATION_BASE_URL,
    animationRevision = DEFAULT_ANIMATION_REVISION
  } = options;

  if (!canvas) {
    throw new Error('createVrmScene requires options.canvas');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.Fog(0x4f5469, 8, 100);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x446792) },
        horizonColor: { value: new THREE.Color(0xc3cadd) },
        cloudColor: { value: new THREE.Color(0xf4f7fb) },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 cloudColor;
        uniform float uTime;
        varying vec3 vSkyDirection;

        float hash(vec3 point) {
          point = fract(point * 0.3183099 + vec3(0.1, 0.2, 0.3));
          point *= 17.0;
          return fract(point.x * point.y * point.z * (point.x + point.y + point.z));
        }

        float noise(vec3 point) {
          vec3 cell = floor(point);
          vec3 local = fract(point);
          local = local * local * (3.0 - 2.0 * local);
          return mix(
            mix(
              mix(hash(cell), hash(cell + vec3(1.0, 0.0, 0.0)), local.x),
              mix(hash(cell + vec3(0.0, 1.0, 0.0)), hash(cell + vec3(1.0, 1.0, 0.0)), local.x),
              local.y
            ),
            mix(
              mix(hash(cell + vec3(0.0, 0.0, 1.0)), hash(cell + vec3(1.0, 0.0, 1.0)), local.x),
              mix(hash(cell + vec3(0.0, 1.0, 1.0)), hash(cell + vec3(1.0, 1.0, 1.0)), local.x),
              local.y
            ),
            local.z
          );
        }

        float fbm(vec3 point) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int octave = 0; octave < 4; octave++) {
            value += noise(point) * amplitude;
            point = point * 2.03 + vec3(3.1, 1.7, 2.4);
            amplitude *= 0.5;
          }
          return value;
        }

        void main() {
          vec3 direction = normalize(vSkyDirection);
          float gradient = smoothstep(0.0, 0.5, max(direction.y, 0.0));
          vec3 skyColor = mix(horizonColor, topColor, gradient);
          vec3 drift = vec3(uTime * 0.012, 0.0, uTime * 0.036);
          float broadClouds = fbm(direction * 3.2 + drift);
          float cloudDetail = fbm(direction * 8.0 + drift * 1.2);
          float cloudDensity = smoothstep(0.5, 0.68, broadClouds * 0.78 + cloudDetail * 0.22);
          cloudDensity *= smoothstep(0.0, 0.14, direction.y) * 0.225;
          vec3 finalColor = mix(skyColor, cloudColor, cloudDensity);
          float grain = hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5;
          finalColor += grain * 0.006;
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    })
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const starCanvas = document.createElement('canvas');
  starCanvas.width = 32;
  starCanvas.height = 32;
  const starContext = starCanvas.getContext('2d');
  const starGlow = starContext.createRadialGradient(16, 16, 0, 16, 16, 16);
  starGlow.addColorStop(0, 'rgba(255,255,255,1)');
  starGlow.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  starGlow.addColorStop(1, 'rgba(255,255,255,0)');
  starContext.fillStyle = starGlow;
  starContext.fillRect(0, 0, 32, 32);

  const starTexture = new THREE.CanvasTexture(starCanvas);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  const starPositions = new Float32Array(600 * 3);
  const starAlphas = new Float32Array(600);
  for (let index = 0; index < 600; index += 1) {
    const radius = 70 + Math.random() * 5;
    const azimuth = Math.random() * Math.PI * 2;
    const vertical = Math.random() * 2 - 1;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    const offset = index * 3;
    starPositions[offset] = horizontal * Math.cos(azimuth) * radius;
    starPositions[offset + 1] = vertical * radius;
    starPositions[offset + 2] = horizontal * Math.sin(azimuth) * radius;
    starAlphas[index] = 0.3 + Math.random() * 0.7;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('alpha', new THREE.BufferAttribute(starAlphas, 1));
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      pointTexture: { value: starTexture },
      pointScale: { value: renderer.getPixelRatio() * window.innerHeight * 0.175 }
    },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      uniform float pointScale;
      void main() {
        vAlpha = alpha;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = pointScale / max(-viewPosition.z, 1.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D pointTexture;
      varying float vAlpha;
      void main() {
        vec4 star = texture2D(pointTexture, gl_PointCoord);
        gl_FragColor = vec4(star.rgb, star.a * vAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const stars = new THREE.Points(
    starGeometry,
    starMaterial
  );
  stars.frustumCulled = false;
  stars.renderOrder = 0;
  scene.add(stars);

  const clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0x446792, 0xc3cadd, 0.8));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(4, 7, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 30;
  directionalLight.shadow.camera.left = -5;
  directionalLight.shadow.camera.right = 5;
  directionalLight.shadow.camera.top = 5;
  directionalLight.shadow.camera.bottom = -5;
  directionalLight.shadow.bias = -0.0001;
  scene.add(directionalLight);
  scene.add(directionalLight.target);

  const checkerCanvas = document.createElement('canvas');
  checkerCanvas.width = 128;
  checkerCanvas.height = 128;
  const checkerContext = checkerCanvas.getContext('2d');
  checkerContext.fillStyle = '#666b80';
  checkerContext.fillRect(0, 0, 64, 64);
  checkerContext.fillRect(64, 64, 64, 64);
  checkerContext.fillStyle = '#4f5469';
  checkerContext.fillRect(64, 0, 64, 64);
  checkerContext.fillRect(0, 64, 64, 64);
  checkerContext.fillStyle = '#4b4f62';
  checkerContext.fillRect(0, 0, 1, 128);
  checkerContext.fillRect(64, 0, 1, 128);
  checkerContext.fillRect(0, 0, 128, 1);
  checkerContext.fillRect(0, 64, 128, 1);

  const checkerTexture = new THREE.CanvasTexture(checkerCanvas);
  checkerTexture.colorSpace = THREE.SRGBColorSpace;
  checkerTexture.magFilter = THREE.NearestFilter;
  checkerTexture.wrapS = THREE.RepeatWrapping;
  checkerTexture.wrapT = THREE.RepeatWrapping;
  checkerTexture.repeat.set(500, 500);

  const checkerMaterial = new THREE.MeshStandardMaterial({
    map: checkerTexture,
    roughness: 1,
    metalness: 0
  });

  const checkerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    checkerMaterial
  );
  checkerFloor.rotation.x = -Math.PI / 2;
  checkerFloor.receiveShadow = true;
  scene.add(checkerFloor);

  const animations = initialAnimations || createAnimationManifest(
    animationBaseUrl || DEFAULT_ANIMATION_BASE_URL,
    animationRevision || DEFAULT_ANIMATION_REVISION
  );
  const presentation = createAvatarPresentation({ animations });
  const controller = createSceneAvatarController({
    scene,
    target: presentation.object3D,
    domElement: canvas,
    enableControl: true
  });
  const camera = controller.camera;

  let currentAvatarMeta = null;
  let activeAvatarKey = '';
  let avatarLoadSequence = 0;
  let animationFrameId = 0;
  let animationRunning = false;
  let hostPaused = false;
  let webglContextLost = false;
  let disposed = false;

  function setAvatarText(value) {
    if (avatarStatus) avatarStatus.textContent = value;
  }

  function setSceneLoading(isLoading, message) {
    if (typeof setLoadingState === 'function') setLoadingState(isLoading, message);
  }

  async function loadAvatarFromUrl(url, meta = {}) {
    const loadId = ++avatarLoadSequence;
    const loadingLabel = 'Loading ' + (meta.displayName || meta.key || 'avatar') + '...';
    setAvatarText(loadingLabel);
    setSceneLoading(true, loadingLabel);

    try {
      await presentation.loadAvatarFromUrl(url, {
        animations: meta.animations || animations,
        metadata: meta
      });
      if (loadId !== avatarLoadSequence) return;
      currentAvatarMeta = meta;
      activeAvatarKey = meta.key || '';
      setAvatarText(meta.displayName || meta.key || 'Avatar loaded');
    } finally {
      setSceneLoading(false);
    }
  }

  async function reloadCurrentAvatar(resolveDownload) {
    if (!activeAvatarKey || typeof resolveDownload !== 'function') return;
    const result = await resolveDownload(activeAvatarKey);
    const resolvedUrl = result && result.url ? result.url : '';
    if (!resolvedUrl) throw new Error('No VRM URL available for the active avatar.');
    await loadAvatarFromUrl(resolvedUrl, {
      key: activeAvatarKey,
      displayName: (currentAvatarMeta && currentAvatarMeta.displayName) || activeAvatarKey
    });
  }

  function animate() {
    animationFrameId = 0;
    if (!animationRunning || webglContextLost || disposed) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    presentation.setMotion(controller.update(delta));
    presentation.update(delta);
    const avatarPosition = controller.anchor.position;
    directionalLight.position.set(avatarPosition.x + 4, 7, avatarPosition.z + 5);
    directionalLight.target.position.set(avatarPosition.x, 0, avatarPosition.z);
    sky.position.copy(camera.position);
    sky.material.uniforms.uTime.value += delta;
    stars.position.copy(camera.position);
    stars.rotation.x += delta * 0.003;
    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animate);
  }

  function stopAnimationLoop() {
    animationRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  }

  function startAnimationLoop() {
    if (animationRunning || hostPaused || webglContextLost || disposed) return;
    animationRunning = true;
    clock.getDelta();
    animationFrameId = requestAnimationFrame(animate);
  }

  function handleResize() {
    if (webglContextLost || disposed) return;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    starMaterial.uniforms.pointScale.value = renderer.getPixelRatio() * height * 0.175;
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      stopAnimationLoop();
      return;
    }
    startAnimationLoop();
  }

  function handleContextLost(event) {
    event.preventDefault();
    webglContextLost = true;
    stopAnimationLoop();
    setAvatarText('WebGL context lost. Attempting to recover...');
  }

  function handleContextRestored() {
    webglContextLost = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    handleResize();
    startAnimationLoop();
    if (!activeAvatarKey || typeof options.resolveDownloadUrl !== 'function') return;
    reloadCurrentAvatar(options.resolveDownloadUrl)
      .then(() => setAvatarText('Avatar restored after WebGL reset.'))
      .catch((error) => {
        console.error(error);
        setAvatarText('WebGL recovered, but avatar reload failed: ' + error.message);
      });
  }

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  canvas.addEventListener('webglcontextlost', handleContextLost);
  canvas.addEventListener('webglcontextrestored', handleContextRestored);

  function start(runtimeOptions = {}) {
    if (runtimeOptions.resolveDownloadUrl) {
      options.resolveDownloadUrl = runtimeOptions.resolveDownloadUrl;
    }
    handleResize();
    startAnimationLoop();
  }

  function pause() {
    hostPaused = true;
    controller.setEnableControl(false);
    stopAnimationLoop();
  }

  function resume() {
    hostPaused = false;
    controller.setEnableControl(true);
    startAnimationLoop();
  }

  function setControlsState(state) {
    const animationEnabled = !state || state.animationEnabled !== false;
    const controlEnabled = animationEnabled && !(state && state.controlEnabled === false);
    presentation.setEnableAnimation(animationEnabled);
    controller.setEnableControl(controlEnabled);
  }

  function setAnimations(animations) {
    presentation.setAnimations(animations || {});
  }

  function setJoystickVisible(visible) {
    controller.setJoystickVisible(visible);
  }

  function getCurrentAvatarMeta() {
    if (!currentAvatarMeta && !activeAvatarKey) return null;
    return {
      ...(currentAvatarMeta || {}),
      key: activeAvatarKey || (currentAvatarMeta && currentAvatarMeta.key) || ''
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    avatarLoadSequence += 1;
    stopAnimationLoop();
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    controller.dispose();
    presentation.dispose();
    checkerFloor.geometry.dispose();
    checkerMaterial.dispose();
    checkerTexture.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    stars.geometry.dispose();
    starMaterial.dispose();
    starTexture.dispose();
    renderer.dispose();
  }

  return {
    getCurrentAvatarMeta,
    loadAvatarFromUrl,
    reloadCurrentAvatar,
    pause,
    resume,
    setControlsState,
    setAnimations,
    setJoystickVisible,
    setAvatarText,
    start,
    dispose
  };
}
