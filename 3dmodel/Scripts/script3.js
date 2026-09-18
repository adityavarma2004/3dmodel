var is2DView = false;
var twoDCanvas = null;
var twoDContext = null;
var twoDImage = null;
var twoDLabelImage = null;
var twoDSegments = [];
var twoDWidth = 0;
var twoDHeight = 0;
var twoDSelectedSegment = 0;
var twoDSegmentOverlay = true;
var twoDImageInput = null;

$(document).ready(function () {
    create2DView();

    $("#modelViewToggle").on("click.script3", function () {
        is2DView = !is2DView;
        $("#viewerTitle").text(is2DView ? "2D Model Viewer" : "3D Model Viewer");
        $(this).find(".k-button-text").text(is2DView ? "3D" : "2D");

        if (is2DView)
            show2DView();
        else
            show3DView();
    });

    $(window).on("resize.script3", function () {
        if (is2DView)
            render2DView();
    });

    loadSaved2DImage();

    $(document).on("change.script3", ".part-check", function () {
        if (is2DView)
            render2DView();
    });
});

function create2DView() {
    if ($("#twoDView").length)
        return;

    $("#viewer").after(
        '<div id="twoDView" style="display:none;position:fixed;background:#20252d;overflow:hidden;z-index:20">' +
        '<canvas id="twoDCanvas" style="position:absolute;left:0;top:0;width:100%;height:100%;cursor:pointer"></canvas>' +
        '<div id="twoDToolbar" style="position:absolute;left:12px;top:12px;z-index:5;background:white;padding:8px;border-radius:5px;display:flex;gap:6px;align-items:center">' +
        '<button id="twoDUpload" type="button" class="k-button k-button-md k-button-solid k-button-solid-primary">Upload Image</button>' +
        '<button id="twoDSegment" type="button" class="k-button k-button-md k-button-solid k-button-solid-primary">Segment Image</button>' +
        '<button id="twoDOverlay" type="button" class="k-button k-button-md k-button-solid k-button-solid-base">Segments</button>' +
        '<input id="twoDInput" type="file" accept="image/*" style="display:none">' +
        '</div>' +
        '<div id="twoDPartsPanel" style="position:absolute;right:12px;top:12px;width:220px;max-height:calc(100% - 24px);overflow:auto;background:white;border-radius:5px;padding:10px;z-index:5;display:none">' +
        '<div style="font-weight:bold;margin-bottom:8px">Detected Parts</div>' +
        '<div id="twoDPartsList"></div>' +
        '</div>' +
        '<div id="twoDMessage" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.65);color:white;padding:12px 18px;border-radius:5px;display:none;z-index:10"></div>' +
        '</div>'
    );

    twoDCanvas = document.getElementById("twoDCanvas");
    twoDContext = twoDCanvas.getContext("2d", { willReadFrequently: true });
    twoDImageInput = document.getElementById("twoDInput");

    $("#twoDUpload").on("click.script3", function () {
        $("#twoDInput").trigger("click");
    });

    $("#twoDSegment").on("click.script3", function () {
        segment2DImage();
    });

    $("#twoDOverlay").on("click.script3", function () {
        twoDSegmentOverlay = !twoDSegmentOverlay;
        $(this).text(twoDSegmentOverlay ? "Segments" : "Image");
        render2DView();
    });

    twoDImageInput.addEventListener("change", function () {
        if (!this.files || !this.files.length)
            return;

        load2DImage(this.files[0]);
    });

    twoDCanvas.addEventListener("click", function (event) {
        select2DSegment(event);
    });
}

function position2DView() {
    var viewer = $("#viewer")[0];

    if (!viewer)
        return;

    var rect = viewer.getBoundingClientRect();

    $("#twoDView").css({
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px"
    });
}

function show2DView() {
    position2DView();
    $("#twoDView").show();

    if (!twoDImage) {
        show2DMessage("Upload a 2D image.");
        return;
    }

    hide2DMessage();
    render2DView();
}

function show3DView() {
    $("#twoDView").hide();
}

function show2DMessage(message) {
    $("#twoDMessage").text(message).show();
}

function hide2DMessage() {
    $("#twoDMessage").hide();
}

function load2DImage(file) {
    var reader = new FileReader();

    reader.onload = function (event) {
        var image = new Image();

        image.onload = function () {
            twoDImage = image;
            twoDLabelImage = null;
            twoDSegments = [];
            twoDSelectedSegment = 0;

            upload2DImage(file);
            render2DView();
            clear2DParts();
        };

        image.src = event.target.result;
    };

    reader.readAsDataURL(file);
}

function upload2DImage(file) {
    var formData = new FormData();

    formData.append("image", file);

    $.ajax({
        url: "/Home/UploadModelImage",
        type: "POST",
        data: formData,
        processData: false,
        contentType: false,
        success: function (response) {
            if (!response || !response.success) {
                show2DMessage(response && response.message ? response.message : "Image upload failed.");
            }
        },
        error: function () {
            show2DMessage("Image upload failed.");
        }
    });
}

function loadSaved2DImage() {
    $.ajax({
        url: "/Home/GetModelImage",
        type: "GET",
        success: function (fileName) {
            if (!fileName)
                return;

            var image = new Image();

            image.onload = function () {
                twoDImage = image;

                if (is2DView)
                    render2DView();
            };

            image.src = "/Uploads/Image/" + encodeURIComponent(fileName);
        }
    });

    $.ajax({
        url: "/Home/GetImageSegments",
        type: "GET",
        success: function (data) {
            if (!data)
                return;

            try {
                var result = JSON.parse(data);

                if (result && result.segments) {
                    twoDSegments = result.segments;
                    twoDWidth = result.width;
                    twoDHeight = result.height;

                    if (result.labelMap) {
                        var labelImage = new Image();

                        labelImage.onload = function () {
                            twoDLabelImage = labelImage;

                            if (is2DView) {
                                render2DView();
                                build2DPartsList();
                            }
                        };

                        labelImage.src = result.labelMap;
                    }
                }
            } catch (error) {
                console.error("Unable to load saved segments.", error);
            }
        }
    });
}

function render2DView() {
    if (!twoDImage || !twoDCanvas)
        return;

    position2DView();

    var width = Math.max(1, Math.floor($("#twoDView").width()));
    var height = Math.max(1, Math.floor($("#twoDView").height()));

    twoDCanvas.width = width;
    twoDCanvas.height = height;

    twoDContext.clearRect(0, 0, width, height);
    twoDContext.fillStyle = "#20252d";
    twoDContext.fillRect(0, 0, width, height);

    var scale = Math.min(
        width / twoDImage.width,
        height / twoDImage.height
    );

    var drawWidth = twoDImage.width * scale;
    var drawHeight = twoDImage.height * scale;

    var x = (width - drawWidth) / 2;
    var y = (height - drawHeight) / 2;

    twoDContext.drawImage(
        twoDImage,
        x,
        y,
        drawWidth,
        drawHeight
    );

    if (twoDLabelImage && twoDSegments.length) {
        drawSegmentOverlay(
            x,
            y,
            drawWidth,
            drawHeight
        );
    }

    if (twoDSelectedSegment)
        drawSelectedSegment(
            x,
            y,
            drawWidth,
            drawHeight
        );
}

function drawSegmentOverlay(x, y, width, height) {
    if (!twoDSegmentOverlay)
        return;

    var tempCanvas = document.createElement("canvas");
    tempCanvas.width = twoDWidth;
    tempCanvas.height = twoDHeight;

    var tempContext = tempCanvas.getContext("2d", {
        willReadFrequently: true
    });

    tempContext.drawImage(
        twoDLabelImage,
        0,
        0,
        twoDWidth,
        twoDHeight
    );

    var imageData = tempContext.getImageData(
        0,
        0,
        twoDWidth,
        twoDHeight
    );

    var output = document.createElement("canvas");
    output.width = twoDWidth;
    output.height = twoDHeight;

    var outputContext = output.getContext("2d");
    var outputData = outputContext.createImageData(
        twoDWidth,
        twoDHeight
    );

    var source = imageData.data;
    var target = outputData.data;

    for (var i = 0; i < source.length; i += 4) {
        target[i] = source[i];
        target[i + 1] = source[i + 1];
        target[i + 2] = source[i + 2];
        target[i + 3] = 70;
    }

    outputContext.putImageData(outputData, 0, 0);

    twoDContext.drawImage(
        output,
        x,
        y,
        width,
        height
    );
}

function drawSelectedSegment(x, y, width, height) {
    if (!twoDSelectedSegment || !twoDLabelImage)
        return;

    var tempCanvas = document.createElement("canvas");
    tempCanvas.width = twoDWidth;
    tempCanvas.height = twoDHeight;

    var tempContext = tempCanvas.getContext("2d", {
        willReadFrequently: true
    });

    tempContext.drawImage(
        twoDLabelImage,
        0,
        0,
        twoDWidth,
        twoDHeight
    );

    var imageData = tempContext.getImageData(
        0,
        0,
        twoDWidth,
        twoDHeight
    );

    var output = twoDContext.getImageData(
        0,
        0,
        twoDCanvas.width,
        twoDCanvas.height
    );

    var source = imageData.data;
    var target = output.data;

    var scaleX = width / twoDWidth;
    var scaleY = height / twoDHeight;

    for (var py = 0; py < twoDHeight; py++) {
        for (var px = 0; px < twoDWidth; px++) {
            var sourceIndex = (py * twoDWidth + px) * 4;

            var id =
                (source[sourceIndex] << 16) |
                (source[sourceIndex + 1] << 8) |
                source[sourceIndex + 2];

            if (id !== twoDSelectedSegment)
                continue;

            var screenX = Math.floor(x + px * scaleX);
            var screenY = Math.floor(y + py * scaleY);

            if (screenX < 0 ||
                screenY < 0 ||
                screenX >= twoDCanvas.width ||
                screenY >= twoDCanvas.height)
                continue;

            var targetIndex =
                (screenY * twoDCanvas.width + screenX) * 4;

            target[targetIndex] = 255;
            target[targetIndex + 1] = 180;
            target[targetIndex + 2] = 0;
            target[targetIndex + 3] = 190;
        }
    }

    twoDContext.putImageData(output, 0, 0);
}

function select2DSegment(event) {
    if (!twoDLabelImage || !twoDSegments.length)
        return;

    var rect = twoDCanvas.getBoundingClientRect();

    var canvasX = event.clientX - rect.left;
    var canvasY = event.clientY - rect.top;

    var scale = Math.min(
        twoDCanvas.width / twoDImage.width,
        twoDCanvas.height / twoDImage.height
    );

    var drawWidth = twoDImage.width * scale;
    var drawHeight = twoDImage.height * scale;

    var offsetX = (twoDCanvas.width - drawWidth) / 2;
    var offsetY = (twoDCanvas.height - drawHeight) / 2;

    if (
        canvasX < offsetX ||
        canvasY < offsetY ||
        canvasX > offsetX + drawWidth ||
        canvasY > offsetY + drawHeight
    )
        return;

    var imageX = Math.floor(
        (canvasX - offsetX) *
        twoDWidth /
        drawWidth
    );

    var imageY = Math.floor(
        (canvasY - offsetY) *
        twoDHeight /
        drawHeight
    );

    var tempCanvas = document.createElement("canvas");
    tempCanvas.width = twoDWidth;
    tempCanvas.height = twoDHeight;

    var tempContext = tempCanvas.getContext("2d", {
        willReadFrequently: true
    });

    tempContext.drawImage(
        twoDLabelImage,
        0,
        0,
        twoDWidth,
        twoDHeight
    );

    var pixel = tempContext.getImageData(
        imageX,
        imageY,
        1,
        1
    ).data;

    var id =
        (pixel[0] << 16) |
        (pixel[1] << 8) |
        pixel[2];

    if (!id)
        return;

    var segment = twoDSegments.find(function (item) {
        return item.Id === id || item.id === id;
    });

    if (!segment)
        return;

    twoDSelectedSegment = id;

    build2DPartsList();
    render2DView();
}

function build2DPartsList() {
    var container = $("#twoDPartsList");

    container.empty();

    if (!twoDSegments.length) {
        $("#twoDPartsPanel").hide();
        return;
    }

    $("#twoDPartsPanel").show();

    twoDSegments.forEach(function (segment) {
        var id = segment.Id || segment.id;
        var name = segment.Name || segment.name || ("Part " + id);

        var row = $(
            '<div class="twoD-part-row" style="padding:7px;margin-bottom:5px;border:1px solid #ddd;border-radius:4px;cursor:pointer"></div>'
        );

        var title = $(
            '<div style="font-weight:500"></div>'
        ).text(name);

        var count = $(
            '<div style="font-size:11px;color:#777;margin-top:2px"></div>'
        ).text((segment.PixelCount || segment.pixelCount || 0) + " pixels");

        row.append(title);
        row.append(count);

        row.attr("data-id", id);

        row.on("click", function () {
            twoDSelectedSegment = id;
            build2DPartsList();
            render2DView();
        });

        if (id === twoDSelectedSegment)
            row.css({
                background: "#e8f1ff",
                border: "1px solid #1677ff"
            });

        container.append(row);

        var renameButton = $(
            '<button type="button" class="k-button k-button-sm" style="margin-top:5px">Rename</button>'
        );

        renameButton.on("click", function (event) {
            event.stopPropagation();
            rename2DSegment(id);
        });

        row.append(renameButton);
    });
}

function rename2DSegment(id) {
    var segment = twoDSegments.find(function (item) {
        return (item.Id || item.id) === id;
    });

    if (!segment)
        return;

    var currentName =
        segment.Name ||
        segment.name ||
        ("Part " + id);

    var newName = window.prompt(
        "Enter name for this segment:",
        currentName
    );

    if (newName === null)
        return;

    newName = newName.trim();

    if (!newName)
        return;

    segment.Name = newName;
    segment.name = newName;

    save2DSegments();
    build2DPartsList();
    render2DView();
}

function save2DSegments() {
    $.ajax({
        url: "/Home/SaveImageSegments",
        type: "POST",
        data: {
            segments: JSON.stringify({
                width: twoDWidth,
                height: twoDHeight,
                segments: twoDSegments
            })
        },
        success: function (response) {
            if (!response || !response.success)
                console.error("Unable to save segment names.");
        },
        error: function () {
            console.error("Unable to save segment names.");
        }
    });
}

function segment2DImage() {
    if (!twoDImage) {
        show2DMessage("Upload an image first.");
        return;
    }

    $("#twoDSegment").prop("disabled", true).text("Segmenting...");

    $.ajax({
        url: "/Home/SegmentImage",
        type: "POST",
        success: function (response) {
            if (!response || !response.success) {
                show2DMessage(
                    response && response.message
                        ? response.message
                        : "Segmentation failed."
                );

                $("#twoDSegment")
                    .prop("disabled", false)
                    .text("Segment Image");

                return;
            }

            twoDWidth = response.width;
            twoDHeight = response.height;
            twoDSegments = response.segments || [];
            twoDSelectedSegment = 0;

            var labelImage = new Image();

            labelImage.onload = function () {
                twoDLabelImage = labelImage;

                $("#twoDSegment")
                    .prop("disabled", false)
                    .text("Segment Image");

                hide2DMessage();
                build2DPartsList();
                render2DView();
            };

            labelImage.src = response.labelMap;
        },
        error: function () {
            $("#twoDSegment")
                .prop("disabled", false)
                .text("Segment Image");

            show2DMessage("Segmentation request failed.");
        }
    });
}

function clear2DParts() {
    twoDSegments = [];
    twoDSelectedSegment = 0;
    twoDLabelImage = null;
    $("#twoDPartsList").empty();
    $("#twoDPartsPanel").hide();
}