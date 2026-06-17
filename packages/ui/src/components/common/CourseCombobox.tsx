import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';

export interface CourseComboboxOption {
  id: string;
  name: string;
}

interface CourseComboboxProps {
  value: string;
  onChange: (value: string) => void;
  courses: CourseComboboxOption[];
  allValue?: string;
  allLabel?: string;
  placeholder?: string;
  className?: string;
}

export const CourseCombobox: React.FC<CourseComboboxProps> = ({
  value,
  onChange,
  courses,
  allValue = 'all',
  allLabel = '전체 강좌',
  placeholder = '강좌명으로 검색...',
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectedLabel =
    value === allValue ? allLabel : courses.find((c) => c.id === value)?.name ?? allLabel;

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Command>
          <CommandInput ref={inputRef} placeholder={placeholder} autoFocus className="px-2 focus-visible:!outline-none" />
          <CommandList>
            <CommandEmpty>강좌가 없습니다</CommandEmpty>
            <CommandGroup>
              <CommandItem value={allLabel} onSelect={() => select(allValue)}>
                <Check
                  className={cn('mr-2 h-4 w-4', value === allValue ? 'opacity-100' : 'opacity-0')}
                />
                {allLabel}
              </CommandItem>
              {courses.map((course) => (
                <CommandItem
                  key={course.id}
                  value={`${course.name}__${course.id}`}
                  onSelect={() => select(course.id)}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === course.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {course.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
