const sails = require('sails');
const rc = require('rc');
const bcrypt = require('bcryptjs');

sails.lift(rc('sails'), async function(err) {
  if (err) {
    console.error('Failed to lift app:', err);
    return process.exit(1);
  }
  
  const serviceName = sails.config.custom?.serviceName || 'cexie-client-business-service';
    console.log(`${serviceName} lifted successfully!`);
    console.log(`Server running on http://localhost:${sails.config.port}`);
  
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
  } catch (seedErr) {
    console.error('❌ Error seeding data:', seedErr);
  }
});
