/**
 * Creates (or resets the password of) the first super admin.
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed:admin
 */
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import User from '../src/modules/users/user.model.js';

const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME || 'Super Admin';

if (!email || !password || password.length < 8) {
  console.error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 8 chars)');
  process.exit(1);
}

await connectDatabase();
const user = await User.findOne({ email }).select('+password');
if (user) {
  user.password = password;
  user.role = 'super_admin';
  user.status = 'active';
  await user.save();
  console.log(`Updated super admin ${email}`);
} else {
  await User.create({
    role: 'super_admin',
    fullName: name,
    displayName: name,
    email,
    password,
    status: 'active',
    emailVerifiedAt: new Date(),
    admin: { nickname: name, designation: 'Administrator' },
  });
  console.log(`Created super admin ${email}`);
}
await disconnectDatabase();
