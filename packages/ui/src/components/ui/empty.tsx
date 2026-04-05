import { InboxIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EmptyProps {
  description?: string;
  className?: string;
}

export function Empty({ description = '데이터가 없습니다', className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 text-muted-foreground', className)}>
      <InboxIcon className="h-10 w-10 mb-3 opacity-50" />
      <p className="text-sm">{description}</p>
    </div>
  );
}
