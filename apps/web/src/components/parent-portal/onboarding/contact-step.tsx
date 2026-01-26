import {
  ArrowRight,
  Loader2,
  Phone,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProfileFormData } from '@/hooks/parent-portal/use-parent-onboarding';

interface ContactStepProps {
  profileData: ProfileFormData;
  onProfileChange: (data: ProfileFormData) => void;
  onSave: () => void;
  isSaving: boolean;
}

export function ContactStep({ profileData, onProfileChange, onSave, isSaving }: ContactStepProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>
              Provide your contact details for communication
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g., 082 123 4567"
              value={profileData.phone}
              onChange={(e) =>
                onProfileChange({ ...profileData, phone: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp Number (Optional)</Label>
            <Input
              id="whatsapp"
              type="tel"
              placeholder="e.g., 082 123 4567"
              value={profileData.whatsapp}
              onChange={(e) =>
                onProfileChange({ ...profileData, whatsapp: e.target.value })
              }
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Label>Physical Address *</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street" className="text-sm text-muted-foreground">
                Street Address
              </Label>
              <Input
                id="street"
                placeholder="e.g., 123 Main Road"
                value={profileData.address.street}
                onChange={(e) =>
                  onProfileChange({
                    ...profileData,
                    address: { ...profileData.address, street: e.target.value },
                  })
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm text-muted-foreground">
                  City
                </Label>
                <Input
                  id="city"
                  placeholder="e.g., Johannesburg"
                  value={profileData.address.city}
                  onChange={(e) =>
                    onProfileChange({
                      ...profileData,
                      address: { ...profileData.address, city: e.target.value },
                    })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode" className="text-sm text-muted-foreground">
                  Postal Code
                </Label>
                <Input
                  id="postalCode"
                  placeholder="e.g., 2000"
                  value={profileData.address.postalCode}
                  onChange={(e) =>
                    onProfileChange({
                      ...profileData,
                      address: { ...profileData.address, postalCode: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
