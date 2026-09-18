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
var assetLiveDataPoints = [];
var annotationLayer = $("#annotationLayer");
var annotationTemplate = $("#annotationTemplate");
var partsData = [];
var partsList = null;
var partsMeshes = [];
var partHighlights = [];
var savedSectionsData = [];
var editingIndex = -1;
var propertyAddData = [];
function updateMotorData() {
    $.ajax({
        url: "/Home/GetMotorData",
        type: "GET",
        dataType: "json",
        success: function (data) {
            if (!data) return;
            if (!assetLiveDataPoints.length) {
                createLiveTags(data);
                return;
            }
            annotations.forEach(function (annotation) {
                var value = data[annotation.tag];
                if (value !== undefined && value !== null) {
                    annotation.element.find(".annotation-property-value").text(value);
                }
            });
        },
        error: function (xhr) {
            console.log("Live data failed:", xhr.responseText);
        }
    });
}
function createLiveTags(data) {
    assetLiveDataPoints = [];
    Object.keys(data).slice(0, 2).forEach(function (tag) {
        var property = tag;
        if (tag.indexOf(".") >= 0) {
            property = tag.substring(tag.lastIndexOf(".") + 1);
        }
        assetLiveDataPoints.push({
            tag: tag,
            assetProperty: property,
            value: data[tag],
            position: null,
            positionText: null
        });
    });
    createAnnotations(true);
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
    light.target.position.copy(center);
    scene.add(light.target);
}
function addModel(object) {
    if (currentModel) {
        scene.remove(currentModel);
    }
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
    loadSavedAnnotations();
}
function loadSavedAnnotations() {
    $.ajax({
        url: "/Home/GetAnnotations",
        type: "GET",
        dataType: "json",
        success: function (data) {
            assetLiveDataPoints = [];
            savedSectionsData = [];
            if (data && typeof data === "string" && data !== "") {
                try {
                    var savedData = JSON.parse(data);
                    if (Array.isArray(savedData)) {
                        assetLiveDataPoints = savedData;
                    } else {
                        assetLiveDataPoints = Array.isArray(savedData.annotations) ? savedData.annotations : [];
                        savedSectionsData = Array.isArray(savedData.sections) ? savedData.sections : [];
                    }
                } catch (e) {
                    console.log("Annotation JSON parse failed");
                }
            } else if (data && typeof data === "object") {
                if (Array.isArray(data)) {
                    assetLiveDataPoints = data;
                } else {
                    assetLiveDataPoints = Array.isArray(data.annotations) ? data.annotations : [];
                    savedSectionsData = Array.isArray(data.sections) ? data.sections : [];
                }
            }
            if (assetLiveDataPoints.length > 0) {
                createAnnotations(false);
                updateMotorData();
            } else {
                updateMotorData();
            }
            if (currentModel) {
                loadParts();
            }
        },
        error: function (xhr) {
            console.log("Get annotations failed:", xhr.responseText);
            updateMotorData();
            if (currentModel) {
                loadParts();
            }
        }
    });
}
function getAllModelVertices() {
    var vertices = [];
    if (!currentModel) return vertices;
    currentModel.updateMatrixWorld(true);
    currentModel.traverse(function (child) {
        if (!child.isMesh || !child.geometry) return;
        var position = child.geometry.attributes.position;
        if (!position) return;
        for (var i = 0; i < position.count; i++) {
            var vertex = new THREE.Vector3();
            vertex.fromBufferAttribute(position, i);
            vertex.applyMatrix4(child.matrixWorld);
            vertices.push(vertex);
        }
    });
    return vertices;
}
function getMainEquipmentVertices() {
    if (!currentModel) return [];
    currentModel.updateMatrixWorld(true);
    var meshInfo = [];
    currentModel.traverse(function (child) {
        if (!child.isMesh || !child.geometry) return;
        var position = child.geometry.attributes.position;
        if (!position || !position.count) return;
        var box = new THREE.Box3();
        var vertex = new THREE.Vector3();
        for (var i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);
            vertex.applyMatrix4(child.matrixWorld);
            box.expandByPoint(vertex);
        }
        var size = box.getSize(new THREE.Vector3());
        var maxSize = Math.max(size.x, size.y, size.z);
        var minSize = Math.min(size.x, size.y, size.z);
        meshInfo.push({
            mesh: child,
            position: position,
            box: box,
            size: size,
            maxSize: maxSize,
            minSize: minSize,
            thin: maxSize > 0 && minSize / maxSize < .12,
            count: position.count
        });
    });
    if (!meshInfo.length) return [];
    var largestSize = Math.max.apply(null, meshInfo.map(function (item) {
        return item.maxSize;
    }));
    var usableMeshes = meshInfo.filter(function (item) {
        return !(item.thin && item.maxSize > largestSize * .45);
    });
    if (!usableMeshes.length) {
        usableMeshes = meshInfo;
    }
    var vertices = [];
    usableMeshes.forEach(function (item) {
        var step = Math.max(1, Math.floor(item.position.count / 10000));
        for (var i = 0; i < item.position.count; i += step) {
            var vertex = new THREE.Vector3();
            vertex.fromBufferAttribute(item.position, i);
            vertex.applyMatrix4(item.mesh.matrixWorld);
            vertices.push(vertex);
        }
    });
    return vertices;
}
function getModelCenter() {
    var vertices = getMainEquipmentVertices();
    if (!vertices.length) {
        vertices = getAllModelVertices();
    }
    if (!vertices.length) return new THREE.Vector3();
    var center = new THREE.Vector3();
    vertices.forEach(function (vertex) {
        center.add(vertex);
    });
    center.divideScalar(vertices.length);
    return center;
}
function getPositionText(position, box) {
    if (!position || !box) return "";
    var center = getModelCenter();
    var xSize = box.max.x - box.min.x;
    var ySize = box.max.y - box.min.y;
    var zSize = box.max.z - box.min.z;
    var dx = position.x - center.x;
    var dy = position.y - center.y;
    var dz = position.z - center.z;
    var result = [];
    if (Math.abs(dy) >= ySize * .2) {
        result.push(dy > 0 ? "Top" : "Bottom");
    }
    if (Math.abs(dx) >= xSize * .2) {
        result.push(dx > 0 ? "Right" : "Left");
    }
    if (Math.abs(dz) >= zSize * .2) {
        result.push(dz > 0 ? "Front" : "Back");
    }
    if (!result.length) {
        result.push("Center");
    }
    return result.join(" ");
}
function getPositionPoint(positionText) {
    if (!currentModel) return new THREE.Vector3();
    var text = (positionText || "").toLowerCase().trim();
    var vertices = getMainEquipmentVertices();
    if (!vertices.length) {
        vertices = getAllModelVertices();
    }
    if (!vertices.length) return new THREE.Vector3();
    if (!text || text === "center") {
        var center = new THREE.Vector3();
        vertices.forEach(function (vertex) {
            center.add(vertex);
        });
        center.divideScalar(vertices.length);
        return center;
    }
    var bestPoint = vertices[0].clone();
    var bestValue = -Infinity;
    vertices.forEach(function (vertex) {
        var value = 0;
        if (text.indexOf("right") >= 0) value += vertex.x;
        if (text.indexOf("left") >= 0) value -= vertex.x;
        if (text.indexOf("top") >= 0) value += vertex.y;
        if (text.indexOf("bottom") >= 0) value -= vertex.y;
        if (text.indexOf("front") >= 0) value += vertex.z;
        if (text.indexOf("back") >= 0) value -= vertex.z;
        if (value > bestValue) {
            bestValue = value;
            bestPoint = vertex.clone();
        }
    });
    return bestPoint;
}
function loadProperties() {
    $("#propertiesList").empty();
    if (!assetLiveDataPoints.length) {
        $("#propertiesList").html('<div style="padding:20px;color:gray;font-size:13px">No properties available</div>');
        return;
    }
    assetLiveDataPoints.forEach(function (item, index) {
        var propertyName = item.assetProperty || item.tag || "";
        var row = $(
            '<div class="property-row" data-index="' + index + '" style="display:flex;align-items:center;min-height:44px;border-bottom:1px solid #e5e5e5;padding:0 10px;box-sizing:border-box">' +
            '<div class="property-tag" title="' + propertyName + '" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px">' + propertyName + '</div>' +
            '<button type="button" class="k-button k-button-md k-button-flat k-button-flat-base property-edit" data-index="' + index + '" title="Edit" style="border:0;background:transparent;padding:5px;min-width:30px">✎</button>' +
            '</div>'
        );
        $("#propertiesList").append(row);
    });
}
function loadPropertyAddOptions() {
    var dropdown = $("#propertyAddDropdown").data("kendoDropDownList");
    if (!dropdown) {
        $("#propertyAddDropdown").kendoDropDownList({
            size: "small",
            dataTextField: "text",
            dataValueField: "value",
            optionLabel: "Select Property",
            change: function () {
                addSelectedProperty(this.value());
            }
        });
        dropdown = $("#propertyAddDropdown").data("kendoDropDownList");
    }
    dropdown.value("");
    $.ajax({
        url: "/Home/GetMotorData",
        type: "GET",
        dataType: "json",
        success: function (data) {
            propertyAddData = [];
            Object.keys(data || {}).forEach(function (tag) {
                var property = tag;
                if (tag.indexOf(".") >= 0) {
                    property = tag.substring(tag.lastIndexOf(".") + 1);
                }
                propertyAddData.push({
                    text: property,
                    value: tag,
                    liveValue: data[tag]
                });
            });
            dropdown.setDataSource(new kendo.data.DataSource({
                data: propertyAddData
            }));
            dropdown.value("");
        },
        error: function (xhr) {
            console.log("Property datasource failed:", xhr.responseText);
            propertyAddData = [];
            dropdown.setDataSource(new kendo.data.DataSource({
                data: []
            }));
            dropdown.value("");
        }
    });
}
function addSelectedProperty(tag) {
    if (!tag || !currentModel) return;
    var selected = null;
    propertyAddData.forEach(function (item) {
        if (item.value === tag) selected = item;
    });
    if (!selected) return;
    for (var i = 0; i < assetLiveDataPoints.length; i++) {
        if (assetLiveDataPoints[i].tag === tag) {
            $("#propertyAddView").hide();
            $("#propertiesView").show();
            loadProperties();
            return;
        }
    }
    assetLiveDataPoints.push({
        tag: selected.value,
        assetProperty: selected.text,
        value: selected.liveValue,
        position: null,
        positionText: null
    });
    saveModelJson();
    $("#propertyAddView").hide();
    $("#propertiesView").show();
    loadProperties();
}
function addLabelRow() {
    if (!currentModel) return;
    $("#propertiesView").hide();
    $("#partsView").hide();
    $("#partEditView").hide();
    $("#partCreateView").hide();
    $("#propertyEditView").hide();
    $("#propertyAddView").show();
    $("#partsPanel").show();
    loadPropertyAddOptions();
}
function updateNewLabel(index, row) {
    var item = assetLiveDataPoints[index];
    if (!item) return;
    var tagName = row.find(".new-label-tag").val();
    var value = row.find(".new-label-value").val();
    var positionText = row.find(".new-label-position").val();
    item.assetProperty = tagName;
    item.tag = tagName || "newLabel" + (index + 1);
    item.value = value;
    item.positionText = positionText;
    var point = getPositionPoint(positionText);
    item.position = {
        x: Number(point.x.toFixed(3)),
        y: Number(point.y.toFixed(3)),
        z: Number(point.z.toFixed(3))
    };
    var annotation = annotations[index];
    if (annotation) {
        annotation.point.copy(point);
        annotation.tag = item.tag;
        annotation.element.find(".annotation-title").text(tagName ? tagName.toUpperCase() : "");
        annotation.element.find(".annotation-property-value").text(value);
    } else {
        createAnnotations(false);
    }
    updateAnnotations();
    saveModelJson();
}
function updateExistingLabelPosition(index, positionText) {
    var item = assetLiveDataPoints[index];
    if (!item) return;
    item.positionText = positionText;
    var point = getPositionPoint(positionText);
    item.position = {
        x: Number(point.x.toFixed(3)),
        y: Number(point.y.toFixed(3)),
        z: Number(point.z.toFixed(3))
    };
    var annotation = annotations[index];
    if (annotation) {
        annotation.point.copy(point);
    }
    updateAnnotations();
    saveModelJson();
}
function getModelPositions() {
    var vertices = getMainEquipmentVertices();
    if (!vertices.length) {
        vertices = getAllModelVertices();
    }
    if (!vertices.length || !assetLiveDataPoints.length) return [];
    var positionNames = ["Top", "Bottom", "Left", "Right", "Center", "Top Left", "Top Right", "Front", "Back", "Bottom Left", "Bottom Right"];
    var positions = [];
    positionNames.forEach(function (name) {
        if (positions.length >= assetLiveDataPoints.length) return;
        var point = getPositionPoint(name);
        var exists = positions.some(function (item) {
            return item.distanceToSquared(point) < .000001;
        });
        if (!exists) {
            positions.push(point.clone());
        }
    });
    if (positions.length < assetLiveDataPoints.length) {
        vertices.forEach(function (point) {
            if (positions.length >= assetLiveDataPoints.length) return;
            var exists = positions.some(function (item) {
                return item.distanceToSquared(point) < .000001;
            });
            if (!exists) {
                positions.push(point.clone());
            }
        });
    }
    for (var i = 0; i < assetLiveDataPoints.length; i++) {
        if (positions[i]) {
            assetLiveDataPoints[i].position = {
                x: Number(positions[i].x.toFixed(3)),
                y: Number(positions[i].y.toFixed(3)),
                z: Number(positions[i].z.toFixed(3))
            };
            assetLiveDataPoints[i].positionText = positionNames[i] || "Center";
        }
    }
    saveModelJson();
    return assetLiveDataPoints.map(function (item) {
        return new THREE.Vector3(item.position.x, item.position.y, item.position.z);
    });
}
function getPoints(forceRecalculate) {
    if (!forceRecalculate) {
        var saved = true;
        for (var i = 0; i < assetLiveDataPoints.length; i++) {
            if (!assetLiveDataPoints[i].position) {
                saved = false;
                break;
            }
            if (assetLiveDataPoints[i].position.x === undefined || assetLiveDataPoints[i].position.y === undefined || assetLiveDataPoints[i].position.z === undefined) {
                saved = false;
                break;
            }
        }
        if (saved) {
            return assetLiveDataPoints.map(function (item) {
                return new THREE.Vector3(
                    Number(item.position.x),
                    Number(item.position.y),
                    Number(item.position.z)
                );
            });
        }
    }
    return getModelPositions();
}
function getSectionsData() {
    var sections = [];
    if (!currentModel) return sections;
    currentModel.updateMatrixWorld(true);
    partsData.forEach(function (part, index) {
        if (!part) return;
        var mesh = partsMeshes[index];
        if (part.meshNames && part.meshNames.length) {
            sections.push({
                sectionName: part.text || "Unnamed Part",
                markupColor: part.markupColor || "#ffff00",
                meshNames: part.meshNames
            });
        } else if (part.selectionType === "freehand") {
            sections.push({
                sectionName: part.text || "Unnamed Part",
                markupColor: part.markupColor || "#ffff00",
                selectionType: "freehand",
                checked: part.checked === true,
                highlightTriangles: part.highlightTriangles || []
            });
        } else if (mesh) {
            sections.push({
                sectionName: part.text || mesh.name || "Unnamed Part",
                positionMatrix: mesh.matrixWorld.elements.slice(),
                markupColor: part.markupColor || null
            });
        }
    });
    return sections;
}
function saveModelJson(onSuccess) {
    if (!currentModel) return;
    var modelJson = {
        annotations: assetLiveDataPoints,
        sections: getSectionsData()
    };
    $.ajax({
        url: "/Home/SaveAnnotations",
        type: "POST",
        data: {
            annotationJson: JSON.stringify(modelJson)
        },
        success: function () {
            console.log("Model JSON saved");
            if (typeof onSuccess === "function") onSuccess();
        },
        error: function (xhr) {
            console.log("Save failed:", xhr.responseText);
        }
    });
}
function saveAnnotations() {
    saveModelJson();
}
function createAnnotation(point, data) {
    var element = annotationTemplate.clone().removeAttr("id").removeAttr("style");
    var line = element.find(".annotation-line");
    var label = element.find(".annotation");
    label.find(".annotation-title").text(data.title);
    label.find(".annotation-property-value").text(data.value || "");
    annotationLayer.append(element);
    annotations.push({
        point: point,
        element: label,
        line: line,
        tag: data.tag
    });
}
function createAnnotations(forceRecalculate) {
    annotations = [];
    annotationLayer.children().not("#annotationTemplate").remove();
    if (!assetLiveDataPoints.length) return;
    var points = getPoints(forceRecalculate);
    for (var i = 0; i < assetLiveDataPoints.length; i++) {
        var data = assetLiveDataPoints[i];
        if (!data || !data.position || !points[i]) continue;
        createAnnotation(points[i], {
            title: data.assetProperty ? data.assetProperty.toUpperCase() : data.tag.toUpperCase(),
            value: data.value || "",
            tag: data.tag
        });
    }
    updateAnnotations();
    updateMotorData();
}
function updateAnnotations() {
    if (!currentModel) return;
    var width = viewer.width();
    var height = viewer.height();
    var positions = [];
    annotations.forEach(function (annotation) {
        var screen = annotation.point.clone().project(camera);
        if (screen.z < -1 || screen.z > 1) {
            annotation.element.hide();
            annotation.line.hide();
            return;
        }
        annotation.element.show();
        annotation.line.show();
        var x = (screen.x + 1) * width / 2;
        var y = (-screen.y + 1) * height / 2;
        var labelWidth = annotation.element.outerWidth();
        var labelHeight = annotation.element.outerHeight();
        var distance = 130;
        var angle = Math.atan2(y - height / 2, x - width / 2);
        var left = x + Math.cos(angle) * distance - labelWidth / 2;
        var top = y + Math.sin(angle) * distance - labelHeight / 2;
        left = Math.max(10, Math.min(left, width - labelWidth - 10));
        top = Math.max(10, Math.min(top, height - labelHeight - 10));
        var overlap = true;
        var count = 0;
        while (overlap && count < 30) {
            overlap = false;
            for (var i = 0; i < positions.length; i++) {
                var previous = positions[i];
                if (left < previous.x + previous.width &&
                    left + labelWidth > previous.x &&
                    top < previous.y + previous.height &&
                    top + labelHeight > previous.y) {
                    top += labelHeight + 10;
                    if (top + labelHeight > height - 10) {
                        top = 10;
                    }
                    overlap = true;
                    break;
                }
            }
            count++;
        }
        positions.push({
            x: left,
            y: top,
            width: labelWidth,
            height: labelHeight
        });
        var endX = left + labelWidth / 2;
        var endY = top + labelHeight / 2;
        var dx = endX - x;
        var dy = endY - y;
        var length = Math.sqrt(dx * dx + dy * dy);
        var rotation = Math.atan2(dy, dx) * 180 / Math.PI;
        annotation.element.css({
            left: left + "px",
            top: top + "px"
        });
        annotation.line.css({
            left: x + "px",
            top: y + "px",
            width: length + "px",
            transform: "rotate(" + rotation + "deg)"
        });
    });
}
function loadParts() {
    partsData = [];
    partsMeshes = [];
    partHighlights = [];
    if (!currentModel) return;
    currentModel.updateMatrixWorld(true);
    var savedModelSections = (savedSectionsData || []).filter(function (section) {
        return section && !section.meshNames && section.selectionType !== "freehand";
    });
    currentModel.traverse(function (child) {
        if (!child.isMesh) return;
        var partIndex = partsData.length;
        var partName = child.name;
        if (!partName || partName === "undefined" || partName === "null") {
            partName = "Unnamed Part";
        }
        var savedSection = savedModelSections[partIndex];
        var markupColor = savedSection && savedSection.markupColor
            ? savedSection.markupColor
            : "#" + new THREE.Color().setHSL(Math.random(), .8, .25).getHexString();
        if (savedSection && savedSection.sectionName) {
            partName = savedSection.sectionName;
            child.name = partName;
        }
        partsData.push({
            id: partsData.length,
            text: partName,
            checked: savedSection ? savedSection.checked === true : false,
            markupColor: markupColor,
            selectionType: "model"
        });
        partsMeshes.push(child);
    });
    (savedSectionsData || []).forEach(function (section) {
        if (!section || !section.meshNames || !section.meshNames.length) return;
        partsData.push({
            id: partsData.length,
            text: section.sectionName || "Unnamed Part",
            markupColor: section.markupColor || "#ffff00",
            meshNames: section.meshNames
        });
        partsMeshes.push(null);
    });
    (savedSectionsData || []).forEach(function (section) {
        if (!section || section.selectionType !== "freehand") return;
        partsData.push({
            id: partsData.length,
            text: section.sectionName || "Unnamed Part",
            checked: section.checked === true,
            markupColor: section.markupColor || "#ffff00",
            selectionType: "freehand",
            highlightTriangles: section.highlightTriangles || []
        });
        partsMeshes.push(null);
    });
    if ($("#partsList").data("kendoListView")) {
        $("#partsList").data("kendoListView").destroy();
        $("#partsList").empty();
    }
    partsList = $("#partsList").kendoListView({
        dataSource: partsData,
        template: kendo.template($("#partTemplate").html())
    }).data("kendoListView");
    $("#partsList").off("change.partCheck").on("change.partCheck", ".part-check", function () {
        var index = parseInt($(this).attr("data-index"), 10);
        if (partsData[index]) {
            partsData[index].checked = this.checked;
        }
        if (partsData[index] && (partsData[index].selectionType === "freehand" || (partsData[index].meshNames && partsData[index].meshNames.length))) {
            if (partsData[index].checked) showSavedPartHighlight(partsData[index]);
            else removeSavedPartHighlight(partsData[index]);
        } else {
            updatePartHighlight();
        }
        saveModelJson();
    });
    $("#partsList").off("click.partEdit").on("click.partEdit", ".part-edit", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var index = parseInt($(this).attr("data-index"), 10);
        openPartColor(index);
    });
    updatePartHighlight();
    partsData.forEach(function (part) {
        if ((part.selectionType === "freehand" || (part.meshNames && part.meshNames.length)) && part.checked) showSavedPartHighlight(part);
    });
    if (!savedSectionsData.length) {
        saveModelJson();
    }
}
function openPartColor(index) {
    editingIndex = index;
    $("#partsView").hide();
    $("#partEditView").show();
    var colorPicker = $("#partColorEdit").data("kendoColorPicker");
    if (!colorPicker) {
        $("#partColorEdit").kendoColorPicker({
            buttons: true,
            size: "small",
            popup: {
                appendTo: "#partsPanel",
                position: "top left"
            }
        });
        colorPicker = $("#partColorEdit").data("kendoColorPicker");
    }
    colorPicker.value(partsData[index].markupColor || "#555555");
    initializePartRename();
    loadPartRename(index);
}
function commitPartColor() {
    if (editingIndex < 0) {
        return;
    }
    var index = editingIndex;
    var colorPicker = $("#partColorEdit").data("kendoColorPicker");
    var color = colorPicker ? colorPicker.value() : partsData[index].markupColor;
    partsData[index].markupColor = color;
    savePartRename(index);
    updatePartHighlight();
    $("#partEditView").hide();
    $("#partsView").show();
    editingIndex = -1;
    saveModelJson();
}
function cancelPartColor() {
    $("#partEditView").hide();
    $("#partsView").show();
    editingIndex = -1;
}
function initializePartRename() {
    var renameBox = $("#partRenameEdit").data("kendoTextBox");
    if (!renameBox) {
        $("#partRenameEdit").kendoTextBox({
            size: "small"
        });
    }
}
function loadPartRename(index) {
    var renameBox = $("#partRenameEdit").data("kendoTextBox");
    if (renameBox) {
        renameBox.value(partsData[index].text || "");
    }
}
function savePartRename(index) {
    var renameBox = $("#partRenameEdit").data("kendoTextBox");
    if (!renameBox) {
        return;
    }
    var newName = renameBox.value();
    if (!newName) {
        newName = partsData[index].text;
    }
    partsData[index].text = newName;
    if (partsMeshes[index]) {
        partsMeshes[index].name = newName;
    }
    $("#partsList .part-row").eq(index).find(".part-name").text(newName);
    $("#partsList .part-row").eq(index).find(".part-name").attr("title", newName);
    saveModelJson();
}
function updatePartHighlight() {
    if (!partsList || !partsMeshes.length) return;
    partsMeshes.forEach(function (mesh, index) {
        var item = partsData[index];
        if (!item || !mesh || item.selectionType === "freehand" || (item.meshNames && item.meshNames.length)) return;
        if (item.checked) {
            if (partHighlights[index]) {
                partHighlights[index].material.color.set(item.markupColor);
            } else {
                var edges = new THREE.EdgesGeometry(mesh.geometry, 15);
                var material = new THREE.LineBasicMaterial({
                    color: item.markupColor,
                    transparent: true,
                    opacity: 1,
                    depthTest: false
                });
                var line = new THREE.LineSegments(edges, material);
                line.renderOrder = 1000;
                line.scale.set(1.002, 1.002, 1.002);
                mesh.add(line);
                partHighlights[index] = line;
            }
        } else {
            if (partHighlights[index]) {
                partsMeshes[index].remove(partHighlights[index]);
                partHighlights[index].geometry.dispose();
                partHighlights[index].material.dispose();
                partHighlights[index] = null;
            }
        }
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
        }, undefined, function (error) {
            console.log("GLTF load failed:", error);
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
            },
            error: function (xhr) {
                console.log("OBJ read failed:", xhr.responseText);
            }
        });
    } else if (fileType === ".fbx") {
        new THREE.FBXLoader().load(url, function (object) {
            addModel(object);
        });
    } else if (fileType === ".stl") {
        new THREE.STLLoader().load(url, function (geometry) {
            geometry.computeVertexNormals();
            addModel(new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({
                    color: 0xaaaaaa,
                    metalness: .2,
                    roughness: .55
                })
            ));
        });
    } else if (fileType === ".ply") {
        new THREE.PLYLoader().load(url, function (geometry) {
            geometry.computeVertexNormals();
            addModel(new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({
                    color: 0xaaaaaa,
                    metalness: .2,
                    roughness: .55
                })
            ));
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
$(document).on("click", "#savePartEdit", function () {
    commitPartColor();
});
$(document).on("click", "#cancelPartEdit", function () {
    cancelPartColor();
});
$(document).on("click", "#addLabelButton", function () {
    if (!currentModel) return;
    $("#propertiesView").hide();
    $("#partsView").hide();
    $("#partEditView").hide();
    $("#partCreateView").hide();
    $("#propertyEditView").hide();
    $("#propertyAddView").show();
    $("#partsPanel").show();
    addLabelRow();
});
$(document).on("input", ".new-label-tag, .new-label-value", function () {
    var row = $(this).closest(".property-row");
    var index = parseInt(row.attr("data-index"), 10);
    updateNewLabel(index, row);
});
$(document).on("input", ".new-label-position", function () {
    var row = $(this).closest(".property-row");
    var index = parseInt(row.attr("data-index"), 10);
    updateNewLabel(index, row);
});
$(document).on("input", ".edit-label-position", function () {
    var row = $(this).closest(".property-row");
    var index = parseInt(row.attr("data-index"), 10);
    updateExistingLabelPosition(index, $(this).val());
});
$(document).on("click", ".property-edit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var index = parseInt($(this).attr("data-index"), 10);
    if (index < 0 || !assetLiveDataPoints[index]) return;
    console.log("Edit property:", assetLiveDataPoints[index]);
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
        },
        error: function (xhr) {
            console.log("Upload failed:", xhr.responseText);
        }
    });
}
$("#partsButton").on("click", function () {
    if ($("#partsPanel").is(":visible") && $("#partsView").is(":visible")) {
        $("#partsPanel").hide();
        return;
    }
    $("#propertiesView").hide();
    $("#propertyAddView").hide();
    $("#partEditView").hide();
    $("#partsView").show();
    $("#partsPanel").show();
});
$("#propertiesButton").on("click", function () {
    if ($("#partsPanel").is(":visible") && $("#propertiesView").is(":visible")) {
        $("#partsPanel").hide();
        return;
    }
    $("#partsView").hide();
    $("#partEditView").hide();
    $("#propertyAddView").hide();
    $("#propertiesView").show();
    $("#partsPanel").show();
    loadProperties();
});
$("#resetView").on("click", function () {
    if (currentModel) {
        fitModel(currentModel);
        partsData.forEach(function (item) {
            item.checked = false;
        });
        $("#partsList .part-check").prop("checked", false);
        updatePartHighlight();
        updateAnnotations();
    }
});
$(window).on("resize", resizeViewer);
setInterval(updateMotorData, 10000);
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    updateAnnotations();
}
loadModel();
animate();