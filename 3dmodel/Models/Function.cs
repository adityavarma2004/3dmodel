using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;
namespace _3dmodel.Models
{
    public static class Functions
    {
        public static string ModelDbConnection
        {
            get
            {
                return ConfigurationManager.ConnectionStrings["ModelViewerDB"].ConnectionString;
            }
        }
        public static SqlParameter GetParm(string name, SqlDbType type, object value)
        {
            SqlParameter parameter = new SqlParameter(name, type);
            parameter.Value = value;
            return parameter;
        }
        public static bool UpdTable(string sql, List<SqlParameter> parameters)
        {
            SqlConnection con = new SqlConnection(ModelDbConnection);
            SqlCommand cmd = new SqlCommand(sql, con);
            foreach (SqlParameter parameter in parameters)
            {
                cmd.Parameters.Add(parameter);
            }
            con.Open();
            int result = cmd.ExecuteNonQuery();
            con.Close();
            return result > 0;
        }
        public static DataTable GetTable(string sql, List<SqlParameter> parameters)
        {
            SqlConnection con = new SqlConnection(ModelDbConnection);
            SqlCommand cmd = new SqlCommand(sql, con);
            foreach (SqlParameter parameter in parameters)
            {
                cmd.Parameters.Add(parameter);
            }
            SqlDataAdapter adapter = new SqlDataAdapter(cmd);
            DataTable table = new DataTable();
            adapter.Fill(table);
            return table;
        }
    }
}