import * as THREE from 'https://cdn.skypack.dev/three';
import { TrackballControls } from '../../TrackballControls.js'
import { TextureLoader } from 'https://cdn.skypack.dev/three/src/loaders/TextureLoader'
import Stats from 'https://cdn.skypack.dev/three/examples/jsm/libs/stats.module'


// The 2 parameters should be arrays.
export const ShowCube = (images, imageLinks, options) => {

    // Set Options
    const introAnimation = {
      isActive: options.introAnimation.isActive ? true: false,
      speed: options.introAnimation.speed || 0.14
    }


    images = Object.keys(images).map(function(k) {return images[k]; });
    imageLinks = Object.keys(imageLinks).map(function(k) {return imageLinks[k]; });

    const scene = new THREE.Scene()
    scene.add(new THREE.AxesHelper(0))
    
    const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
    )
    
    camera.position.z = 15;
    
    const renderer = new THREE.WebGLRenderer({alpha: true})
    renderer.setClearColor( 0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    //document.body.appendChild(renderer.domElement);
    document.querySelector('.main-banner .img-fill').appendChild(renderer.domElement);
    var raycaster = new THREE.Raycaster(); // Needed for object intersection
    var mouse = new THREE.Vector2(); //Needed for mouse coordinates
    
    
    const controls = new TrackballControls(camera, renderer.domElement)
    // controls.addEventListener('change', () => console.log("Controls Change"))
    controls.addEventListener('start', () => {
        controls.staticMoving = false
        controls.update()
    })
    // controls.addEventListener('end', () => console.log("Controls End Event"))
    // controls.enabled = false
    controls.rotateSpeed = 3.0
    // controls.zoomSpeed = 1.2
    // controls.panSpeed = 0.8
    // controls.keys = ['KeyA', 'KeyS', 'KeyD']
    controls.noPan = true //default false
    // controls.noRotate = true //default false
    controls.noZoom = false //default false
    // controls.staticMoving = true //default false
    controls.dynamicDampingFactor = 0.05;
    // controls.maxDistance = 4
    // controls.minDistance = 2
    
    
    const cubeOpacity = 0.8
    
    let geometry = [];
    let material = [];

    images.forEach((img, i)=>{
        geometry.push(new THREE.PlaneGeometry( 1, 1 ));
        material.push(new THREE.MeshBasicMaterial( {map: new THREE.TextureLoader().load(img), opacity: cubeOpacity, transparent: true, side: THREE.DoubleSide} ));
    });

    /*
    <?php foreach (range(1,6) as $i) {  							
            echo "const geometry$i = new THREE.PlaneGeometry( 1, 1 );
    const material$i = new THREE.MeshBasicMaterial( {map: new THREE.TextureLoader().load('{$image[$i]}'), opacity: cubeOpacity, transparent: true, side: THREE.DoubleSide} );";
    */
    
    /* eg
     const geometry6 = new THREE.PlaneGeometry( 1, 1 );
     const material6 = new THREE.MeshBasicMaterial( {map: new THREE.TextureLoader().load('some_image_url'), opacity: cubeOpacity, transparent: true, side: THREE.DoubleSide} );
    */
    
    /*} ?>*/   
    
    
    
    const face1 = new THREE.Mesh(geometry[0], material[0]);
    face1.position.z = 0.5;
    face1.name = "face1";
    const face2 = new THREE.Mesh(geometry[1], material[1]);
    face2.position.z = -0.5;
    face2.name = "face2";
    const face3 = new THREE.Mesh(geometry[2], material[2]);
    face3.rotation.y = 1.57;
    face3.position.x = 0.5;
    face3.name = "face3";
    const face4 = new THREE.Mesh(geometry[3], material[3]);
    face4.rotation.y = 1.57;
    face4.position.x = -0.5;
    face4.name = "face4";
    const face5 = new THREE.Mesh(geometry[4], material[4]);
    face5.rotation.x = 1.57;
    face5.position.y = 0.5;
    face5.name = "face5";
    const face6 = new THREE.Mesh(geometry[5], material[5]);
    face6.rotation.x = 1.57;
    face6.position.y = -0.5;
    face6.name = "face6";
    
    scene.add(face1, face2, face3, face4, face5, face6);
    let num1 = 0;
    let num2 = 0;

    window.onbeforeunload = function(){
      
      setInterval(() => {
        //camera.fov -= 4;
        //camera.updateProjectionMatrix();
      }, .03);
    };
    window.addEventListener('mousedown',(event) => {num1 = onDocumentMouseDown(event).x}, false);
    window.addEventListener('mouseup',(event) => {
        num2 = onDocumentMouseDown(event).x;
    
        if(num1 == num2){
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
    
        var intersects = raycaster.intersectObjects([face1, face2, face3, face4, face5, face6]);
       
        // does your cursor intersect the object on click ?
        //console.log(intersects.length > 0 ? "yes" : "no");
    
        controls.staticMoving = true
        controls.update()
    
        // And finally change the color:
        if (intersects.length > 0) {
    
        imageLinks.forEach((link, i)=>{
            if(intersects[0].object.name == 'face'+(i+1)){
                window.location.href = link;
            }
        })

        /*
    <?php foreach (range(1,6) as $i) {  				
            echo "if(intersects[0].object.name == 'face{$i}'){";
            echo "window.location.href = '{$imagelink[$i]}';}";
    } ?>  */              
             
        }
    
    }
    
    
    window.addEventListener('resize', onWindowResize, false)
    function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    render()
    }
    
    // const stats = Stats()
    // document.body.appendChild(stats.dom)
    
    function animate() { 
      requestAnimationFrame(animate);
      // trackball controls needs to be updated in the animation loop before it will work
      controls.update();
      
      if (introAnimation.isActive) {
        animateIntro(camera, introAnimation);
      }
       

      render();
      
      // stats.update()
    }


    
    var canvasEl = document.querySelector('.main-banner canvas'); 
    var isTouching = false;
    
    canvasEl.addEventListener('touchstart', (e)=>{
      isTouching = true;
      document.querySelector('.drag_gif').style.display = 'none';
    })
    canvasEl.addEventListener('mousedown', (e)=>{
      isTouching = true;
      document.querySelector('.drag_gif').style.display = 'none';
    })
    canvasEl.addEventListener('touchend', (e)=>{
      isTouching = false;
    })
    canvasEl.addEventListener('mouseup', (e)=>{
      isTouching = false;
    })
    
    function render() {
   
      if (!isTouching) {
        scene.rotation.y += 0.005;
        
      }
      
      renderer.render(scene, camera)
    }
    

    animate();
}


/**
Animates the intro of the cube (starts samll.. then zooms in) 
*/ 
function animateIntro(camera, introAnimation) {
  if (camera.position.z >= 2) {
    camera.position.z -= introAnimation.speed;
  } else {
    introAnimation.isActive = false;
  }
}