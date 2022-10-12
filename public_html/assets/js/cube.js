import * as THREE from 'https://cdn.skypack.dev/three';
import { TrackballControls } from '../../TrackballControls.js'
import { TextureLoader } from 'https://cdn.skypack.dev/three/src/loaders/TextureLoader'
import Stats from 'https://cdn.skypack.dev/three/examples/jsm/libs/stats.module'


/**
 * Display a 3D cube
 * @containerSelector {string} - css selector of the container element for the canvas
 * @images {object} - list of images
 * @imageLinks {object} - list of links for redirecting when images are clicked
 * @options {object} - settings
 * @returns nothing
 */
export const ShowCube = (containerSelector, images, imageLinks, options) => {
  /* -------------------------------------------------------------------------------------*/
  /*                                                                                      */
  /* Initialization                                                                       */
  /*                                                                                      */
  /* -------------------------------------------------------------------------------------*/

  // Set Options
  let introAnimation = {
    isActive: options.introAnimation.isActive ? true : false,
    speed: options.introAnimation.speed || 0.94,
    zoomStart: options.introAnimation.zoomStart || 90,
    zoomSlow: options.introAnimation.zoomSlow || 4,
    zoomEnd: options.introAnimation.zoomEnd || 2
  }
  let redirectAnimation = {
    isActive: false,
    speed: options.redirectAnimation.speed || 0.07,       // how fast the cube grows
    slowScale: options.redirectAnimation.slowScale || 1.9,
    stopScale: options.redirectAnimation.stopScale || 4.0 // max growth of cube
  }
  let isRotating = options.isRotating ? true : false;
  let isTouching = false;
  let rotatingTimeout = null;
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const raycaster = new THREE.Raycaster(); // Needed for object intersection
  const mouse = new THREE.Vector2(); // Needed for mouse coordinates
  const cube = new THREE.Group(); // Group called cube with the the faces added later on
  const cubeContainer = new THREE.Object3D(); // Was used to help with rotating towards camera while cube spins inside
  let cubeOpacity = 0.8;
  let geometry = [];
  let material = [];
  let mouseDownX = 0;
  let mouseUpX = 0;
  let enableAxisHelper = false;
  // const rotationMatrix = new THREE.Matrix4();
  // const targetQuaternion = new THREE.Quaternion();
  // const stats = Stats();




  /* -------------------------------------------------------------------------------------*/
  /*                                                                                      */
  /* Control Flow                                                                         */
  /*                                                                                      */
  /* -------------------------------------------------------------------------------------*/

  // console.log(scene);
  // testMode();
  // document.body.appendChild(stats.dom)
  
  if (enableAxisHelper)
    scene.add(new THREE.AxesHelper(30));


  // Set camera z position depending on if introAnimation is active
  introAnimation.isActive ? camera.position.z = introAnimation.zoomStart : camera.position.z = 2;


  // Set renderer options & append <canvas> (domElement) to dom
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.querySelector(containerSelector).appendChild(renderer.domElement);


  // Create controls after domElement is rendered and set options
  const controls = new TrackballControls(camera, renderer.domElement);
  // controls.enabled = false;
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


  // Convert images & image links to arrays
  images = Object.keys(images).map(function (k) { return images[k]; });
  imageLinks = Object.keys(imageLinks).map(function (k) { return imageLinks[k]; });
  

  // Create geometry & materials from images
  images.forEach((img, i) => {
    geometry.push(new THREE.PlaneGeometry(1, 1));
    material.push(new THREE.MeshBasicMaterial({ map: new THREE.TextureLoader().load(img), opacity: cubeOpacity, transparent: true, side: THREE.DoubleSide }));
  });

  
  // Create meshes for the faces (images)
  const face1 = new THREE.Mesh(geometry[0], material[0]);
  face1.position.z = 0.5;
  face1.name = "face1";
  //face1.userData.Quaternion = new THREE.Quaternion(0, 0, 0, 1);

  const face2 = new THREE.Mesh(geometry[1], material[1]);
  face2.position.z = -0.5;
  face2.name = "face2";
  //face2.userData.Quaternion = new THREE.Quaternion(0, .99, 0, -.029);

  const face3 = new THREE.Mesh(geometry[2], material[2]);
  face3.rotation.y = 1.57;
  face3.position.x = 0.5;
  face3.name = "face3";
  //face3.userData.Quaternion = new THREE.Quaternion(0, -.71, 0, .69);

  const face4 = new THREE.Mesh(geometry[3], material[3]);
  face4.rotation.y = 1.57;
  face4.position.x = -0.5;
  face4.name = "face4";
  //face4.userData.Quaternion = new THREE.Quaternion(0, .71, 0, .69);

  const face5 = new THREE.Mesh(geometry[4], material[4]);
  face5.rotation.x = 1.57;
  face5.position.y = 0.5;
  face5.name = "face5";
  //face5.userData.Quaternion = new THREE.Quaternion(.71, 0, 0, .69);

  const face6 = new THREE.Mesh(geometry[5], material[5]);
  face6.rotation.x = 1.57;
  face6.position.y = -0.5;
  face6.name = "face6";
  //face6.userData.Quaternion = new THREE.Quaternion(-.64, 0, 0, .76);


  // Add faces to the cube group, cube to container, then scene
  cube.add(face1, face2, face3, face4, face5, face6);
  cubeContainer.add(cube);
  scene.add(cubeContainer);
  

  // Run the animations
  animate();



    
  /* -------------------------------------------------------------------------------------*/
  /*                                                                                      */
  /* Event Listeners                                                                      */
  /*                                                                                      */
  /* -------------------------------------------------------------------------------------*/

  window.addEventListener('resize', onWindowResize, false);


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

  // Add Event Listeners to the controls
  controls.addEventListener('start', () => {
    // controls.staticMoving = false;
    // console.log(camera);
    // console.log(controls);
  });
  controls.addEventListener('change', () => {
    // console.log("Controls Change");
    controls.staticMoving = false;
  });
    controls.addEventListener('end', () => {
    // console.log("Controls End Event");
  });


  window.onbeforeunload = function () {
    setInterval(() => {
      // camera.fov -= 4;
      // camera.updateProjectionMatrix();
    }, .03);
  };

  // Overall listens when a mouse is clicked and checks if it released on the same mouse down x spot
  window.addEventListener('mousedown', (event) => { mouseDownX = onDocumentMouseDown(event).x }, false);
  window.addEventListener('mouseup', (event) => {
    mouseUpX = onDocumentMouseDown(event).x;

    if (mouseDownX == mouseUpX) {
      intersectActions(event);
    }
  }, false);
    



  /* -------------------------------------------------------------------------------------*/
  /*                                                                                      */
  /* General Functions                                                                    */
  /*                                                                                      */
  /* -------------------------------------------------------------------------------------*/

  /**
  * Animation loop that renders the 3D world
  */
  function animate() {
    requestAnimationFrame(animate);

    // trackball controls needs to be updated in the animation loop before it will work
    controls.update();

    if (introAnimation.isActive) {
      animateIntro();
      // console.log(camera);
    }
    if (redirectAnimation.isActive) {
      animateRedirect(cube, redirectAnimation);
    }

    if (isRotating && !isTouching) {
      cubeContainer.rotation.y += 0.005;
    }

    renderer.render(scene, camera)
    
    // stats.update()
  }


  /**
  * Mainly updates aspect ratio & size of the 3D world
  */
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }


  /**
  * Pauses the cube rotation for x amount of ms
  * @ms {number} - milliseconds
  */
  function pauseRotation(ms) {
    isRotating = false;
    controls.staticMoving = true;
    rotatingTimeout = setTimeout(() => { isRotating = true }, ms);
  }

    
  /**
  * Animates the intro of the cube (starts samll.. then zooms in) 
  */
  function animateIntro() {

    const slowz = introAnimation.zoomSlow;
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
  * Animates the cube when redirecting the page after an image-link click
  */
  function animateRedirect(cube, redirectAnimation) {

    const slowScale = redirectAnimation.slowScale;
    const stopScale = redirectAnimation.stopScale;
    const roundedScaleX = (Math.round(cube.scale.x * 100) / 100);

    //  console.log('slowScale: ' + slowScale);
    //  console.log('stopScale: ' + stopScale);
    
    switch (true) {
      case roundedScaleX <= slowScale:
        cube.scale.x += redirectAnimation.speed;
        cube.scale.y += redirectAnimation.speed;
        cube.scale.z += redirectAnimation.speed;
        break;

      case roundedScaleX < stopScale:
        // dampened stop
        //map 4 to x1 (ie no change) and 2 to x0 (ie complete stop)
        cube.scale.x += (redirectAnimation.speed * (cube.scale.x - stopScale) / (slowScale - stopScale));
        cube.scale.y += (redirectAnimation.speed * (cube.scale.y - stopScale) / (slowScale - stopScale));
        cube.scale.z += (redirectAnimation.speed * (cube.scale.z - stopScale) / (slowScale - stopScale));
        break;

      case roundedScaleX >= stopScale:
        introAnimation.isActive = false;
        dragGif.style.opacity = 1;
    }
  }


  /**
  * TODO: fill out description
  * @event - event object
  * @returns {Vector2} - mouse coordinates {x: ?, y: ?}
  */
  function onDocumentMouseDown(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    return mouse;
  }


  /**
  * Launched if mouse is clicked without dragging it
  * @event - event object
  */
  function intersectActions(event) {

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    let intersects = raycaster.intersectObjects([face1, face2, face3, face4, face5, face6]);

    // does your cursor intersect the object on click ?
    //console.log(intersects.length > 0 ? "yes" : "no");

    clearTimeout(rotatingTimeout);

    // Check if click intersects objects and perform actions:
    if (intersects.length > 0) {

      imageLinks.forEach((link, i) => {
        if (intersects[0].object.name == 'face' + (i + 1)) {

          if (!isRotating && controls.staticMoving) {
            redirectAnimation.isActive = true;
            renderer.domElement.style.zIndex = 2;
            window.location.href = link;
          }
          else {
            console.log('pause');
            pauseRotation(10000);
          }

        }
      })
    }
  }


  /**
  * Launch test mode
  */
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
      })
    })
  }
}


