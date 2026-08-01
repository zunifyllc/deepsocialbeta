import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  const email = 'testuser_xclone@example.com';
  const password = 'TestPassword123!';
  
  const { data: existing } = await supabase.auth.admin.listUsers();
  const user = existing.users.find((u: any) => u.email === email);
  if (user) {
    await supabase.auth.admin.deleteUser(user.id);
    console.log('Deleted existing user');
  }
  
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: 'testuser_xclone' },
  });
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log('Created user:', data.user.id);
  console.log('Email:', email);
  console.log('Password:', password);
}

main();
