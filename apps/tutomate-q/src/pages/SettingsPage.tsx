import React, { useEffect, useState } from 'react';
import {
  Card,
  Space,
  Typography,
  Switch,
  Radio,
  Divider,
  Button,
  Input,
  message,
  Modal,
  Progress,
  Tag,
  Select,
} from 'antd';
import {
  SaveOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CopyOutlined,
  LockOutlined,
} from '@ant-design/icons';
import {
  isElectron,
  useSettingsStore,
  useLockStore,
  useLicenseStore,
  PLAN_LIMITS,
  useAppVersion,
  APP_NAME,
  supabase,
  useAuthStore,
  migrateOrgData,
  reloadAllStores,
  getAuthProviderLabel,
  getAuthProviderColor,
  appConfig,
} from '@tutomate/core';
import type { FontSize } from '@tutomate/core';
import { LicenseKeyInput, AdminTab } from '@tutomate/ui';
// useBackup 제거 (v0.3.0 — 백업 탭 비활성화)

const { Text } = Typography;

const SettingsPage: React.FC = () => {
  const {
    theme: appTheme,
    fontSize,
    notificationsEnabled,
    organizationName,
    setTheme,
    setFontSize,
    setNotificationsEnabled,
    setOrganizationName,
    loadSettings,
  } = useSettingsStore();

  const {
    isEnabled: lockEnabled,
    pin: lockPin,
    autoLockMinutes,
    setEnabled: setLockEnabled,
    setPin: setLockPin,
    setAutoLockMinutes,
    lock,
    verifyPin,
  } = useLockStore();

  // PIN 설정 모달 상태
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<'verify' | 'new' | 'confirm'>('new');
  const [pinInput, setPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const APP_VERSION = useAppVersion();
  const session = useAuthStore((s) => s.session);
  const { getPlan, activateLicense, licenseKey } = useLicenseStore();
  const [orgNameInput, setOrgNameInput] = useState(organizationName);
  const [showKey, setShowKey] = useState(false);
  const [licenseInput, setLicenseInput] = useState(['', '', '', '']);
  const [activating, setActivating] = useState(false);
  const [licenseModalVisible, setLicenseModalVisible] = useState(false);
  const currentPlan = getPlan();
  // 백업 기능 제거 (v0.3.0) — useBackup() 미사용

  // 업데이트 관련 상태
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isLatest, setIsLatest] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    loadSettings();
    useLicenseStore.getState().loadLicense();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSettings]);

  // 스토어 organizationName이 로드되면 input 동기화
  useEffect(() => {
    setOrgNameInput(organizationName);
  }, [organizationName]);

  const handleLockToggle = async (checked: boolean) => {
    if (checked && !lockPin) {
      // PIN이 없으면 먼저 설정하도록 모달 열기
      setPinStep('new');
      setPinInput('');
      setNewPinInput('');
      setPinError('');
      setPinModalVisible(true);
      return;
    }
    setLockEnabled(checked);
    message.info(checked ? '화면 잠금이 활성화되었습니다' : '화면 잠금이 비활성화되었습니다');
  };

  const openPinChangeModal = () => {
    if (lockPin) {
      setPinStep('verify');
    } else {
      setPinStep('new');
    }
    setPinInput('');
    setNewPinInput('');
    setPinError('');
    setPinModalVisible(true);
  };

  const handlePinModalOk = async () => {
    if (pinStep === 'verify') {
      const valid = await verifyPin(pinInput);
      if (!valid) {
        setPinError('기존 PIN이 올바르지 않습니다.');
        return;
      }
      setPinStep('new');
      setPinInput('');
      setPinError('');
      return;
    }

    if (pinStep === 'new') {
      if (pinInput.length < 4 || pinInput.length > 6) {
        setPinError('PIN은 4~6자리 숫자를 입력하세요.');
        return;
      }
      setPinStep('confirm');
      setNewPinInput(pinInput);
      setPinInput('');
      setPinError('');
      return;
    }

    if (pinStep === 'confirm') {
      if (pinInput !== newPinInput) {
        setPinError('PIN이 일치하지 않습니다.');
        setPinInput('');
        return;
      }
      await setLockPin(pinInput);
      if (!lockEnabled) {
        setLockEnabled(true);
      }
      setPinModalVisible(false);
      setPinInput('');
      setNewPinInput('');
      setPinError('');
      message.success('PIN이 설정되었습니다.');
    }
  };

  const autoLockOptions = [
    { label: '사용 안 함', value: 0 },
    { label: '1분', value: 1 },
    { label: '3분', value: 3 },
    { label: '5분', value: 5 },
    { label: '10분', value: 10 },
    { label: '30분', value: 30 },
    { label: '1시간', value: 60 },
    { label: '2시간', value: 120 },
    { label: '6시간', value: 360 },
    { label: '24시간', value: 1440 },
  ];

  const fontSizeOptions = [
    { label: '작게', value: 'small' as FontSize },
    { label: '보통', value: 'medium' as FontSize },
    { label: '크게', value: 'large' as FontSize },
    { label: '아주 크게', value: 'extra-large' as FontSize },
  ];

  // 업데이트 확인
  const handleCheckUpdate = async () => {
    if (!isElectron()) { message.warning('업데이트는 데스크톱 앱에서만 사용 가능합니다'); return; }
    setCheckingUpdate(true);
    setUpdateAvailable(null);
    setIsLatest(false);
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result && result.version !== APP_VERSION) {
        setUpdateAvailable({
          version: result.version,
          body: (typeof result.releaseNotes === 'string' ? result.releaseNotes : '') || '새로운 버전이 있습니다.',
        });
        message.info(`새 버전 v${result.version}이 있습니다! (현재: v${APP_VERSION})`);
      } else {
        setIsLatest(true);
        message.success('최신 버전입니다.');
      }
    } catch (error: any) {
      console.error('Update check:', error);
      message.error(`업데이트 확인 실패: ${error?.message || error} (현재: v${APP_VERSION})`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  // 업데이트 다운로드 및 설치
  const handleDownloadUpdate = async () => {
    if (!isElectron()) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const removeListener = window.electronAPI.onUpdateEvent((type, data) => {
        if (type === 'download-progress') {
          setDownloadProgress(Math.round(data.percent));
        } else if (type === 'update-downloaded') {
          setDownloadProgress(100);
        }
      });

      await window.electronAPI.downloadUpdate();
      removeListener();

      setDownloading(false);
      Modal.confirm({
        title: '업데이트 다운로드 완료',
        content: '업데이트를 설치하고 재시작하시겠습니까?',
        okText: '설치 및 재시작',
        cancelText: '나중에',
        onOk: () => {
          window.electronAPI.installUpdate();
        },
      });
    } catch (error) {
      console.error('Update download failed:', error);
      message.error('업데이트 다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const handleActivateLicense = async () => {
    const key = licenseInput.join('-');
    if (licenseInput.some((g) => g.length !== 4)) {
      message.warning('라이선스 키를 모두 입력하세요.');
      return;
    }
    setActivating(true);
    try {
      const result = await activateLicense(key);
      if (result.result === 'success') {
        if (result.orgChanged && result.previousOrgId) {
          const newOrgId = useAuthStore.getState().organizationId!;
          const migrate = await new Promise<boolean>((resolve) => {
            Modal.confirm({
              title: '체험판 데이터 이전',
              content: '체험판에서 입력한 데이터를 라이선스 계정으로 이전하시겠습니까? "새로 시작"을 선택하면 빈 상태로 시작합니다.',
              okText: '이전',
              cancelText: '새로 시작',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (migrate) {
            const ok = await migrateOrgData(result.previousOrgId, newOrgId);
            await reloadAllStores();
            if (ok) {
              message.success('라이선스가 활성화되었습니다! 기존 데이터가 이전되었습니다.');
            } else {
              message.warning('라이선스는 활성화되었지만 데이터 이전에 실패했습니다.');
            }
          } else {
            await reloadAllStores();
            message.success('라이선스가 활성화되었습니다! 새로 시작합니다.');
          }
        } else {
          message.success('라이선스가 활성화되었습니다!');
        }
        setLicenseInput(['', '', '', '']);
        setLicenseModalVisible(false);
      } else if (result.result === 'invalid_format') {
        message.error('유효하지 않은 형식입니다.');
      } else if (result.result === 'network_error') {
        message.error('서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.');
      } else if (result.result === 'max_seats_reached') {
        message.error('이 라이선스의 최대 사용자 수에 도달했습니다.');
      } else {
        message.error('유효하지 않은 라이선스 키입니다.');
      }
    } finally {
      setActivating(false);
    }
  };

  const settingRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 0',
  };

  return (
    <div>
      <Card style={{ maxWidth: 1000 }}>
        {/* 계정 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>로그인 계정</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              {session?.user?.email || '-'}
            </Text>
          </div>
          <Space>
            <Tag color={getAuthProviderColor()}>{getAuthProviderLabel()}</Tag>
            <Button
              size="small"
              danger
              onClick={() => {
                Modal.confirm({
                  title: '로그아웃',
                  icon: <ExclamationCircleOutlined />,
                  content: '로그아웃하면 로그인 화면으로 돌아갑니다.',
                  okText: '로그아웃',
                  okType: 'danger',
                  cancelText: '취소',
                  onOk: async () => {
                    await useAuthStore.getState().deactivateCloud();
                    message.success('로그아웃되었습니다.');
                  },
                });
              }}
            >
              로그아웃
            </Button>
          </Space>
        </div>

        <Divider style={{ margin: 0 }} />

        {/* 현재 플랜 + 라이선스 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>현재 플랜</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              {currentPlan === 'trial'
                ? `강좌 ${PLAN_LIMITS.trial.maxCourses}개, 강좌당 수강생 ${PLAN_LIMITS.trial.maxStudentsPerCourse}명 제한`
                : '모든 기능을 제한 없이 사용 가능'}
            </Text>
          </div>
          <Space>
            <Tag
              color={currentPlan === 'trial' ? 'orange' : currentPlan === 'admin' ? 'red' : 'green'}
              style={{ fontSize: 13, padding: '2px 10px' }}
            >
              {currentPlan === 'trial' ? '체험판' : currentPlan === 'admin' ? 'Admin' : 'Basic'}
            </Tag>
            {currentPlan !== 'trial' && licenseKey ? (
              <>
                <Text code>{showKey ? licenseKey : `${licenseKey.slice(0, 9)}****-****`}</Text>
                <Button type="text" size="small" icon={showKey ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setShowKey(!showKey)} />
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(licenseKey); message.success('키가 복사되었습니다.'); }} />
              </>
            ) : (
              <Button size="small" type="primary" onClick={() => setLicenseModalVisible(true)}>라이선스 활성화</Button>
            )}
          </Space>
        </div>

        {/* 라이선스 활성화 모달 */}
        <Modal
          title="라이선스 활성화"
          open={licenseModalVisible}
          onCancel={() => setLicenseModalVisible(false)}
          footer={null}
          destroyOnClose
        >
          <Space direction="vertical" size="middle" style={{ width: '100%', paddingTop: 8 }}>
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              키를 직접 입력하거나 전체 붙여넣기 하세요
            </Text>
            <LicenseKeyInput value={licenseInput} onChange={setLicenseInput} onPressEnter={handleActivateLicense} />
            <Button type="primary" block onClick={handleActivateLicense} loading={activating}>
              활성화
            </Button>
            <Text type="secondary" style={{ fontSize: '0.85em', textAlign: 'center', display: 'block' }}>
              문의: {appConfig.contactInfo}
            </Text>
          </Space>
        </Modal>

        <Divider style={{ margin: 0 }} />

        {/* 이름 */}
        <div style={settingRowStyle}>
          <div style={{ flex: 1, marginRight: 24 }}>
            <Text strong>이름</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              {currentPlan === 'trial' ? '라이선스 활성화 후 변경 가능' : '헤더와 백업 파일명에 표시'}
            </Text>
          </div>
          <Space>
            <Input
              value={orgNameInput}
              onChange={(e) => setOrgNameInput(e.target.value)}
              placeholder="이름을 입력하세요"
              style={{ width: 240 }}
              disabled={currentPlan === 'trial'}
            />
            <Button
              type="primary"
              icon={<SaveOutlined />}
              size="small"
              disabled={currentPlan === 'trial' || orgNameInput === organizationName}
              onClick={async () => {
                const prevName = organizationName;
                setOrganizationName(orgNameInput);
                const orgId = useAuthStore.getState().organizationId;
                if (supabase && orgId) {
                  const { error } = await supabase.from('organizations').update({ name: orgNameInput }).eq('id', orgId);
                  if (error) {
                    setOrganizationName(prevName);
                    message.error('이름 저장에 실패했습니다.');
                    return;
                  }
                }
                message.success('이름이 저장되었습니다.');
              }}
            >
              저장
            </Button>
          </Space>
        </div>

        <Divider style={{ margin: 0 }} />

        {/* 다크 모드 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>다크 모드</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>앱의 테마를 변경합니다</Text>
          </div>
          <Switch checked={appTheme === 'dark'} onChange={(checked) => setTheme(checked ? 'dark' : 'light')} checkedChildren="켜짐" unCheckedChildren="꺼짐" />
        </div>

        <Divider style={{ margin: 0 }} />

        {/* 텍스트 크기 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>텍스트 크기</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>앱 전체의 텍스트 크기를 조절합니다</Text>
          </div>
          <Radio.Group value={fontSize} onChange={(e) => setFontSize(e.target.value)} options={fontSizeOptions} optionType="button" buttonStyle="solid" size="small" />
        </div>

        <Divider style={{ margin: 0 }} />

        {/* 알림 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>알림</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              {notificationsEnabled ? '앱 내 알림이 활성화되어 있습니다' : '알림이 비활성화되어 있습니다'}
            </Text>
          </div>
          <Switch checked={notificationsEnabled} onChange={setNotificationsEnabled} checkedChildren="켜짐" unCheckedChildren="꺼짐" />
        </div>

        <Divider style={{ margin: 0 }} />

        {/* 화면 잠금 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>화면 잠금 사용</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              {lockEnabled ? '화면 잠금이 활성화되어 있습니다' : '자리를 비울 때 화면을 잠급니다'}
            </Text>
          </div>
          <Switch checked={lockEnabled} onChange={handleLockToggle} checkedChildren="켜짐" unCheckedChildren="꺼짐" />
        </div>

        {lockEnabled && (
          <>
            <Divider style={{ margin: 0 }} />
            <div style={settingRowStyle}>
              <div>
                <Text strong>PIN 설정</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '0.85em' }}>4~6자리 숫자 PIN</Text>
              </div>
              <Button size="small" icon={<LockOutlined />} onClick={openPinChangeModal}>PIN 변경</Button>
            </div>
            <Divider style={{ margin: 0 }} />
            <div style={settingRowStyle}>
              <div>
                <Text strong>자동 잠금</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '0.85em' }}>미사용 시 자동으로 화면을 잠급니다</Text>
              </div>
              <Select value={autoLockMinutes} onChange={setAutoLockMinutes} options={autoLockOptions} style={{ width: 130 }} size="small" />
            </div>
            <Divider style={{ margin: 0 }} />
            <div style={settingRowStyle}>
              <div>
                <Text strong>지금 잠금</Text>
                <br />
                <Text type="secondary" style={{ fontSize: '0.85em' }}>화면을 즉시 잠급니다</Text>
              </div>
              <Button size="small" icon={<LockOutlined />} onClick={lock}>잠금</Button>
            </div>
          </>
        )}

        {/* PIN 설정 Modal */}
        <Modal
          title={pinStep === 'verify' ? '기존 PIN 확인' : pinStep === 'new' ? '새 PIN 입력' : 'PIN 확인'}
          open={pinModalVisible}
          onOk={handlePinModalOk}
          onCancel={() => { setPinModalVisible(false); setPinInput(''); setNewPinInput(''); setPinError(''); }}
          okText={pinStep === 'confirm' ? '설정' : '다음'}
          cancelText="취소"
          okButtonProps={{ disabled: pinInput.length < 4 }}
          destroyOnClose
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              {pinStep === 'verify' ? '기존 PIN을 입력하세요' : pinStep === 'new' ? '새 PIN을 입력하세요 (4~6자리 숫자)' : '새 PIN을 다시 입력하세요'}
            </Text>
            <Input.Password
              value={pinInput}
              onChange={(e) => { const val = e.target.value.replace(/\D/g, ''); if (val.length <= 6) { setPinInput(val); setPinError(''); } }}
              onPressEnter={handlePinModalOk}
              placeholder="PIN 입력"
              maxLength={6}
              style={{ width: 200, textAlign: 'center', fontSize: 20, letterSpacing: 8 }}
              autoFocus
            />
            {pinError && <div style={{ marginTop: 8 }}><Text type="danger">{pinError}</Text></div>}
          </div>
        </Modal>

        <Divider style={{ margin: 0 }} />

        {/* 앱 정보 */}
        <div style={settingRowStyle}>
          <div>
            <Text strong>앱 정보</Text>
            <br />
            <Space size={8}>
              <Text type="secondary" style={{ fontSize: '0.85em' }}>{APP_NAME} v{APP_VERSION}</Text>
              {isLatest && <Tag color="green" style={{ margin: 0 }}>최신 버전</Tag>}
            </Space>
          </div>
          <Button onClick={handleCheckUpdate} loading={checkingUpdate} size="small">업데이트 확인</Button>
        </div>

        {updateAvailable && (
          <>
            <Divider style={{ margin: 0 }} />
            <div style={{ padding: '16px 0' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <Tag color="green">새 버전</Tag>
                  <Text strong>v{updateAvailable.version}</Text>
                </Space>
                <div style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)' }} dangerouslySetInnerHTML={{ __html: updateAvailable.body }} />
                {downloading ? (
                  <Progress percent={downloadProgress} status="active" />
                ) : (
                  <Button type="primary" onClick={handleDownloadUpdate} size="small">다운로드 및 설치</Button>
                )}
              </Space>
            </div>
          </>
        )}
      </Card>

      {currentPlan === 'admin' && (
        <Card style={{ maxWidth: 1000, marginTop: 16 }}>
          <AdminTab />
        </Card>
      )}
    </div>
  );
};

export default SettingsPage;
