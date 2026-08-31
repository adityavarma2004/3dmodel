using System.ComponentModel.DataAnnotations;

namespace _3dmodel.Models
{
    public class ModelAnnotation
    {
        [Key]
        public int Id { get; set; }
        public string ModelName { get; set; }
        public string AnnotationJson { get; set; }
    }
}