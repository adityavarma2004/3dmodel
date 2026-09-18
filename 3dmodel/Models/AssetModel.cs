using System;
using System.Data;
using System.Data.SqlClient;
using System.Collections.Generic;
using Newtonsoft.Json;
namespace _3dmodel.Models
{
    public class AssetModel
    {
        public string FileName { get; set; }
        public string FilePath { get; set; }
        public string FileUrl { get; set; }
        public string Extension { get; set; }
        public string Assets { get; set; }
        public AssetModel()
        {
        }
        public AssetModel(string name)
        {
            FileName = name;
        }
        public bool Create(string annotationJson, string sectionJson)
        {
            string sql = "insert into ModelAnnotations(ModelName, AnnotationJson, SectionJson) " +
            "values(@ModelName, @AnnotationJson, @SectionJson)";
            List<SqlParameter> parameters = new List<SqlParameter>();
            parameters.Add(Functions.GetParm("@ModelName", SqlDbType.NVarChar, FileName));
            parameters.Add(Functions.GetParm("@AnnotationJson", SqlDbType.NVarChar, annotationJson));
            parameters.Add(Functions.GetParm("@SectionJson", SqlDbType.NVarChar, sectionJson));
            return Functions.UpdTable(sql, parameters);
        }
        public bool Save(string annotationJson, string sectionJson)
        {
            string sql = "update ModelAnnotations set " +
            "AnnotationJson = @AnnotationJson, SectionJson = @SectionJson " +
            "where ModelName = @ModelName";
            List<SqlParameter> parameters = new List<SqlParameter>();
            parameters.Add(Functions.GetParm("@ModelName", SqlDbType.NVarChar, FileName));
            parameters.Add(Functions.GetParm("@AnnotationJson", SqlDbType.NVarChar, annotationJson));
            parameters.Add(Functions.GetParm("@SectionJson", SqlDbType.NVarChar, sectionJson));
            return Functions.UpdTable(sql, parameters);
        }
        public bool Exists()
        {
            string sql = "select count(1) as total from ModelAnnotations where ModelName = @ModelName";
            List<SqlParameter> parameters = new List<SqlParameter>();
            parameters.Add(Functions.GetParm("@ModelName", SqlDbType.NVarChar, FileName));
            DataTable table = Functions.GetTable(sql, parameters);
            if (table != null && table.Rows.Count > 0)
            {
                return Convert.ToInt32(table.Rows[0]["total"]) > 0;
            }
            return false;
        }
        public bool SaveAnnotations(string json)
        {
            var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(json);
            string annotationJson = JsonConvert.SerializeObject(new
            {
                annotations = data["annotations"]
            });
            string sectionJson = JsonConvert.SerializeObject(new
            {
                sections = data["sections"]
            });
            if (Exists())
            {
                return Save(annotationJson, sectionJson);
            }
            return Create(annotationJson, sectionJson);
        }
        public string Get()
        {
            string sql = "select AnnotationJson, SectionJson from ModelAnnotations where ModelName = @ModelName";
            List<SqlParameter> parameters = new List<SqlParameter>();
            parameters.Add(Functions.GetParm("@ModelName", SqlDbType.NVarChar, FileName));
            DataTable table = Functions.GetTable(sql, parameters);
            if (table != null && table.Rows.Count > 0)
            {
                string annotationJson = table.Rows[0]["AnnotationJson"].ToString();
                string sectionJson = table.Rows[0]["SectionJson"].ToString();
                var annotationData = JsonConvert.DeserializeObject<Dictionary<string, object>>(annotationJson);
                var sectionData = JsonConvert.DeserializeObject<Dictionary<string, object>>(sectionJson);
                var data = new Dictionary<string, object>();
                data["annotations"] = annotationData["annotations"];
                data["sections"] = sectionData["sections"];
                return JsonConvert.SerializeObject(data);
            }
            return "";
        }
        public bool SaveImage(string imageName)
        {
            string sql = "update ModelAnnotations set ImageName = @ImageName where ModelName = @ModelName";
            List<SqlParameter> parameters = new List<SqlParameter>();
            parameters.Add(Functions.GetParm("@ModelName", SqlDbType.NVarChar, FileName));
            parameters.Add(Functions.GetParm("@ImageName", SqlDbType.NVarChar, imageName));
            return Functions.UpdTable(sql, parameters);
        }
        public string GetImage()
        {
            string sql = "select ImageName from ModelAnnotations where ModelName = @ModelName";
            List<SqlParameter> parameters = new List<SqlParameter>();
            parameters.Add(Functions.GetParm("@ModelName", SqlDbType.NVarChar, FileName));
            DataTable table = Functions.GetTable(sql, parameters);
            if (table != null && table.Rows.Count > 0)
            {
                return table.Rows[0]["ImageName"].ToString();
            }
            return "";
        }
    }
}