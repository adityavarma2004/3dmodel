using _3dmodel.Models;
using Newtonsoft.Json;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Web;
using System.Web.Mvc;
namespace _3dmodel.Controllers
{
    public class HomeController : Controller
    {
        public ActionResult Index()
        {
            AssetModel model = new AssetModel();
            model.FileUrl = Session["ModelUrl"] as string;
            model.Extension = Session["FileType"] as string;
            model.FileName = Session["FileName"] as string;
            model.Assets = Session["Assets"] as string;
            return View(model);
        }
        [HttpPost]
        public ActionResult Upload(AssetModel model)
        {
            string modelPath = Server.MapPath("~/Uploads/Model/");
            if (Directory.Exists(modelPath))
            {
                Directory.Delete(modelPath, true);
            }
            Directory.CreateDirectory(modelPath);
            string[] extensions = { ".obj", ".gltf", ".glb", ".fbx", ".stl", ".ply", ".dae" };
            var files = new List<string>();
            var allFiles = new List<string>();
            var filePaths = Request.Form.GetValues("filePaths");
            for (int i = 0; i < Request.Files.Count; i++)
            {
                HttpPostedFileBase file = Request.Files[i];
                if (file == null || file.ContentLength == 0)
                {
                    continue;
                }
                string relativePath = file.FileName;
                if (filePaths != null && i < filePaths.Length)
                {
                    relativePath = filePaths[i];
                }
                relativePath = relativePath.Replace("/", "\\");
                int firstSlash = relativePath.IndexOf('\\');
                if (firstSlash >= 0)
                {
                    relativePath = relativePath.Substring(firstSlash + 1);
                }
                relativePath = relativePath.TrimStart('\\');
                string filePath = Path.Combine(modelPath, relativePath);
                string directoryPath = Path.GetDirectoryName(filePath);
                if (!Directory.Exists(directoryPath))
                {
                    Directory.CreateDirectory(directoryPath);
                }
                file.SaveAs(filePath);
                allFiles.Add(filePath);
                if (extensions.Contains(Path.GetExtension(file.FileName).ToLower()))
                {
                    files.Add(filePath);
                }
            }
            string[] modelOrder = { ".gltf", ".glb", ".obj", ".fbx", ".dae", ".ply", ".stl" };
            string modelFile = null;
            foreach (string extension in modelOrder)
            {
                modelFile = files.FirstOrDefault(file => Path.GetExtension(file).ToLower() == extension);
                if (modelFile != null)
                {
                    break;
                }
            }
            model.FileName = Path.GetFileName(modelFile);
            model.FilePath = modelFile;
            model.Extension = Path.GetExtension(modelFile).ToLower();
            model.FileUrl = "/" + modelFile.Substring(Server.MapPath("~/").Length).Replace("\\", "/");
            model.Assets = JsonConvert.SerializeObject(allFiles.Select(file => "/" + file.Substring(Server.MapPath("~/").Length).Replace("\\", "/")));
            Session["ModelUrl"] = model.FileUrl;
            Session["FileType"] = model.Extension;
            Session["FileName"] = model.FileName;
            Session["Assets"] = model.Assets;
            return Json(new
            {
                success = true
            });
        }
        [HttpPost]
        public JsonResult SaveAnnotations(string annotationJson)
        {
            string modelName = Session["FileName"] as string;
            AssetModel model = new AssetModel(modelName);
            bool success = model.SaveAnnotations(annotationJson);
            return Json(new { success = success });
        }
        public JsonResult GetAnnotations()
        {
            string modelName = Session["FileName"] as string;
            AssetModel model = new AssetModel(modelName);
            string annotationJson = model.Get();
            return Json(annotationJson, JsonRequestBehavior.AllowGet);
        }
        [HttpPost]
        public JsonResult UploadModelImage(HttpPostedFileBase image)
        {
            if (image == null || image.ContentLength == 0)
            {
                return Json(new { success = false });
            }
            string imagePath = Server.MapPath("~/Uploads/Image/");
            if (!Directory.Exists(imagePath))
            {
                Directory.CreateDirectory(imagePath);
            }
            string fileName = Path.GetFileName(image.FileName);
            string filePath = Path.Combine(imagePath, fileName);
            image.SaveAs(filePath);
            string modelName = Session["FileName"] as string;
            AssetModel model = new AssetModel(modelName);
            bool success = model.SaveImage(fileName);
            return Json(new
            {
                success = success,
                imageName = fileName
            });
        }
        [HttpPost]
        public JsonResult SaveModelImage(string imageName)
        {
            string modelName = Session["FileName"] as string;
            AssetModel model = new AssetModel(modelName);
            bool success = model.SaveImage(imageName);
            return Json(new { success = success });
        }
        public JsonResult GetModelImage()
        {
            string modelName = Session["FileName"] as string;
            AssetModel model = new AssetModel(modelName);
            string imageName = model.GetImage();
            return Json(imageName, JsonRequestBehavior.AllowGet);
        }
        [HttpPost]
        public JsonResult UploadModelImage(HttpPostedFileBase image)
        {
            try
            {
                if (image == null || image.ContentLength == 0)
                    return Json(new { success = false, message = "No image selected." });

                string folder = Server.MapPath("~/Uploads/Image/");

                if (!Directory.Exists(folder))
                    Directory.CreateDirectory(folder);

                foreach (string file in Directory.GetFiles(folder))
                    System.IO.File.Delete(file);

                string extension = Path.GetExtension(image.FileName);

                string fileName = Guid.NewGuid().ToString("N") + extension;

                image.SaveAs(Path.Combine(folder, fileName));

                Session["ModelImage"] = fileName;

                return Json(new
                {
                    success = true,
                    fileName = fileName
                });
            }
            catch (Exception ex)
            {
                return Json(new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }

        [HttpGet]
        public JsonResult GetModelImage()
        {
            return Json(
                Session["ModelImage"] as string,
                JsonRequestBehavior.AllowGet);
        }

        [HttpPost]
        public JsonResult SegmentImage()
        {
            try
            {
                string fileName = Session["ModelImage"] as string;

                if (string.IsNullOrWhiteSpace(fileName))
                    return Json(new { success = false, message = "No 2D image uploaded." });

                string path = Path.Combine(
                    Server.MapPath("~/Uploads/Image/"),
                    fileName);

                if (!System.IO.File.Exists(path))
                    return Json(new { success = false, message = "Image file not found." });

                ImageSegmentationResult result =
                    ImageSegmentation.Process(path, 1200, 18f, 250);

                Session["ImageSegments"] = JsonConvert.SerializeObject(result);

                return Json(new
                {
                    success = true,
                    width = result.Width,
                    height = result.Height,
                    labelMap = result.LabelMap,
                    preview = result.Preview,
                    segments = result.Segments
                });
            }
            catch (Exception ex)
            {
                return Json(new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }

        [HttpPost]
        public JsonResult SaveImageSegments(string segments)
        {
            try
            {
                Session["ImageSegments"] = segments;

                return Json(new
                {
                    success = true
                });
            }
            catch (Exception ex)
            {
                return Json(new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }

        [HttpGet]
        public JsonResult GetImageSegments()
        {
            try
            {
                string data = Session["ImageSegments"] as string;

                return Json(
                    data,
                    JsonRequestBehavior.AllowGet);
            }
            catch (Exception ex)
            {
                return Json(new
                {
                    success = false,
                    message = ex.Message
                }, JsonRequestBehavior.AllowGet);
            }
        }
        public JsonResult GetMotorData()
        {
            var random = new System.Random();
            return Json(new
            {
                Temperature = (70 + random.NextDouble() * 15).ToString("0.0") + " °C",
                Speed = (1400 + random.Next(101)) + " RPM",
                Power = (5 + random.NextDouble() * 3).ToString("0.0") + " kW",
                FlowRate = (20 + random.NextDouble() * 10).ToString("0.0") + " L/min",
                Vibration = (1 + random.NextDouble() * 2).ToString("0.0") + " mm/s"
            }, JsonRequestBehavior.AllowGet);
        }
    }
}