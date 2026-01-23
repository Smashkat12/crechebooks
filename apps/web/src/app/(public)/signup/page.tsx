import * as React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { SignupForm } from '@/components/public/signup-form';

export const metadata: Metadata = {
  title: 'Sign Up - CrecheBooks',
  description: 'Create your CrecheBooks account and start your 14-day free trial',
};

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Start Your Free Trial
          </h1>
          <p className="text-lg text-muted-foreground">
            Join hundreds of creches managing their operations with CrecheBooks
          </p>
        </div>

        {/* Signup Form */}
        <SignupForm />

        {/* Footer */}
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>

          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <Link
              href="/about"
              className="hover:text-foreground transition-colors"
            >
              About
            </Link>
            <Link
              href="/features"
              className="hover:text-foreground transition-colors"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="hover:text-foreground transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
