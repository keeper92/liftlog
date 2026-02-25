import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEMO_EMAIL = 'demo@reps.app';
const DEMO_PASSWORD = 'demo123456';

interface AuthUserLite {
  id: string;
  email?: string | null;
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<AuthUserLite | null> {
  const target = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || 'Failed to list users');
    }

    const users = (data?.users || []) as AuthUserLite[];
    const match = users.find((u) => (u.email || '').toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) break;
  }

  return null;
}

async function getOrCreateDemoUserId(supabase: SupabaseClient): Promise<string> {
  const existingDemo = await findUserByEmail(supabase, DEMO_EMAIL);
  if (existingDemo) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(existingDemo.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (updateError) {
      throw new Error(updateError.message || 'Failed to update existing demo user');
    }
    return existingDemo.id;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });

    if (!createError && newUser.user) {
      return newUser.user.id;
    }

    const message = (createError?.message || '').toLowerCase();
    const duplicateUser =
      message.includes('already registered') ||
      message.includes('already exists') ||
      message.includes('duplicate');

    if (!duplicateUser || attempt > 0) {
      throw new Error(createError?.message || 'Failed to create demo user');
    }

    const duplicateDemo = await findUserByEmail(supabase, DEMO_EMAIL);
    if (duplicateDemo) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(duplicateDemo.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (updateError) {
        throw new Error(updateError.message || 'Failed to update duplicate demo user');
      }
      return duplicateDemo.id;
    }

    throw new Error(createError?.message || 'Failed to create demo user');
  }

  throw new Error('Failed to create demo user');
}

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userId = await getOrCreateDemoUserId(supabase);

    // Set demo user to imperial units
    await supabase
      .from('profiles')
      .update({ unit_system: 'imperial' })
      .eq('id', userId);

    return NextResponse.json({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create demo user', detail },
      { status: 500 },
    );
  }
}
