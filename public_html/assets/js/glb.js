//import * as THREE from 'https://cdn.skypack.dev/three';
import { TrackballControls } from '../../TrackballControls.js';
import { TextureLoader } from 'https://cdn.skypack.dev/three/src/loaders/TextureLoader';
import Stats from 'https://cdn.skypack.dev/three/examples/jsm/libs/stats.module';


/**
 * Display a 3D Object
 * @containerSelector {string} - css selector of the container element for the canvas
 * @src {string} - src of the 3D .glb / .gltf file
 * @options {object} - settings
 * @returns nothing
 */
export const ShowGlb = (containerSelector, src, options) => {

  // Set Options
  var introAnimation = {
    isActive: options.introAnimation.isActive ? true : false,
    speed: options.introAnimation.speed || 0.94,
    zoomStart: 300,
    zoomSlow: 40,
    zoomEnd: 20
  }
  let redirectAnimation = {
    isActive: false,
    speed: 0.07,
    slowScale: 1.9,
    stopScale: 4.0 //2.6
  }
  let focusAnimation = {
    isActive: false, // is focusing on a specific face of a cube
    speed: 0.18,
    focusTarget: null  // TODO: targets the face object/mesh of a cube
  }

  let isLoaded = false;
  let isTouching = false;
  let isRotating = options.isRotating ? true : false;
  let rotatingTimeout = null;
  const rotationMatrix = new THREE.Matrix4();
  const targetQuaternion = new THREE.Quaternion();

  // Create scene
  const scene = new THREE.Scene();
  scene.add(new THREE.AxesHelper(0));
  console.log(scene);

  // Create camera
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  introAnimation.isActive ? camera.position.z = introAnimation.zoomStart : camera.position.z = 2;


  // Create renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.physicallyCorrectLights = true; // required for GLTFLoader
  renderer.outputEncoding = THREE.sRGBEncoding; // required for GLTFLoader
  document.querySelector(containerSelector).appendChild(renderer.domElement);

  // Create light
  const light = new THREE.DirectionalLight(0xFFFFFF, 1);
  light.position.set(20,2,5);
  scene.add(light);
  const light2 = new THREE.DirectionalLight(0xFFFFFF, 1);
  light2.position.set(-20,2,5);
  scene.add(light2);

  // Create raycaster for object intersection
  var raycaster = new THREE.Raycaster(); // Needed for object intersection
  var mouse = new THREE.Vector2(); //Needed for mouse coordinates

  // Controls (TrackballControlls)
  const controls = new TrackballControls(camera, renderer.domElement);
  // controls.addEventListener('change', () => console.log("Controls Change"))
  controls.addEventListener('start', () => {
    controls.staticMoving = false;
    console.log(camera);
    controls.update();
  })
  // controls.addEventListener('end', () => console.log("Controls End Event"))
  // controls.enabled = false

  controls.rotateSpeed = 3.0;
  // controls.zoomSpeed = 1.2;
  // controls.panSpeed = 0.8;
  // controls.keys = ['KeyA', 'KeyS', 'KeyD'];
  controls.noPan = true; //default false
  // controls.noRotate = true; //default false
  controls.noZoom = false; //default false
  // controls.staticMoving = true; //default false
  controls.dynamicDampingFactor = 0.05;
  // controls.maxDistance = 4;
  // controls.minDistance = 2;


  const cubeOpacity = 0.8;

  // Load 3D .glb / .gltf file
  const gltfLoader = new THREE.GLTFLoader();
  gltfLoader.load(src, (gltf)=> {
    console.log('loading complete');
    console.log(gltf);
    gltf.scene.position.y = -8;
    scene.add(gltf.scene);
    isLoaded = true;
  },
  (progress) => {
    //console.log((progress.loaded / progress.total) * 100 + "% loaded");
  },
  (err) => {
    console.log(err);
  });


  let num1 = 0;
  let num2 = 0;

  window.onbeforeunload = function () {

    setInterval(() => {
      //camera.fov -= 4;
      //camera.updateProjectionMatrix();
    }, .03);
  };
  window.addEventListener('mousedown', (event) => { num1 = onDocumentMouseDown(event).x }, false);
  window.addEventListener('mouseup', (event) => {
    num2 = onDocumentMouseDown(event).x;

    if (num1 == num2) {
      resault(event);
    }
  }, false);

  function onDocumentMouseDown(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    return mouse;
  }

  function resault(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;


    raycaster.setFromCamera(mouse, camera);

    var intersects = raycaster.intersectObjects(scene.children);

    controls.staticMoving = true;
    controls.update();

    clearTimeout(rotatingTimeout);

    // Check click intersects and perform actions:
    if (intersects.length > 0) {
      
      if (!isRotating) {
        //cube.setRotationFromQuaternion(intersects[0].object.userData.Quaternion);
        //rotationMatrix.lookAt(camera.position, cubeContainer.position, camera.up);
        //targetQuaternion.setFromRotationMatrix(rotationMatrix);
        //focusAnimation.isActive = true;
        //redirectAnimation.isActive = true;
        //renderer.domElement.style.zIndex = 2;
        //window.location.href = link;
      }
      else {
        pauseRotation(10000);
      }

      /*
  <?php foreach (range(1,6) as $i) {  				
          echo "if(intersects[0].object.name == 'face{$i}'){";
          echo "window.location.href = '{$imagelink[$i]}';}";
  } ?>  */

    }

  }


  window.addEventListener('resize', onWindowResize, false);
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
  }

  // const stats = Stats()
  // document.body.appendChild(stats.dom)

  function animate() {
    // trackball controls needs to be updated in the animation loop before it will work
    controls.update();

    if (isLoaded) {

      if (introAnimation.isActive) {
        animateIntro(camera, introAnimation);
        //console.log(camera);
      }
      if (redirectAnimation.isActive) {
        animateRedirect(faces, redirectAnimation);
      }
      if (focusAnimation.isActive) {
        focusOnFace();
      }

    }

    render();

    // stats.update()
  }




  // Add Event Listeners to <canvas>
  renderer.domElement.addEventListener('touchstart', (e) => {
    isTouching = true;
    document.querySelector('.drag_gif').style.display = 'none';
  })
  renderer.domElement.addEventListener('mousedown', (e) => {
    isTouching = true;
    document.querySelector('.drag_gif').style.display = 'none';
  })
  renderer.domElement.addEventListener('touchend', (e) => {
    isTouching = false;
  })
  renderer.domElement.addEventListener('mouseup', (e) => {
    isTouching = false;
  })

  // Pausing the cube rotation for x amount of ms
  function pauseRotation(ms) {
    isRotating = false;
    rotatingTimeout = setTimeout(() => { isRotating = true }, ms);
  }


  function focusOnFace() {
    if (!cubeContainer.quaternion.equals(targetQuaternion)) {
      cubeContainer.quaternion.rotateTowards(targetQuaternion, focusAnimation.speed);
    }
    else {
      focusAnimation.isActive = false;
    }
  }


  function render() {

    if (isRotating && !isTouching) {
      scene.rotation.y += 0.005;
      //console.log(scene);
    }

    renderer.render(scene, camera)
    requestAnimationFrame(animate);
  }


  function testMode() {

    let cubeUpBtn = document.createElement('button');
    let cubeDownBtn = document.createElement('button');
    let cubeLeftBtn = document.createElement('button');
    let cubeRightBtn = document.createElement('button');
    let camUpBtn = document.createElement('button');
    let camDownBtn = document.createElement('button');
    let camLeftBtn = document.createElement('button');
    let camRightBtn = document.createElement('button');
    let sceneUpBtn = document.createElement('button');
    let sceneDownBtn = document.createElement('button');
    let sceneLeftBtn = document.createElement('button');
    let sceneRightBtn = document.createElement('button');
    let btns = [cubeUpBtn, cubeDownBtn, cubeLeftBtn, cubeRightBtn, camUpBtn, camDownBtn, camLeftBtn, camRightBtn, sceneUpBtn, sceneDownBtn, sceneLeftBtn, sceneRightBtn];
    let txts = ['Cube Up', 'Cube Down', 'Cube Left', 'Cube Right', 'Cam Up', 'Cam Down', 'Cam Left', 'Cam Right', 'Scene Rotate Up', 'Scene Rotate Down', 'Scene Rotate Left', 'Scene Rotate Right'];

    btns.forEach((btn, i) => {
      btn.innerHTML = txts[i];
      document.querySelector('.main-banner').appendChild(btn);

      btn.addEventListener('click', () => {
        const cubeAmountX = 0.2;
        const cubeAmountY = 0.2;
        const camAmountX = 0.2;
        const camAmountY = 0.2;
        const sceneAmountX = 0.2;
        const sceneAmountY = 0.2;

        switch (txts[i]) {
          case 'Cube Up':
            cube.rotation.x -= cubeAmountX;
            break;
          case 'Cube Down':
            cube.rotation.x += cubeAmountX;
            break;
          case 'Cube Left':
            cube.rotation.y -= cubeAmountY;
            break;
          case 'Cube Right':
            cube.rotation.y += cubeAmountY;
            break;
          case 'Cam Up':
            camera.up.x -= camAmountX;
            break;
          case 'Cam Down':
            camera.up.x += camAmountX;
            break;
          case 'Cam Left':
            camera.up.y -= camAmountY;
            break;
          case 'Cam Right':
            camera.up.y += camAmountY;
            break;
          case 'Scene Rotate Up':
            scene.rotation.x -= sceneAmountX;
            break;
          case 'Scene Rotate Down':
            scene.rotation.x += sceneAmountX;
            break;
          case 'Scene Rotate Left':
            scene.rotation.y -= sceneAmountY;
            break;
          case 'Scene Rotate Right':
            scene.rotation.y += sceneAmountY;
            break;
        }

        //console.log('cube.getWorldPosition(): ');
        //console.log(cube.getWorldQuaternion(new THREE.Quaternion()));
        console.log('************scene **************');
        console.log(scene);
        console.log('************cube.getWorldDirection(): **************');
        console.log(cube.getWorldDirection(new THREE.Vector3()));

        cube.updateMatrix();
        camera.updateProjectionMatrix();
        controls.update();
      })
    })

  }


  //testMode();
  animate();
}


/**
Animates the intro of the cube (starts samll.. then zooms in) 
*/
function animateIntro(camera, introAnimation) {

  //const stopz = 0.5; // enter cube
  const slowz = introAnimation.zoomSlow; // 4
  const stopz = introAnimation.zoomEnd;
  const dragGif = document.querySelector('.drag_gif');
  const roundedCameraZ = (Math.round(camera.position.z * 100) / 100);

  switch (true) {
    case camera.position.z >= slowz:
      camera.position.z -= introAnimation.speed;
      break;

    case roundedCameraZ > stopz:
      // dampened stop
      //map 4 to x1 (ie no change) and 2 to x0 (ie complete stop)
      camera.position.z -= (introAnimation.speed * (camera.position.z - stopz) / (slowz - stopz));
      break;

    case roundedCameraZ <= stopz:
      introAnimation.isActive = false;
      dragGif.style.opacity = 1;
  }

  /*
    if (camera.position.z >= 2) {
    camera.position.z -= introAnimation.speed;
    } else {
    introAnimation.isActive = false;
    }
   */


}

/**
Animates the cube when redirecting the page after an image-link click
*/
function animateRedirect(faces, redirectAnimation) {

  const slowScale = redirectAnimation.slowScale;
  const stopScale = redirectAnimation.stopScale;

  //  console.log('slowScale: ' + slowScale);
  //  console.log('stopScale: ' + stopScale);

  faces.forEach((face) => {
    const roundedScaleX = (Math.round(face.scale.x * 100) / 100);
    //const roundedScaleY = (Math.round(face.scale.y  * 100) / 100);

    switch (true) {
      case roundedScaleX <= slowScale:
        face.scale.x += redirectAnimation.speed;
        face.scale.y += redirectAnimation.speed;
        if (face.position.x < 0) // if negative
          face.position.x -= redirectAnimation.speed / 2;
        else if (face.position.x > 0)
          face.position.x += redirectAnimation.speed / 2;
        if (face.position.y < 0) // if negative
          face.position.y -= redirectAnimation.speed / 2;
        else if (face.position.y > 0)
          face.position.y += redirectAnimation.speed / 2;
        if (face.position.z < 0) // if negative
          face.position.z -= redirectAnimation.speed / 2;
        else if (face.position.z > 0)
          face.position.z += redirectAnimation.speed / 2;
        break;

      case roundedScaleX < stopScale:
        // dampened stop
        // map 4 to x1 (ie no change) and 2 to x0 (ie complete stop)
        face.scale.x += (redirectAnimation.speed * (face.scale.x - stopScale) / (slowScale - stopScale));
        face.scale.y += (redirectAnimation.speed * (face.scale.y - stopScale) / (slowScale - stopScale));
        if (face.position.x < 0) // if negative
          face.position.x -= (redirectAnimation.speed * ((face.position.x * -2) - stopScale) / (slowScale - stopScale));
        else if (face.position.x > 0)
          face.position.x += (redirectAnimation.speed * ((face.position.x * 2) - stopScale) / (slowScale - stopScale));
        if (face.position.y < 0) // if negative
          face.position.y -= (redirectAnimation.speed * ((face.position.y * -2) - stopScale) / (slowScale - stopScale));
        else if (face.position.y > 0)
          face.position.y += (redirectAnimation.speed * ((face.position.y * 2) - stopScale) / (slowScale - stopScale));
        if (face.position.z < 0) // if negative
          face.position.z -= (redirectAnimation.speed * ((face.position.z * -2) - stopScale) / (slowScale - stopScale));
        else if (face.position.z > 0)
          face.position.z += (redirectAnimation.speed * ((face.position.z * 2) - stopScale) / (slowScale - stopScale));

        break;

      case roundedScaleX >= stopScale:
        redirectAnimation.isActive = false;
    }

  });
}