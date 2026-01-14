# TASK-STAFF-005: Asset Returns Endpoint Fix

## Overview
Fix the asset returns API endpoint mismatch between frontend and backend in the staff offboarding workflow.

## Problem Statement
The frontend `useAssetReturns` hook calls `/staff/{staffId}/offboarding/assets`, but the backend endpoint expects `/staff/{staffId}/offboarding/{offboardingId}/assets`. This causes 404 errors when trying to display asset returns in the offboarding page.

## Technical Details

### Current Frontend Implementation
```typescript
// apps/web/src/hooks/use-staff-offboarding.ts
export function useAssetReturns(staffId: string, enabled = true) {
  return useQuery<AssetReturn[], AxiosError>({
    queryKey: offboardingKeys.assets(staffId),
    queryFn: async () => {
      const { data } = await apiClient.get<AssetReturn[]>(
        `/staff/${staffId}/offboarding/assets`  // ❌ Missing offboardingId
      );
      return data;
    },
    enabled: enabled && !!staffId,
  });
}
```

### Backend Endpoint
```typescript
// apps/api/src/api/staff/staff.controller.ts
@Get(':staffId/offboarding/:offboardingId/assets')
async getOffboardingAssets(
  @Param('staffId') staffId: string,
  @Param('offboardingId') offboardingId: string,
) {
  // Returns assets for the specific offboarding process
}
```

## Solution

### 1. Update useAssetReturns Hook
Add `offboardingId` parameter to the hook:
```typescript
export function useAssetReturns(staffId: string, offboardingId: string, enabled = true) {
  return useQuery<AssetReturn[], AxiosError>({
    queryKey: offboardingKeys.assets(staffId, offboardingId),
    queryFn: async () => {
      const { data } = await apiClient.get<AssetReturn[]>(
        `/staff/${staffId}/offboarding/${offboardingId}/assets`
      );
      return data;
    },
    enabled: enabled && !!staffId && !!offboardingId,
  });
}
```

### 2. Update Query Key Factory
```typescript
export const offboardingKeys = {
  // ...existing keys
  assets: (staffId: string, offboardingId?: string) =>
    [...offboardingKeys.all, 'assets', staffId, offboardingId] as const,
};
```

### 3. Update Component Usage
Pass `offboardingId` from `offboardingStatus.id` to the hook in the offboarding page/component.

## Acceptance Criteria
- [x] `useAssetReturns` hook accepts `offboardingId` parameter
- [x] Query key includes `offboardingId` for proper caching
- [x] API call uses correct endpoint path with offboardingId
- [x] `useUpdateAssetReturn` hook updated to accept `offboardingId`
- [x] `AssetReturns` component updated to pass `offboardingId` to hooks
- [x] Offboarding page passes `offboardingStatus.id` to AssetReturns
- [x] TypeScript compilation passes
- [ ] Asset returns display correctly in offboarding page (needs manual test)
- [ ] No 404 errors when fetching asset returns (needs manual test)

## Related Tasks
- TASK-STAFF-001: Staff Onboarding Workflow
- TASK-STAFF-002: Staff Offboarding Workflow

## Files to Modify
- `apps/web/src/hooks/use-staff-offboarding.ts`
- `apps/web/src/components/staff/StaffOffboardingPage.tsx` (or equivalent)
