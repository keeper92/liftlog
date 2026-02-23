'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { registerSchema, type RegisterInput } from '@/lib/validation/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card-shadcn';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<RegisterInput>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof RegisterInput]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (generalError) setGeneralError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError('');

    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof RegisterInput, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof RegisterInput;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        setGeneralError(error.message);
        return;
      }

      router.push('/dashboard');
    } catch {
      setGeneralError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-lg">
      <CardHeader className="space-y-2 pb-5 text-center">
        <CardTitle className="text-3xl font-black tracking-tight font-[family-name:var(--font-heading)]">
          repsfit
        </CardTitle>
        <CardDescription>Create your account</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Email"
            type="email"
            name="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            name="password"
            placeholder="At least 8 characters"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            autoComplete="new-password"
          />

          {generalError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {generalError}
            </div>
          )}

          <Button type="submit" variant="primary" fullWidth loading={loading}>
            Create Account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
