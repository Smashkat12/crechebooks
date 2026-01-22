import * as React from 'react';
import Image from 'next/image';
import { Linkedin, User } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TeamMemberCardProps {
  name: string;
  role: string;
  bio?: string;
  imageUrl?: string;
  linkedin?: string;
  className?: string;
}

export function TeamMemberCard({
  name,
  role,
  bio,
  imageUrl,
  linkedin,
  className,
}: TeamMemberCardProps) {
  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all hover:shadow-lg',
        className
      )}
    >
      <CardContent className="p-6 text-center">
        {/* Profile Image */}
        <div className="mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`${name}'s profile photo`}
              width={96}
              height={96}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <User className="h-12 w-12" />
            </div>
          )}
        </div>

        {/* Name and Role */}
        <h3 className="text-lg font-semibold text-foreground">{name}</h3>
        <p className="mt-1 text-sm font-medium text-primary">{role}</p>

        {/* Bio */}
        {bio && (
          <p className="mt-3 text-sm text-muted-foreground line-clamp-3">
            {bio}
          </p>
        )}

        {/* LinkedIn Link */}
        {linkedin && (
          <div className="mt-4">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary"
            >
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name}'s LinkedIn profile`}
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
