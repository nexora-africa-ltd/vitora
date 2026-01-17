// components/layout/mobile-nav.tsx
'use client';

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import {
  useState as useReactState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className="lg:hidden">
        <Button variant="ghost" size="icon">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <nav className="flex flex-col gap-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

type NavLinksProps = {
  onNavigate?: () => void;
};

function NavLinks({ onNavigate }: NavLinksProps) {
  const links = [
    { href: '/', label: 'Home' },
    { href: '/patients', label: 'Patients' },
    { href: '/encounters', label: 'Encounters' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={() => onNavigate?.()}
          className="text-sm font-medium text-foreground hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

function useState<T>(
  initialState: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  return useReactState(initialState);
}
