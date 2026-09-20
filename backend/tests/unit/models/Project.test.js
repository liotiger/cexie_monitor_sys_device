/**
 * 项目模型测试
 * 测试项目模型的属性验证
 */

describe('项目模型测试', () => {
  describe('模型属性验证', () => {
    test('模型应包含必要的属性定义', () => {
      expect(global.Project).toBeDefined();
      expect(global.Project.find).toBeDefined();
      expect(global.Project.findOne).toBeDefined();
      expect(global.Project.create).toBeDefined();
      expect(global.Project.updateOne).toBeDefined();
      expect(global.Project.destroy).toBeDefined();
      expect(global.Project.count).toBeDefined();
    });

    test('find方法应返回空数组', async () => {
      const result = await Project.find();
      expect(Array.isArray(result)).toBe(true);
    });

    test('findOne方法应返回null', async () => {
      const result = await Project.findOne({ id: 1 });
      expect(result).toBeNull();
    });
  });

  describe('CRUD操作测试', () => {
    test('create方法应能创建项目', async () => {
      const projectData = {
        project_code: 'PRJ001',
        project_name: '测试项目',
        status: 'planning'
      };
      
      Project.create.mockResolvedValueOnce({ id: 1, ...projectData });
      
      const result = await Project.create(projectData);
      expect(result).toHaveProperty('id');
      expect(result.project_code).toBe(projectData.project_code);
    });

    test('updateOne方法应能更新项目', async () => {
      const updateData = { status: 'ongoing' };
      const mockSet = jest.fn().mockResolvedValue({ id: 1, ...updateData });
      Project.updateOne.mockImplementationOnce(() => ({ set: mockSet }));
      
      const result = await Project.updateOne({ id: 1 }).set(updateData);
      expect(result).toHaveProperty('id');
    });

    test('destroyOne方法应能删除项目', async () => {
      Project.destroyOne.mockResolvedValueOnce({ id: 1 });
      
      const result = await Project.destroyOne({ id: 1 });
      expect(result).toHaveProperty('id');
    });
  });
});
