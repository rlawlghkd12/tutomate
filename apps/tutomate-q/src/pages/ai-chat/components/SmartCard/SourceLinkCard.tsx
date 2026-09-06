import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'sourceLink' }>;

export function SourceLinkCard({ kind, id, label }: Props) {
  return (
    <Link
      to={`/${kind}/${id}`}
      className="text-blue-600 underline text-base inline-flex items-center gap-0.5"
    >
      {label}
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}
