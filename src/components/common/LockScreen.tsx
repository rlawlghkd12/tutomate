import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Typography, theme } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useLockStore } from '../../stores/lockStore';
import { useSettingsStore } from '../../stores/settingsStore';

const { Text, Title } = Typography;

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const LockScreen: React.FC = () => {
  const { token } = theme.useToken();
  const unlock = useLockStore((s) => s.unlock);
  const organizationName = useSettingsStore((s) => s.organizationName);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<any>(null);

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: token.colorBgContainer,
        userSelect: 'none',
      }}
    >
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
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          animation: shake ? 'shake 0.5s ease-in-out' : undefined,
        }}
      >
        <LockOutlined style={{ fontSize: 48, color: token.colorTextSecondary }} />
        <Title level={4} style={{ margin: 0 }}>
          {organizationName}
        </Title>
        <Text type="secondary">PIN을 입력하여 잠금을 해제하세요</Text>

        <Input.Password
          ref={inputRef}
          value={pin}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            if (val.length <= 6) setPin(val);
          }}
          onKeyDown={handleKeyDown}
          placeholder="PIN 입력"
          maxLength={6}
          disabled={lockoutRemaining > 0}
          style={{ width: 200, textAlign: 'center', fontSize: 20, letterSpacing: 8 }}
          autoFocus
        />

        {error && (
          <Text type="danger" style={{ fontSize: '0.9em' }}>
            {lockoutRemaining > 0
              ? `${MAX_ATTEMPTS}회 실패. ${lockoutRemaining}초 후 다시 시도하세요.`
              : error}
          </Text>
        )}

        <Button
          type="primary"
          onClick={handleUnlock}
          loading={loading}
          disabled={pin.length < 4 || lockoutRemaining > 0}
          style={{ width: 200 }}
        >
          잠금 해제
        </Button>
      </div>
    </div>
  );
};

export default LockScreen;
