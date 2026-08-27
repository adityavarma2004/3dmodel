UPDATE dbo.EquipmentComponents
SET Temperature = '95 °C'
WHERE Name = 'Rotor'
AND EquipmentTypeId = (SELECT EquipmentTypeId FROM dbo.EquipmentTypes WHERE EquipmentTypeName = 'Generator');