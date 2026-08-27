USE ModelViewerDB;
GO
UPDATE EC
SET Description = 'Updated high performance cooling fan',
    Type = 'Industrial Axial Fan',
    Category = 'Advanced Cooling',
    Temperature = '75 C'
FROM EquipmentComponents EC
INNER JOIN EquipmentTypes ET ON EC.EquipmentTypeId = ET.EquipmentTypeId
WHERE ET.EquipmentTypeName = 'Motor'
AND EC.Name = 'Cooling Fan';
GO
