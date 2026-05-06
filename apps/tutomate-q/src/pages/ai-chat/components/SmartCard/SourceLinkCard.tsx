import { Link } from 'react-router-dom';
import type { SmartCard } from '@tutomate/core';

type Props = Extract<SmartCard, { type: 'sourceLink' }>;

export function SourceLinkCard({ kind, id, label }: Props) {
  return (
    <Link
      to={`/${kind}/${id}`}
      className="text-blue-600 underline text-base"
    >
      {label} →
    </Link>
  );
}
