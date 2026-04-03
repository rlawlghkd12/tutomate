import React, { useRef, useCallback } from 'react';
import { Input } from '../ui/input';

interface LicenseKeyInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  onPressEnter?: () => void;
  disabled?: boolean;
}

const LicenseKeyInput: React.FC<LicenseKeyInputProps> = ({ value, onChange, onPressEnter, disabled }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback((index: number, raw: string) => {
    const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
    const next = [...value];
    next[index] = cleaned;
    onChange(next);

    if (cleaned.length === 4 && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [value, onChange]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && value[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter' && onPressEnter) {
      onPressEnter();
    }
  }, [value, onPressEnter]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
    if (pasted.length > 4) {
      e.preventDefault();
      const next = [pasted.slice(0, 4), pasted.slice(4, 8), pasted.slice(8, 12), pasted.slice(12, 16)];
      onChange(next);
      const lastIndex = Math.min(Math.floor((pasted.length - 1) / 4), 3);
      inputRefs.current[lastIndex]?.focus();
    }
  }, [onChange]);

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-base text-muted-foreground">-</span>}
          <Input
            ref={(el) => { inputRefs.current[i] = el; }}
            value={value[i]}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            maxLength={4}
            disabled={disabled}
            className="w-[72px] text-center font-mono tracking-widest"
          />
        </React.Fragment>
      ))}
    </div>
  );
};

export default LicenseKeyInput;
