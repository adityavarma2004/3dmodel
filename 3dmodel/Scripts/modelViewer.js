import * as THREE from './three.module.js';
import { GLTFLoader } from './examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from './examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from './examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from './examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from './examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from './examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from './examples/jsm/loaders/ColladaLoader.js';
var viewer = $("#viewer");
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x20252d);
var camera = new THREE.PerspectiveCamera(60, viewer.width() / viewer.height(), .1, 2000);
var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewer.width(), viewer.height());
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewer.append(renderer.domElement);
var controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .05;
controls.minDistance = .5;
controls.maxDistance = 1000;
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
var light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 5, 5);
scene.add(light);
var light2 = new THREE.DirectionalLight(0xffffff, 1.5);
light2.position.set(-5, 3, 5);
scene.add(light2);
var light3 = new THREE.DirectionalLight(0xffffff, 1);
light3.position.set(0, 5, -5);
scene.add(light3);
var url = viewer.attr("data-model-url");
var fileType = viewer.attr("data-file-type");
var currentModel = null;
var annotations = [];
var annotationLayer = $("#annotationLayer");
var annotationTemplate = $("#annotationTemplate");
var annotationValues = [
    { title: "TEMPERATURE", value: "" },
    { title: "SPEED", value: "" },
    { title: "POWER", value: "" },
    { title: "FLOW RATE", value: "" },
    { title: "VIBRATION", value: "" }
];
function updateMotorData() {
    $.ajax({
        url: "/Home/GetMotorData",
        type: "GET",
        dataType: "json",
        success: function (data) {
            annotationValues[0].value = data.Temperature;
            annotationValues[1].value = data.Speed;
            annotationValues[2].value = data.Power;
            annotationValues[3].value = data.FlowRate;
            annotationValues[4].value = data.Vibration;
            annotations.forEach(function (annotation, i) {
                annotation.element.find(".annotation-property-value").text(annotationValues[i].value);
            });
        }
    });
}
function fitModel(object) {
    var box = new THREE.Box3().setFromObject(object);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var maxSize = Math.max(size.x, size.y, size.z);
    var distance = maxSize / (2 * Math.tan(camera.fov * Math.PI / 360));
    camera.position.set(center.x, center.y + maxSize * .15, center.z + distance * 1.4);
    camera.near = Math.max(maxSize / 1000, .01);
    camera.far = Math.max(maxSize * 100, 1000);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
}
function addModel(object) {
    if (currentModel) scene.remove(currentModel);
    currentModel = object;
    scene.add(object);
    fitModel(object);
    createAnnotations();
}
function getPoints() {
    var vertices = [];
    currentModel.traverse(function (child) {
        if (!child.isMesh || !child.geometry) return;
        var position = child.geometry.attributes.position;
        if (!position) return;
        var step = Math.max(1, Math.floor(position.count / 800));
        for (var i = 0; i < position.count; i += step) {
            vertices.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
        }
    });
    if (!vertices.length) return [];
    var center = new THREE.Vector3();
    vertices.forEach(function (vertex) {
        center.add(vertex);
    });
    center.divideScalar(vertices.length);
    var maxDistance = 0;
    vertices.forEach(function (vertex) {
        maxDistance = Math.max(maxDistance, vertex.distanceTo(center));
    });
    var minimumDistance = maxDistance * .15;
    var selected = [];
    var attempts = 0;
    while (selected.length < 5 && attempts < 1000) {
        attempts++;
        var point = vertices[Math.floor(Math.random() * vertices.length)];
        var tooClose = selected.some(function (selectedPoint) {
            return selectedPoint.distanceTo(point) < minimumDistance;
        });
        if (!tooClose) selected.push(point.clone());
    }
    return selected;
}
function createAnnotation(point, data) {
    var element = annotationTemplate.clone().removeAttr("id").removeAttr("style");
    var line = element.find(".annotation-line");
    var label = element.find(".annotation");
    label.find(".annotation-title").text(data.title);
    label.find(".annotation-property-value").text(data.value);
    annotationLayer.append(element);
    annotations.push({ point: point, element: label, line: line });
}
function createAnnotations() {
    annotations = [];
    annotationLayer.children().not("#annotationTemplate").remove();
    var points = getPoints();
    for (var i = 0; i < points.length; i++) {
        createAnnotation(points[i], annotationValues[i]);
    }
    updateAnnotations();
    updateMotorData();
}
function updateAnnotations() {
    var width = viewer.width();
    var height = viewer.height();
    var positions = [];
    var directions = [
        { x: 0, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
        { x: -1, y: 0 },
        { x: -1, y: -1 }
    ];
    annotations.forEach(function (annotation) {
        var screen = annotation.point.clone().project(camera);
        if (screen.z < -1 || screen.z > 1) {
            annotation.element[0].style.display = "none";
            annotation.line[0].style.display = "none";
            return;
        }
        annotation.element[0].style.display = "";
        annotation.line[0].style.display = "";
        var x = (screen.x + 1) * width / 2;
        var y = (-screen.y + 1) * height / 2;
        var labelWidth = annotation.element.outerWidth();
        var labelHeight = annotation.element.outerHeight();
        var labelDistance = 180;
        var chosenX = x;
        var chosenY = y;
        var outward = Math.round(Math.atan2(y - height / 2, x - width / 2) / (Math.PI / 4)) & 7;
        for (var k = 0; k < directions.length; k++) {
            var i = (outward + k) % directions.length;
            var direction = directions[i];
            var testX = x + direction.x * labelDistance - labelWidth / 2;
            var testY = y + direction.y * labelDistance - labelHeight / 2;
            testX = Math.max(10, Math.min(testX, width - labelWidth - 10));
            testY = Math.max(10, Math.min(testY, height - labelHeight - 10));
            var overlap = false;
            for (var j = 0; j < positions.length; j++) {
                var previous = positions[j];
                if (testX < previous.x + previous.width + 15 &&
                    testX + labelWidth + 15 > previous.x &&
                    testY < previous.y + previous.height + 15 &&
                    testY + labelHeight + 15 > previous.y) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                chosenX = testX;
                chosenY = testY;
                break;
            }
        }
        positions.push({
            x: chosenX,
            y: chosenY,
            width: labelWidth,
            height: labelHeight
        });
        var endX = chosenX + labelWidth / 2;
        var endY = chosenY + labelHeight / 2;
        var lineDX = endX - x;
        var lineDY = endY - y;
        var lineLength = Math.sqrt(lineDX * lineDX + lineDY * lineDY) || 1;
        var angle = Math.atan2(lineDY, lineDX) * 180 / Math.PI;
        annotation.element[0].style.left = chosenX + "px";
        annotation.element[0].style.top = chosenY + "px";
        annotation.line[0].style.left = x + "px";
        annotation.line[0].style.top = y + "px";
        annotation.line[0].style.width = lineLength + "px";
        annotation.line[0].style.transform = "rotate(" + angle + "deg)";
    });
}
function resizeViewer() {
    var width = viewer.width();
    var height = viewer.height();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    updateAnnotations();
}
function loadModel() {
    if (!url || !fileType) return;
    if (fileType === ".gltf" || fileType === ".glb") {
        new GLTFLoader().load(url, function (data) {
            addModel(data.scene);
        });
    } else if (fileType === ".obj") {
        var objLoader = new OBJLoader();
        var mtlLoader = new MTLLoader();
        $.ajax({
            url: url,
            type: "GET",
            dataType: "text",
            success: function (data) {
                var lines = data.split("\n");
                var mtlFile = "";
                $.each(lines, function (i, rawLine) {
                    var line = rawLine.trim();
                    if (line.startsWith("mtllib")) {
                        mtlFile = line.substring(6).trim();
                        return false;
                    }
                });
                if (!mtlFile) {
                    objLoader.load(url, function (object) {
                        addModel(object);
                    });
                    return;
                }
                var basePath = url.substring(0, url.lastIndexOf("/") + 1);
                mtlLoader.load(basePath + mtlFile, function (materials) {
                    materials.preload();
                    objLoader.setMaterials(materials);
                    objLoader.load(url, function (object) {
                        addModel(object);
                    });
                });
            }
        });
    } else if (fileType === ".fbx") {
        new FBXLoader().load(url, function (object) {
            addModel(object);
        });
    } else if (fileType === ".stl") {
        new STLLoader().load(url, function (geometry) {
            geometry.computeVertexNormals();
            addModel(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: .2, roughness: .7 })));
        });
    } else if (fileType === ".ply") {
        new PLYLoader().load(url, function (geometry) {
            geometry.computeVertexNormals();
            addModel(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: .2, roughness: .7 })));
        });
    } else if (fileType === ".dae") {
        new ColladaLoader().load(url, function (data) {
            addModel(data.scene);
        });
    }
}
controls.addEventListener("change", function () {
    updateAnnotations();
});
$("#chooseFolder").on("click", function () {
    $("#filess").val("").click();
});
$("#filess").on("change", function () {
    uploadFiles(this.files, true);
});
$("#chooseFiles").on("click", function () {
    $("#files").val("").click();
});
$("#files").on("change", function () {
    uploadFiles(this.files, false);
});
function uploadFiles(files, isFolder) {
    if (!files || !files.length) {
        $("#fileName").text(isFolder ? "No Folder Chosen" : "No Files Chosen");
        return;
    }
    $("#fileName").text(files.length + " Files Selected");
    var formData = new FormData();
    $.each(files, function (i, file) {
        formData.append("files", file);
        formData.append("filePaths", isFolder ? (file.webkitRelativePath || file.name) : file.name);
    });
    $.ajax({
        url: "/Home/Upload",
        type: "POST",
        data: formData,
        processData: false,
        contentType: false,
        success: function (response) {
            if (response.success) {
                window.location.href = "/Home/Index";
            } else {
                alert(response.message);
            }
        }
    });
}
$("#resetView").on("click", function () {
    if (!currentModel) return;
    fitModel(currentModel);
    updateAnnotations();
});
$(window).on("resize", resizeViewer);
setInterval(updateMotorData, 10000);
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
loadModel();
animate();