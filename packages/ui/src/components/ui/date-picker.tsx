import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import dayjs from 'dayjs';
import { CalendarIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerProps {
  /** YYYY-MM-DD 형식 */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
  align?: 'start' | 'center' | 'end';
}

const SIZE_CLASS = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
} as const;

export function DatePicker({
  value,
  onChange,
  placeholder = '날짜 선택',
  disabled,
  className,
  id,
  size = 'md',
  align = 'start',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = value ? dayjs(value).toDate() : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start text-left font-normal',
            SIZE_CLASS[size],
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
          {value ? format(date!, 'PPP', { locale: ko }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(dayjs(d).format('YYYY-MM-DD'));
              setOpen(false);
            }
          }}
          initialFocus
        />
        <div className="flex justify-between items-center border-t p-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-sm"
            onClick={() => setOpen(false)}
          >
            취소
          </Button>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-sm"
              onClick={() => {
                onChange(dayjs().subtract(1, 'day').format('YYYY-MM-DD'));
                setOpen(false);
              }}
            >
              어제
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 text-sm"
              onClick={() => {
                onChange(dayjs().format('YYYY-MM-DD'));
                setOpen(false);
              }}
            >
              오늘
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
