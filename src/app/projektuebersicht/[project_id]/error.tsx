"use client";

import { PageError } from "@/components/PageError";

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError retry={retry} />;
}
