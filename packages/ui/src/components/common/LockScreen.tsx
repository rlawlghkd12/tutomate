import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useLockStore, useAuthStore } from '@tutomate/core';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const LockScreen: React.FC = () => {
  const unlock = useLockStore((s) => s.unlock);
  const organizationName = useAuthStore((s) => s.organizationName);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleUnlock = useCallback(async () => {
    if (!pin || loading || lockoutRemaining > 0) return;

    setLoading(true);
    try {
      const success = await unlock(pin);
      if (success) {
        setPin('');
        setError('');
        setAttempts(0);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        setShake(true);
        setTimeout(() => setShake(false), 500);

        if (newAttempts >= MAX_ATTEMPTS) {
          setLockoutRemaining(LOCKOUT_SECONDS);
          setError(`${MAX_ATTEMPTS}회 실패. ${LOCKOUT_SECONDS}초 후 다시 시도하세요.`);
          setAttempts(0);
        } else {
          setError(`PIN이 올바르지 않습니다. (${newAttempts}/${MAX_ATTEMPTS})`);
        }

        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } finally {
      setLoading(false);
    }
  }, [pin, loading, lockoutRemaining, unlock, attempts]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex select-none flex-col items-center justify-center bg-background">
      <style>
        {`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-10px); }
            40% { transform: translateX(10px); }
            60% { transform: translateX(-10px); }
            80% { transform: translateX(10px); }
          }
        `}
      </style>
      <div
        className="flex flex-col items-center gap-6"
        style={{ animation: shake ? 'shake 0.5s ease-in-out' : undefined }}
      >
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h4 className="m-0 text-lg font-semibold">
          {organizationName}
        </h4>
        <p className="text-sm text-muted-foreground">PIN을 입력하여 잠금을 해제하세요</p>

        <Input
          ref={inputRef}
          type="password"
          value={pin}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            if (val.length <= 6) setPin(val);
          }}
          onKeyDown={handleKeyDown}
          placeholder="PIN 입력"
          maxLength={6}
          disabled={lockoutRemaining > 0}
          className={cn(
            'w-[200px] text-center text-xl tracking-[8px]',
          )}
          autoFocus
        />

        {error && (
          <p className="text-sm text-destructive">
            {lockoutRemaining > 0
              ? `${MAX_ATTEMPTS}회 실패. ${lockoutRemaining}초 후 다시 시도하세요.`
              : error}
          </p>
        )}

        <Button
          onClick={handleUnlock}
          disabled={pin.length < 4 || lockoutRemaining > 0 || loading}
          className="w-[200px]"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          잠금 해제
        </Button>
      </div>
    </div>
  );
};

export default LockScreen;
