$(document).ready(function () {
    $("#filess").kendoUpload({
        directory: true,
        multiple: true,
        showFileList: false,
        localization: {
            select: "Choose Folder"
        },
        select: function (e) {
            if (e.files.length > 0) {
                $("#fileName").text(e.files.length + " Files Selected");

                for (var i = 0; i < e.files.length; i++) {
                    console.log("File Name: " + e.files[i].name);
                    console.log("Relative Path: " + e.files[i].rawFile.webkitRelativePath);
                }
            }
        }
    });
    var fileType = $("#viewer").attr("file-type") || "-";
    $("#infoFileType").text(fileType);
    $("#upload").click(function () {
        var upload = $("#filess").data("kendoUpload");
        var files = upload.getFiles();
        if (files.length === 0) {
            alert("Please select a folder first.");
            return;
        }
        var formData = new FormData();
        for (var i = 0; i < files.length; i++) {
            var file = files[i].rawFile;
            var relativePath = file.webkitRelativePath;

            console.log("Uploading File: " + file.name);
            console.log("Uploading Relative Path: " + relativePath);

            formData.append("files", file);
            formData.append("filePaths", relativePath);
        }

        $.ajax({
            url: "/Home/Upload",
            type: "POST",
            data: formData,
            processData: false,
            contentType: false,

            success: function (result) {
                if (result.success) {
                    alert("Upload successful.");
                    window.location.href = "/Home/Index";
                } else {
                    alert(result.message);
                }
            },

            error: function (xhr) {
                console.log("Upload Error: " + xhr.status);
                console.log(xhr.responseText);
                alert("Upload failed. Please try again.");
            }
        });
    });
});