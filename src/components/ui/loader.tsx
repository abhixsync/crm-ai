"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type LoadingSpinnerProps = {
  className?: string;
};

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />;
}

type InlineLoaderProps = {
  label?: string;
  className?: string;
};

export function InlineLoader({ label = "Loading...", className }: InlineLoaderProps) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)} role="status" aria-live="polite">
      <LoadingSpinner className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}

type PageLoaderProps = {
  label?: string;
  className?: string;
};

export function PageLoader({ label = "Loading...", className }: PageLoaderProps) {
  return (
    <div className={cn("flex w-full items-center justify-center py-10", className)}>
      <InlineLoader label={label} />
    </div>
  );
}
