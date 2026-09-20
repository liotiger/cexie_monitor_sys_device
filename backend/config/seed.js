const bcrypt = require('bcryptjs');

module.exports = {
  friendlyName: 'Seed initial data',
  description: 'Create initial business operator user if not exists',
  
  fn: async function() {
    try {
      const salt = await bcrypt.genSalt(10);
      const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);
      const adminExists = await User.findOne({ username: defaultUsername });
      
      if (adminExists) {
        await User.updateOne({ id: adminExists.id }).set({
          password_hash: hashedPassword
        });
        
        console.log('✅ Default operator password reset successfully');
        console.log(`   Username: ${defaultUsername}`);
        console.log(`   Password: ${defaultPassword}`);
      } else {
        await User.create({
          username: defaultUsername,
          email: defaultEmail,
          password_hash: hashedPassword,
          real_name: '业务服务管理员',
          phone: '',
          status: 'active'
        });
        
        console.log('✅ Default operator user created successfully');
        console.log(`   Username: ${defaultUsername}`);
        console.log(`   Password: ${defaultPassword}`);
      }
    } catch (err) {
      console.error('❌ Error seeding data:', err);
    }
  }
};
