<task_spec id="TASK-FIX-002" version="2.0">

<metadata>
  <title>Profile Update Implementation</title>
  <status>ready</status>
  <layer>presentation</layer>
  <sequence>302</sequence>
  <implements>
    <requirement_ref>REQ-USER-PROFILE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-AUTH-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>2 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/settings/page.tsx` (implement onSubmit)
  - `apps/web/src/lib/api/endpoints.ts` (add profile endpoint if missing)
  - `apps/web/src/hooks/use-auth.ts` (add updateProfile mutation if missing)

  **Files to Create:**
  - `apps/web/src/hooks/use-profile.ts` (NEW - profile update hook)

  **Current Problem:**
  The settings page has an empty `onSubmit` handler:
  ```typescript
  const onSubmit = async (data: ProfileFormData) => {
    // TODO: Implement profile update API call
  };
  ```

  **Existing Infrastructure:**
  - Form is already built with react-hook-form and zod validation
  - `useAuth` hook provides current user data
  - `useToast` hook available for notifications
  - TanStack Query already configured for mutations
  - API client at `apps/web/src/lib/api/client.ts`

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Profile Update Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-profile.ts
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, queryKeys } from '@/lib/api';

  interface UpdateProfileParams {
    name: string;
    email: string;
  }

  interface UpdateProfileResponse {
    success: boolean;
    data: {
      id: string;
      name: string;
      email: string;
    };
  }

  export function useUpdateProfile() {
    const queryClient = useQueryClient();

    return useMutation<UpdateProfileResponse, AxiosError, UpdateProfileParams>({
      mutationFn: async (params) => {
        const { data } = await apiClient.patch<UpdateProfileResponse>(
          '/auth/me',
          params,
        );
        return data;
      },
      onSuccess: (data) => {
        // Invalidate auth queries to refresh user data
        queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
        // Update the cached user data directly for immediate UI update
        queryClient.setQueryData(queryKeys.auth.me, (old: any) => ({
          ...old,
          data: data.data,
        }));
      },
    });
  }
  ```

  ### 3. Settings Page Implementation
  ```typescript
  'use client';

  import Link from 'next/link';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Label } from '@/components/ui/label';
  import { useAuth } from '@/hooks/use-auth';
  import { useUpdateProfile } from '@/hooks/use-profile';
  import { useToast } from '@/hooks/use-toast';
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { z } from 'zod';
  import { Users, ChevronRight } from 'lucide-react';

  const profileSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
  });

  type ProfileFormData = z.infer<typeof profileSchema>;

  export default function ProfileSettingsPage() {
    const { user } = useAuth();
    const updateProfile = useUpdateProfile();
    const { toast } = useToast();

    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = useForm<ProfileFormData>({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        name: user?.name ?? '',
        email: user?.email ?? '',
      },
    });

    const onSubmit = async (data: ProfileFormData) => {
      try {
        await updateProfile.mutateAsync(data);
        toast({
          title: 'Profile updated',
          description: 'Your profile has been updated successfully.',
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to update profile. Please try again.';
        toast({
          title: 'Update failed',
          description: message,
          variant: 'destructive',
        });
      }
    };

    // Check if user is OWNER or ADMIN
    const canManageUsers = user?.role === 'OWNER' || user?.role === 'ADMIN';

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isSubmitting || updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {canManageUsers && (
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage users and invitations for your tenant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/settings/users">
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Users
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  ```

  ### 4. API Endpoint Pattern (if backend update needed)
  ```typescript
  // apps/api/src/api/auth/auth.controller.ts
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<{ success: boolean; data: UserResponseDto }> {
    const user = await this.userService.updateUser(req.user.id, updateProfileDto);
    return {
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }
  ```

  ### 5. Query Keys (if not already defined)
  ```typescript
  // apps/web/src/lib/api/query-keys.ts
  export const queryKeys = {
    auth: {
      me: ['auth', 'me'] as const,
    },
    // ... other keys
  };
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements the profile update functionality for the settings page.

**User Experience Requirements:**
1. User can update their name and email
2. Form shows loading state during submission
3. Success toast shown on successful update
4. Error toast shown if update fails
5. UI immediately reflects updated data

**Validation:**
- Name: minimum 2 characters
- Email: valid email format
</context>

<scope>
  <in_scope>
    - Create useUpdateProfile hook with TanStack Query mutation
    - Implement onSubmit handler in settings page
    - Add success/error toast notifications
    - Update cached user data on success
    - Handle loading states properly
  </in_scope>
  <out_of_scope>
    - Profile picture upload
    - Password change functionality
    - Email verification workflow
    - Two-factor authentication settings
    - Notification preferences
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create profile update hook
# Create apps/web/src/hooks/use-profile.ts

# 2. Update settings page
# Edit apps/web/src/app/(dashboard)/settings/page.tsx

# 3. Add query key if missing
# Edit apps/web/src/lib/api/query-keys.ts

# 4. Verify API endpoint exists (check backend)
# Check apps/api/src/api/auth/auth.controller.ts

# 5. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Form validation must match backend validation
    - Loading state must be shown during API call
    - Cache must be updated immediately on success
    - Error messages must be user-friendly
    - Button must be disabled while submitting
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Manual: Can update profile name
    - Manual: Can update profile email
    - Manual: Success toast appears on save
    - Manual: Error toast appears on failure
    - Manual: Loading spinner shown during save
    - Manual: User data refreshes after save
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Allow form submission while loading
  - Show technical error messages to users
  - Skip cache invalidation after mutation
  - Use synchronous form submission
  - Forget to handle network errors
</anti_patterns>

</task_spec>
