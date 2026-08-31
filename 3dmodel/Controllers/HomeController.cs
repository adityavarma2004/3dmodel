using Newtonsoft.Json;
using System.Collections.Generic;
using System.Configuration;
using System.Data.SqlClient;
using System.IO;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using _3dmodel.Models;
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
            using (SqlConnection con = new SqlConnection(ConfigurationManager.ConnectionStrings["ModelViewerDB"].ConnectionString))
            {
                string query = "IF EXISTS (SELECT 1 FROM ModelAnnotations WHERE ModelName=@ModelName) UPDATE ModelAnnotations SET AnnotationJson=@AnnotationJson WHERE ModelName=@ModelName ELSE INSERT INTO ModelAnnotations (ModelName, AnnotationJson) VALUES (@ModelName, @AnnotationJson)";
                using (SqlCommand cmd = new SqlCommand(query, con))
                {
                    cmd.Parameters.AddWithValue("@ModelName", modelName);
                    cmd.Parameters.AddWithValue("@AnnotationJson", annotationJson);
                    con.Open();
                    cmd.ExecuteNonQuery();
                }
            }
            return Json(new { success = true });
        }
        public JsonResult GetAnnotations()
        {
            string modelName = Session["FileName"] as string;
            string annotationJson = "";
            using (SqlConnection con = new SqlConnection(ConfigurationManager.ConnectionStrings["ModelViewerDB"].ConnectionString))
            {
                string query = "SELECT AnnotationJson FROM ModelAnnotations WHERE ModelName=@ModelName";
                using (SqlCommand cmd = new SqlCommand(query, con))
                {
                    cmd.Parameters.AddWithValue("@ModelName", modelName);
                    con.Open();
                    object result = cmd.ExecuteScalar();
                    if (result != null)
                    {
                        annotationJson = result.ToString();
                    }
                }
            }
            return Json(annotationJson, JsonRequestBehavior.AllowGet);
        }
        public JsonResult GetMotorData()
        {
            var random = new System.Random();
            return Json(new
            {
                Temperature = (70 + random.NextDouble() * 15).ToString("0.0") + " °C",
                Speed = (1400 + random.Next(101)) + " RPM",
                Power = (5 + random.NextDouble() * 2).ToString("0.0") + " kW",
                FlowRate = (110 + random.NextDouble() * 20).ToString("0.0") + " m³/h",
                Vibration = (1.5 + random.NextDouble() * 2).ToString("0.0") + " mm/s"
            }, JsonRequestBehavior.AllowGet);
        }
    }
}