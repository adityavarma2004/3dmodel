var viewer = $("#viewer");
var scene = new THREE.Scene();
scene.background = new THREE.Color(0x20252d);
var camera = new THREE.PerspectiveCamera(60, viewer.width() / viewer.height(), .1, 2000);
var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewer.width(), viewer.height());
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewer.append(renderer.domElement);
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .05;
controls.minDistance = .5;
controls.maxDistance = 1000;
scene.add(new THREE.AmbientLight(0xffffff, .6));
scene.add(new THREE.HemisphereLight(0xb1caff, 0x2a2015, .5));
var light = new THREE.DirectionalLight(0xffffff, 2.2);
light.position.set(5, 8, 5);
light.castShadow = true;
light.shadow.mapSize.width = 2048;
light.shadow.mapSize.height = 2048;
light.shadow.camera.near = .5;
light.shadow.camera.far = 200;
light.shadow.bias = -.0005;
scene.add(light);
var light2 = new THREE.DirectionalLight(0xaac4ff, .8);
light2.position.set(-5, 3, 5);
scene.add(light2);
var light3 = new THREE.DirectionalLight(0xffe8c2, .6);
light3.position.set(0, 2, -6);
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
var assetLiveDataPoints = [
    {
        tag: "Motor.Temperature",
        assetProperty: "Temperature"
    },
    {
        tag: "Motor.Speed",
        assetProperty: "Speed"
    },
    {
        tag: "Motor.Power",
        assetProperty: "Power"
    },
    {
        tag: "Motor.FlowRate",
        assetProperty: "FlowRate"
    },
    {
        tag: "Motor.Vibration",
        assetProperty: "Vibration"
    }
];
var partsData = [];
var partsList = null;
var partsMeshes = [];
var partHighlights = [];
var renameInput = $("#partRename");
var renamingIndex = -1;
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
                if (annotationValues[i]) {
                    annotation.element.find(".annotation-property-value").text(annotationValues[i].value);
                }
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
    light.position.set(center.x + maxSize, center.y + maxSize * 1.5, center.z + maxSize);
    light.shadow.camera.left = -maxSize;
    light.shadow.camera.right = maxSize;
    light.shadow.camera.top = maxSize;
    light.shadow.camera.bottom = -maxSize;
    light.shadow.camera.far = maxSize * 10;
    light.shadow.camera.updateProjectionMatrix();
    light.target.position.copy(center);
    scene.add(light.target);
}
function addModel(object) {
    if (currentModel) scene.remove(currentModel);
    currentModel = object;
    object.traverse(function (child) {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material && child.material.map) {
            child.material.map.encoding = THREE.sRGBEncoding;
        }
    });
    scene.add(object);
    fitModel(object);
    createAnnotations();
    loadParts();
}
function loadParts() {
    partsData = [];
    partsMeshes = [];
    partHighlights = [];
    if (!currentModel) return;
    currentModel.traverse(function (child) {
        if (!child.isMesh) return;
        var partName = child.name;
        if (!partName || partName === "undefined" || partName === "null") {
            partName = "Unnamed Part";
        }
        partsData.push({
            id: partsData.length,
            text: partName,
            checked: false
        });
        partsMeshes.push(child);
    });
    if ($("#partsList").data("kendoListView")) {
        $("#partsList").data("kendoListView").destroy();
        $("#partsList").empty();
    }
    partsList = $("#partsList").kendoListView({
        dataSource: partsData,
        template: kendo.template($("#partTemplate").html()),
        dataBound: function () {
            $("#partsList .part-check").each(function () {
                if (!$(this).data("kendoCheckBox")) {
                    $(this).kendoCheckBox();
                }
            });
        }
    }).data("kendoListView");
    $("#partsList").off("change.partCheck").on("change.partCheck", ".part-check", function () {
        var index = parseInt($(this).attr("data-index"), 10);
        if (partsData[index]) {
            partsData[index].checked = this.checked;
        }
        updatePartHighlight();
    });
    $("#partsList").off("click.partEdit").on("click.partEdit", ".part-edit", function (e) {
        e.preventDefault();
        e.stopPropagation();
        renamePart($(this));
    });
}
function renamePart(button) {
    if (!partsList) return;
    var index = parseInt(button.attr("data-index"), 10);
    if (isNaN(index) || !partsMeshes[index]) return;
    var item = partsList.dataSource.data()[index];
    if (!item) return;
    var textSpan = button.siblings(".part-name");
    var spanPos = textSpan.offset();
    var panelPos = $("#partsPanel").offset();
    renamingIndex = index;
    renameInput.val(item.text);
    renameInput.css({
        left: (spanPos.left - panelPos.left) + "px",
        top: (spanPos.top - panelPos.top) + "px",
        width: textSpan.outerWidth() + "px"
    });
    renameInput.show().trigger("focus").select();
}
function commitRename() {
    if (renamingIndex < 0) return;
    var index = renamingIndex;
    renamingIndex = -1;
    renameInput.hide();
    var newName = $.trim(renameInput.val());
    if (newName === "") return;
    var item = partsList.dataSource.data()[index];
    if (item) item.set("text", newName);
    if (partsMeshes[index]) partsMeshes[index].name = newName;
}
function cancelRename() {
    renamingIndex = -1;
    renameInput.hide();
}
renameInput.on("keydown", function (e) {
    if (e.which === 13) commitRename();
    else if (e.which === 27) cancelRename();
});
renameInput.on("blur", function () {
    commitRename();
});
function updatePartHighlight() {
    if (!partsList || !partsMeshes.length) return;
    partsMeshes.forEach(function (mesh, index) {
        var item = partsData[index];
        if (!item) return;
        if (item.checked) {
            if (!partHighlights[index]) {
                var edges = new THREE.EdgesGeometry(mesh.geometry, 15);
                var material = new THREE.LineDashedMaterial({
                    color: 0xffff00,
                    dashSize: .025,
                    gapSize: .015,
                    transparent: true,
                    opacity: 1,
                    depthTest: false
                });
                var line = new THREE.LineSegments(edges, material);
                line.computeLineDistances();
                line.renderOrder = 1000;
                mesh.add(line);
                partHighlights[index] = line;
            }
        } else {
            if (partHighlights[index]) {
                mesh.remove(partHighlights[index]);
                partHighlights[index].geometry.dispose();
                partHighlights[index].material.dispose();
                partHighlights[index] = null;
            }
        }
    });
}
function getPoints() {
    var vertices = [];
    if (!currentModel) return [];
    currentModel.updateMatrixWorld(true);
    currentModel.traverse(function (child) {
        if (!child.isMesh || !child.geometry) return;
        var position = child.geometry.attributes.position;
        if (!position) return;
        var step = Math.max(1, Math.floor(position.count / 1000));
        for (var i = 0; i < position.count; i += step) {
            vertices.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
        }
    });
    if (!vertices.length) return [];
    var box = new THREE.Box3().setFromObject(currentModel);
    var center = box.getCenter(new THREE.Vector3());
    var selected = [];
    var first = vertices[0];
    var firstDistance = first.distanceTo(center);
    vertices.forEach(function (vertex) {
        var distance = vertex.distanceTo(center);
        if (distance < firstDistance) {
            first = vertex;
            firstDistance = distance;
        }
    });
    selected.push(first.clone());
    while (selected.length < assetLiveDataPoints.length && selected.length < vertices.length) {
        var bestVertex = null;
        var bestDistance = -1;
        vertices.forEach(function (vertex) {
            var nearest = Infinity;
            selected.forEach(function (point) {
                nearest = Math.min(nearest, vertex.distanceTo(point));
            });
            if (nearest > bestDistance) {
                bestDistance = nearest;
                bestVertex = vertex;
            }
        });
        if (!bestVertex) break;
        selected.push(bestVertex.clone());
    }
    for (var i = 0; i < assetLiveDataPoints.length; i++) {
        var point = selected[i % selected.length];
        assetLiveDataPoints[i].position = {
            x: Number(point.x.toFixed(3)),
            y: Number(point.y.toFixed(3)),
            z: Number(point.z.toFixed(3))
        };
        vertices[i] = point.clone();
    }
    var annotationJson = JSON.stringify(assetLiveDataPoints);
    var modelName = url ? url.substring(url.lastIndexOf("/") + 1) : "";
    if (modelName) {
        $.ajax({
            url: "/Home/SaveAnnotations",
            type: "POST",
            data: {
                modelName: modelName,
                annotationJson: annotationJson
            },
            success: function () {
                console.log("Annotations saved to DB");
            },
            error: function (xhr) {
                console.log("Save failed:", xhr.responseText);
            }
        });
    }
    console.log(annotationJson);
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
        var data = assetLiveDataPoints[i];
        var value = annotationValues[i] ? annotationValues[i].value : "";
        createAnnotation(points[i], {
            title: data.assetProperty.toUpperCase(),
            value: value
        });
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
        new THREE.GLTFLoader().load(url, function (data) {
            addModel(data.scene);
        });
    } else if (fileType === ".obj") {
        var objLoader = new THREE.OBJLoader();
        var mtlLoader = new THREE.MTLLoader();
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
        new THREE.FBXLoader().load(url, function (object) {
            addModel(object);
        });
    } else if (fileType === ".stl") {
        new THREE.STLLoader().load(url, function (geometry) {
            geometry.computeVertexNormals();
            addModel(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: .2, roughness: .55 })));
        });
    } else if (fileType === ".ply") {
        new THREE.PLYLoader().load(url, function (geometry) {
            geometry.computeVertexNormals();
            addModel(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: .2, roughness: .55 })));
        });
    } else if (fileType === ".dae") {
        new THREE.ColladaLoader().load(url, function (data) {
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
    var selectedModelName = "";
    $.each(files, function (i, file) {
        formData.append("files", file);
        formData.append("filePaths", isFolder ? (file.webkitRelativePath || file.name) : file.name);
        if (!selectedModelName && /\.(gltf|glb|obj|fbx|stl|ply|dae)$/i.test(file.name)) {
            selectedModelName = file.name;
        }
    });
    $.ajax({
        url: "/Home/Upload",
        type: "POST",
        data: formData,
        processData: false,
        contentType: false,
        success: function (response) {
            if (response.success) {
                $.ajax({
                    url: "/Home/GetAnnotations",
                    type: "GET",
                    data: {
                        modelName: selectedModelName
                    },
                    success: function (data) {
                        if (data.annotationJson) {
                            assetLiveDataPoints = JSON.parse(data.annotationJson);
                            console.log("Annotations loaded from DB");
                        }
                        window.location.href = "/Home/Index";
                    },
                    error: function (xhr) {
                        console.log("Load failed:", xhr.responseText);
                        window.location.href = "/Home/Index";
                    }
                });
            } else {
                alert(response.message);
            }
        }
    });
}
$("#partsButton").on("click", function () {
    $("#partsPanel").toggle();
});
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