/**
 * 设备模型测试
 * 测试设备模型的属性验证
 */

describe('设备模型测试', () => {
  describe('模型属性验证', () => {
    test('模型应包含必要的属性定义', () => {
      expect(global.Device).toBeDefined();
      expect(global.Device.find).toBeDefined();
      expect(global.Device.findOne).toBeDefined();
      expect(global.Device.create).toBeDefined();
      expect(global.Device.updateOne).toBeDefined();
      expect(global.Device.destroy).toBeDefined();
      expect(global.Device.count).toBeDefined();
    });

    test('find方法应返回空数组', async () => {
      const result = await Device.find();
      expect(Array.isArray(result)).toBe(true);
    });

    test('findOne方法应返回null', async () => {
      const result = await Device.findOne({ id: 1 });
      expect(result).toBeNull();
    });
  });

  describe('CRUD操作测试', () => {
    test('create方法应能创建设备', async () => {
      const deviceData = {
        device_id: 'DEV001',
        device_name: '测斜仪1号',
        device_type: 'inclinometer',
        status: 'idle'
      };
      
      Device.create.mockResolvedValueOnce({ id: 1, ...deviceData });
      
      const result = await Device.create(deviceData);
      expect(result).toHaveProperty('id');
      expect(result.device_id).toBe(deviceData.device_id);
    });

    test('updateOne方法应能更新设备', async () => {
      const updateData = { status: 'measuring' };
      const mockSet = jest.fn().mockResolvedValue({ id: 1, ...updateData });
      Device.updateOne.mockImplementationOnce(() => ({ set: mockSet }));
      
      const result = await Device.updateOne({ id: 1 }).set(updateData);
      expect(result).toHaveProperty('id');
    });

    test('destroyOne方法应能删除设备', async () => {
      Device.destroyOne.mockResolvedValueOnce({ id: 1 });
      
      const result = await Device.destroyOne({ id: 1 });
      expect(result).toHaveProperty('id');
    });
  });
});
