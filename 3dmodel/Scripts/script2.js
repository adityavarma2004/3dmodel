var editingPropertyIndex = -1;
var selectedClickPoint = null;
var addingPart = false;
var paintingPart = false;
var selectedPartTriangles = {};
var newPartHighlightGroup = null;
var lastPaintX = null;
var lastPaintY = null;
var initialHighlightsApplied = false;
$(document).ready(function () {
    $("#partsPanel").css("z-index", 9999);
    startInitialHighlightWatch();
    $("#newPartName").kendoTextBox({
        size: "small"
    });
    $("#partSourceType").kendoDropDownList({
        size: "small",
        dataTextField: "text",
        dataValueField: "value",
        dataSource: [
            { text: "Select on Model", value: "model" },
            { text: "Select from Existing Parts", value: "existing" }
        ],
        change: function () {
            var type = this.value();
            if (type === "existing") {
                stopPartPaintingMode();
                $("#partModelFields").hide();
                $("#partExistingFields").show();
                buildExistingPartsList();
            } else {
                $("#partExistingFields").hide();
                $("#partModelFields").show();
                startPartPainting();
            }
        }
    });
    $("#saveNewPart").kendoButton();
    $("#cancelNewPart").kendoButton();
    $("#propertyRenameEdit").kendoTextBox({
        size: "small"
    });
    $("#propertyPositionType").kendoDropDownList({
        size: "small",
        dataTextField: "text",
        dataValueField: "value",
        dataSource: [
            { text: "Click on Model", value: "click" },
            { text: "Give XYZ Coordinates", value: "xyz" },
            { text: "Position Name", value: "name" }
        ],
        change: function () {
            var type = this.value();
            $("#propertyXYZFields").hide();
            $("#propertyNameField").hide();
            $("#propertyClickMessage").hide();
            if (type === "click") $("#propertyClickMessage").show();
            if (type === "xyz") $("#propertyXYZFields").show();
            if (type === "name") $("#propertyNameField").show();
        }
    });
    $("#propertyPositionName").kendoDropDownList({
        size: "small",
        dataTextField: "text",
        dataValueField: "value",
        dataSource: [
            { text: "Center", value: "Center" },
            { text: "Left", value: "Left" },
            { text: "Right", value: "Right" },
            { text: "Up", value: "Top" },
            { text: "Down", value: "Bottom" },
            { text: "Front", value: "Front" },
            { text: "Back", value: "Back" },
            { text: "Up Left", value: "Top Left" },
            { text: "Up Right", value: "Top Right" },
            { text: "Down Left", value: "Bottom Left" },
            { text: "Down Right", value: "Bottom Right" }
        ]
    });
    $("#propertyX").kendoNumericTextBox({
        format: "n3",
        decimals: 3,
        size: "small"
    });
    $("#propertyY").kendoNumericTextBox({
        format: "n3",
        decimals: 3,
        size: "small"
    });
    $("#propertyZ").kendoNumericTextBox({
        format: "n3",
        decimals: 3,
        size: "small"
    });
    $("#savePropertyEdit").kendoButton();
    $("#cancelPropertyEdit").kendoButton();
});
function getPartRaycast(clientX, clientY) {
    if (!currentModel) return null;
    var rect = renderer.domElement.getBoundingClientRect();
    var mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    var meshes = [];
    currentModel.traverse(function (child) {
        if (child.isMesh && child.visible) meshes.push(child);
    });
    var intersections = raycaster.intersectObjects(meshes, true);
    if (!intersections.length) return null;
    return intersections[0];
}
function getTriangleVertices(mesh, faceIndex) {
    if (!mesh || !mesh.geometry) return null;
    var geometry = mesh.geometry;
    var position = geometry.attributes.position;
    if (!position) return null;
    var index = geometry.index;
    var indices;
    if (index) {
        var a = index.getX(faceIndex * 3);
        var b = index.getX(faceIndex * 3 + 1);
        var c = index.getX(faceIndex * 3 + 2);
        indices = [a, b, c];
    } else {
        indices = [faceIndex * 3, faceIndex * 3 + 1, faceIndex * 3 + 2];
    }
    if (indices[2] >= position.count) return null;
    var vertices = [];
    for (var i = 0; i < 3; i++) {
        var vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(position, indices[i]);
        mesh.localToWorld(vertex);
        vertices.push(vertex);
    }
    return vertices;
}
function selectTriangle(intersection) {
    if (!intersection || !intersection.object) return;
    var mesh = intersection.object;
    var faceIndex = intersection.faceIndex;
    if (faceIndex === undefined || faceIndex === null) return;
    var key = mesh.uuid + "_" + faceIndex;
    if (selectedPartTriangles[key]) return;
    selectedPartTriangles[key] = {
        mesh: mesh,
        faceIndex: faceIndex
    };
    rebuildPaintHighlight();
    updatePartSelectionText();
}
function paintAtPosition(clientX, clientY) {
    var intersection = getPartRaycast(clientX, clientY);
    if (!intersection) return;
    selectTriangle(intersection);
}
function paintBetweenPoints(startX, startY, endX, endY) {
    var dx = endX - startX;
    var dy = endY - startY;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(distance / 6));
    for (var i = 1; i <= steps; i++) {
        var x = startX + dx * i / steps;
        var y = startY + dy * i / steps;
        paintAtPosition(x, y);
    }
}
function rebuildPaintHighlight() {
    removeNewPartHighlight();
    if (!currentModel || !Object.keys(selectedPartTriangles).length) return;
    var group = new THREE.Group();
    group.name = "NewPartHighlight";
    var meshData = {};
    Object.keys(selectedPartTriangles).forEach(function (key) {
        var item = selectedPartTriangles[key];
        var mesh = item.mesh;
        var triangle = getTriangleVertices(mesh, item.faceIndex);
        if (!triangle) return;
        if (!meshData[mesh.uuid]) {
            meshData[mesh.uuid] = {
                mesh: mesh,
                vertices: []
            };
        }
        meshData[mesh.uuid].vertices.push(
            triangle[0].x, triangle[0].y, triangle[0].z,
            triangle[1].x, triangle[1].y, triangle[1].z,
            triangle[2].x, triangle[2].y, triangle[2].z
        );
    });
    Object.keys(meshData).forEach(function (key) {
        var data = meshData[key];
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.vertices, 3));
        geometry.computeVertexNormals();
        var material = new THREE.MeshBasicMaterial({
            color: "#ffff00",
            transparent: true,
            opacity: .7,
            side: THREE.DoubleSide,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        var highlight = new THREE.Mesh(geometry, material);
        highlight.renderOrder = 20;
        group.add(highlight);
    });
    currentModel.add(group);
    newPartHighlightGroup = group;
}
function removeNewPartHighlight() {
    if (!newPartHighlightGroup) return;
    newPartHighlightGroup.traverse(function (child) {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
    });
    if (newPartHighlightGroup.parent) newPartHighlightGroup.parent.remove(newPartHighlightGroup);
    newPartHighlightGroup = null;
}
function updatePartSelectionText() {
    var count = Object.keys(selectedPartTriangles).length;
    $("#partSelectionCount").text("Selected surface triangles: " + count);
}
function startPartPainting() {
    addingPart = true;
    paintingPart = false;
    selectedPartTriangles = {};
    removeNewPartHighlight();
    lastPaintX = null;
    lastPaintY = null;
    controls.enabled = true;
    updatePartSelectionText();
    $("#partSelectionMessage").show();
}
function stopPartPainting() {
    controls.enabled = true;
    paintingPart = false;
    lastPaintX = null;
    lastPaintY = null;
    $("#partSelectionMessage").hide();
}
function stopPartPaintingMode() {
    stopPartPainting();
    addingPart = false;
    selectedPartTriangles = {};
    removeNewPartHighlight();
    updatePartSelectionText();
}
function applyInitialPartHighlights() {
    if (initialHighlightsApplied || !currentModel || !partsData.length) return;
    initialHighlightsApplied = true;
    partsData.forEach(function (part) {
        if (!part || !part.checked) return;
        if (part.selectionType === "freehand" || (part.meshNames && part.meshNames.length)) {
            showSavedPartHighlight(part);
        }
    });
}
function startInitialHighlightWatch() {
    var count = 0;
    var timer = setInterval(function () {
        if (currentModel && partsData.length) {
            applyInitialPartHighlights();
            clearInterval(timer);
        }
        count++;
        if (count > 100) clearInterval(timer);
    }, 100);
}
function buildExistingPartsList() {
    var container = $("#existingPartsList");
    container.empty();
    partsData.forEach(function (part, index) {
        var row = $('<label class="existing-part-row"></label>');
        var box = $('<input type="checkbox" class="k-checkbox k-checkbox-md k-rounded-md existing-part-check">').attr("data-index", index);
        row.append(box).append('<span style="margin-left:8px">' + part.text + '</span>');
        container.append(row);
    });
}
$(document).on("change", ".part-check", function () {
    var index = parseInt($(this).attr("data-index"), 10);
    if (!partsData[index]) return;
    partsData[index].checked = this.checked;
    if (partsData[index].selectionType === "freehand" || (partsData[index].meshNames && partsData[index].meshNames.length)) {
        if (this.checked) showSavedPartHighlight(partsData[index]);
        else removeSavedPartHighlight(partsData[index]);
    } else {
        updatePartHighlight();
    }
    saveModelJson();
});
function showSavedPartHighlight(part) {
    removeSavedPartHighlight(part);
    if (!part || !currentModel) return;
    if ((!part.highlightTriangles || !part.highlightTriangles.length) && (!part.meshNames || !part.meshNames.length)) return;
    var group = new THREE.Group();
    group.name = "SavedPart_" + part.id;
    group.userData.partId = part.id;
    currentModel.add(group);
    var meshData = {};
    if (part.meshNames && part.meshNames.length) {
        part.meshNames.forEach(function (meshName) {
            currentModel.traverse(function (child) {
                if (!child.isMesh || child.name !== meshName) return;
                var clone = child.clone();
                clone.material = new THREE.MeshBasicMaterial({
                    color: part.markupColor || "#ffff00",
                    transparent: true,
                    opacity: .35,
                    side: THREE.DoubleSide,
                    depthTest: true
                });
                clone.renderOrder = 10;
                group.add(clone);
            });
        });
    }
    if (part.highlightTriangles && part.highlightTriangles.length) {
        part.highlightTriangles.forEach(function (item) {
            var mesh = null;
            currentModel.traverse(function (child) {
                if (!mesh && child.isMesh && child.name === item.meshName) mesh = child;
            });
            if (!mesh) return;
            var triangle = getTriangleVertices(mesh, item.faceIndex);
            if (!triangle) return;
            if (!meshData[mesh.uuid]) {
                meshData[mesh.uuid] = {
                    mesh: mesh,
                    vertices: []
                };
            }
            meshData[mesh.uuid].vertices.push(
                triangle[0].x, triangle[0].y, triangle[0].z,
                triangle[1].x, triangle[1].y, triangle[1].z,
                triangle[2].x, triangle[2].y, triangle[2].z
            );
        });
    }
    Object.keys(meshData).forEach(function (key) {
        var data = meshData[key];
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.vertices, 3));
        geometry.computeVertexNormals();
        var material = new THREE.MeshBasicMaterial({
            color: part.markupColor || "#ffff00",
            transparent: true,
            opacity: .7,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        var highlight = new THREE.Mesh(geometry, material);
        highlight.renderOrder = 10;
        highlight.position.copy(data.mesh.position);
        highlight.rotation.copy(data.mesh.rotation);
        highlight.scale.copy(data.mesh.scale);
        group.add(highlight);
    });
    part.highlightGroup = group;
}
function removeSavedPartHighlight(part) {
    if (!part || !part.highlightGroup) return;
    part.highlightGroup.traverse(function (child) {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
    });
    if (part.highlightGroup.parent) part.highlightGroup.parent.remove(part.highlightGroup);
    part.highlightGroup = null;
}
$(document).on("click", "#addPartButton", function () {
    if (!currentModel) return;
    $("#newPartName").data("kendoTextBox").value("");
    $("#partsView").hide();
    $("#partEditView").hide();
    $("#propertyEditView").hide();
    $("#partCreateView").show();
    $("#partSourceType").data("kendoDropDownList").value("model");
    $("#partExistingFields").hide();
    $("#partModelFields").show();
    startPartPainting();
});
$(document).on("mousedown", "#viewer canvas", function (event) {
    if (!addingPart || !event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    controls.enabled = false;
    paintingPart = true;
    lastPaintX = event.clientX;
    lastPaintY = event.clientY;
    paintAtPosition(event.clientX, event.clientY);
});
$(document).on("mousemove", "#viewer canvas", function (event) {
    if (!addingPart || !paintingPart || !event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    paintBetweenPoints(lastPaintX, lastPaintY, event.clientX, event.clientY);
    lastPaintX = event.clientX;
    lastPaintY = event.clientY;
});
$(document).on("mouseup", "#viewer canvas", function (event) {
    if (!addingPart) return;
    if (paintingPart) {
        event.preventDefault();
        event.stopPropagation();
    }
    controls.enabled = true;
    paintingPart = false;
    lastPaintX = null;
    lastPaintY = null;
});
$(document).on("mouseleave", "#viewer canvas", function () {
    if (!addingPart) return;
    controls.enabled = true;
    paintingPart = false;
    lastPaintX = null;
    lastPaintY = null;
});
$(document).on("click", "#viewer canvas", function (event) {
    if (addingPart) return;
    if (editingPropertyIndex < 0) return;
    var positionType = $("#propertyPositionType").data("kendoDropDownList");
    if (!positionType || positionType.value() !== "click") return;
    if (!currentModel) return;
    var rect = renderer.domElement.getBoundingClientRect();
    var mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    var raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    var meshes = [];
    currentModel.traverse(function (child) {
        if (child.isMesh) meshes.push(child);
    });
    var intersections = raycaster.intersectObjects(meshes, true);
    if (!intersections.length) return;
    selectedClickPoint = intersections[0].point.clone();
    var item = assetLiveDataPoints[editingPropertyIndex];
    if (!item) return;
    item.position = {
        x: Number(selectedClickPoint.x.toFixed(3)),
        y: Number(selectedClickPoint.y.toFixed(3)),
        z: Number(selectedClickPoint.z.toFixed(3))
    };
    item.positionText = "Clicked";
    $("#propertyX").data("kendoNumericTextBox").value(selectedClickPoint.x);
    $("#propertyY").data("kendoNumericTextBox").value(selectedClickPoint.y);
    $("#propertyZ").data("kendoNumericTextBox").value(selectedClickPoint.z);
    if (annotations[editingPropertyIndex]) annotations[editingPropertyIndex].point.copy(selectedClickPoint);
    updateAnnotations();
});
$(document).on("click", ".property-edit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    editingPropertyIndex = parseInt($(this).attr("data-index"), 10);
    var item = assetLiveDataPoints[editingPropertyIndex];
    if (!item) return;
    selectedClickPoint = null;
    $("#propertiesView").hide();
    $("#partsView").hide();
    $("#partEditView").hide();
    $("#partCreateView").hide();
    $("#propertyEditView").show();
    var renameBox = $("#propertyRenameEdit").data("kendoTextBox");
    var positionType = $("#propertyPositionType").data("kendoDropDownList");
    var positionName = $("#propertyPositionName").data("kendoDropDownList");
    var xBox = $("#propertyX").data("kendoNumericTextBox");
    var yBox = $("#propertyY").data("kendoNumericTextBox");
    var zBox = $("#propertyZ").data("kendoNumericTextBox");
    renameBox.value(item.assetProperty || item.tag || "");
    positionType.value("name");
    positionName.value(item.positionText || "Center");
    if (item.position) {
        xBox.value(item.position.x);
        yBox.value(item.position.y);
        zBox.value(item.position.z);
    } else {
        xBox.value(null);
        yBox.value(null);
        zBox.value(null);
    }
    $("#propertyXYZFields").hide();
    $("#propertyNameField").show();
    $("#propertyClickMessage").hide();
});
$("#savePropertyEdit").on("click", function () {
    if (editingPropertyIndex < 0) return;
    var item = assetLiveDataPoints[editingPropertyIndex];
    if (!item) return;
    var renameBox = $("#propertyRenameEdit").data("kendoTextBox");
    var positionType = $("#propertyPositionType").data("kendoDropDownList");
    var positionName = $("#propertyPositionName").data("kendoDropDownList");
    var xBox = $("#propertyX").data("kendoNumericTextBox");
    var yBox = $("#propertyY").data("kendoNumericTextBox");
    var zBox = $("#propertyZ").data("kendoNumericTextBox");
    var name = renameBox.value();
    if (name) {
        item.assetProperty = name;
        item.tag = name;
    }
    var type = positionType.value();
    if (type === "click" && selectedClickPoint) {
        item.position = {
            x: Number(selectedClickPoint.x.toFixed(3)),
            y: Number(selectedClickPoint.y.toFixed(3)),
            z: Number(selectedClickPoint.z.toFixed(3))
        };
        item.positionText = "Clicked";
    } else if (type === "xyz") {
        var x = xBox.value();
        var y = yBox.value();
        var z = zBox.value();
        if (x !== null && y !== null && z !== null) {
            item.position = { x: x, y: y, z: z };
            item.positionText = "XYZ";
        }
    } else if (type === "name") {
        var selectedPosition = positionName.value();
        var point = getPositionPoint(selectedPosition);
        item.position = {
            x: Number(point.x.toFixed(3)),
            y: Number(point.y.toFixed(3)),
            z: Number(point.z.toFixed(3))
        };
        item.positionText = selectedPosition;
    }
    if (item.position) {
        createAnnotations(false);
    }
    updateAnnotations();
    saveModelJson();
    $("#propertyEditView").hide();
    $("#propertiesView").show();
    loadProperties();
    editingPropertyIndex = -1;
    selectedClickPoint = null;
});
$("#cancelPropertyEdit").on("click", function () {
    $("#propertyEditView").hide();
    $("#propertiesView").show();
    editingPropertyIndex = -1;
    selectedClickPoint = null;
});
$(document).on("click", "#saveNewPart", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var name = $("#newPartName").data("kendoTextBox").value();
    if (!name) return;
    var sourceType = $("#partSourceType").data("kendoDropDownList").value();
    var newPart;
    if (sourceType === "existing") {
        var checked = $(".existing-part-check:checked");
        if (!checked.length) return;
        var meshNames = [];
        var mergedTriangles = [];
        checked.each(function () {
            var index = parseInt($(this).attr("data-index"), 10);
            var part = partsData[index];
            if (!part) return;
            if (part.meshNames && part.meshNames.length) {
                meshNames = meshNames.concat(part.meshNames);
                return;
            }
            if (part.highlightTriangles && part.highlightTriangles.length) {
                mergedTriangles = mergedTriangles.concat(part.highlightTriangles);
                return;
            }
            var mesh = partsMeshes[index];
            if (mesh && mesh.name) {
                meshNames.push(mesh.name);
            }
        });
        meshNames = meshNames.filter(function (value, index, array) {
            return array.indexOf(value) === index;
        });
        if (!meshNames.length && !mergedTriangles.length) return;
        newPart = {
            id: partsData.length,
            text: name,
            checked: true,
            markupColor: "#ffff00",
            selectionType: "model",
            meshNames: meshNames
        };
        if (mergedTriangles.length) newPart.highlightTriangles = mergedTriangles;
    } else {
        var triangleKeys = Object.keys(selectedPartTriangles);
        if (!triangleKeys.length) return;
        var selectedTriangles = triangleKeys.map(function (key) {
            var item = selectedPartTriangles[key];
            return {
                meshName: item.mesh.name,
                faceIndex: item.faceIndex
            };
        });
        newPart = {
            id: partsData.length,
            text: name,
            checked: true,
            markupColor: "#ffff00",
            selectionType: "freehand",
            highlightTriangles: selectedTriangles
        };
    }
    stopPartPainting();
    partsData.push(newPart);
    if (partsList) {
        partsList.setDataSource(new kendo.data.DataSource({
            data: partsData
        }));
    }
    addingPart = false;
    paintingPart = false;
    selectedPartTriangles = {};
    removeNewPartHighlight();
    $("#partCreateView").hide();
    $("#partsView").show();
    showSavedPartHighlight(newPart);
    saveModelJson(function () {
        location.reload();
    });
});
$("#cancelNewPart").on("click", function () {
    stopPartPainting();
    addingPart = false;
    paintingPart = false;
    selectedPartTriangles = {};
    removeNewPartHighlight();
    $("#partCreateView").hide();
    $("#partsView").show();
});