import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// One viewer instance per generator tab, keyed by form id.
const viewers = {};

// Default model colour; kept in sync with the colour picker's default in the settings form.
const DEFAULT_MODEL_COLOR = 0xd8cfc0;

function createViewer(container) {
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    // Transparent background: the canvas shows through to the card behind it.
    scene.background = null;

    // The bins are modelled with Z pointing up (as in CAD), so tell the camera the same.
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 10000);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(1, 1, 2);
    // Parent the light to the camera so the model stays lit from the viewer's side.
    camera.add(keyLight);
    scene.add(camera);

    const viewer = { scene, camera, renderer, controls, mesh: null, container, color: DEFAULT_MODEL_COLOR };

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }).observe(container);

    return viewer;
}

function setMesh(viewer, geometry) {
    if (viewer.mesh) {
        viewer.scene.remove(viewer.mesh);
        viewer.mesh.geometry.dispose();
        viewer.mesh.material.dispose();
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    const material = new THREE.MeshPhongMaterial({
        color: viewer.color,
        specular: 0x0a0a0a,
        shininess: 10,
        flatShading: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    viewer.scene.add(mesh);
    viewer.mesh = mesh;

    // Frame the model so it fills the viewport regardless of its size.
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere.radius || 1;
    const camera = viewer.camera;
    const distance = radius / Math.sin((camera.fov * Math.PI / 180) / 2);
    camera.position.set(distance, -distance, distance * 0.7);
    camera.near = radius / 100;
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
}

window.gfcPreview = async function (formId) {
    const container = document.getElementById(formId + '_preview');
    const placeholder = document.getElementById(formId + '_preview_placeholder');
    const spinner = document.getElementById(formId + '_preview_spinner');
    const errorBox = document.getElementById(formId + '_preview_error');
    const form = document.getElementById(formId + '_form');
    if (!container || !form) return;

    if (errorBox) errorBox.classList.add('d-none');
    if (placeholder) placeholder.classList.add('d-none');
    if (spinner) spinner.classList.remove('d-none');

    if (!viewers[formId]) {
        viewers[formId] = createViewer(container);
    }

    // Apply the colour currently chosen in the settings form, if any.
    const colorInput = document.getElementById(formId + '_preview_color');
    if (colorInput && colorInput.value) {
        viewers[formId].color = new THREE.Color(colorInput.value).getHex();
    }

    try {
        const formData = new FormData(form);
        // Mimic pressing the generator's "Generate" button, then flag this as a preview.
        formData.set(formId, '1');
        formData.set('preview', '1');

        const response = await fetch(window.location.pathname, { method: 'POST', body: formData });
        if (!response.ok) {
            throw new Error('server responded with ' + response.status);
        }

        const buffer = await response.arrayBuffer();
        const geometry = new STLLoader().parse(buffer);
        if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
            throw new Error('no model was returned (check the settings are valid)');
        }
        setMesh(viewers[formId], geometry);
    } catch (err) {
        if (errorBox) {
            errorBox.textContent = 'Preview failed: ' + err.message;
            errorBox.classList.remove('d-none');
        }
        if (!viewers[formId] || !viewers[formId].mesh) {
            if (placeholder) placeholder.classList.remove('d-none');
        }
    } finally {
        if (spinner) spinner.classList.add('d-none');
    }
};

// Update the model colour live from the settings colour picker, without re-generating.
window.gfcSetPreviewColor = function (formId, value) {
    const viewer = viewers[formId];
    if (!viewer) return; // nothing rendered yet; the next preview will pick up the value
    viewer.color = new THREE.Color(value).getHex();
    if (viewer.mesh) {
        viewer.mesh.material.color.set(value);
    }
};
