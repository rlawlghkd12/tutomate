import React, { useEffect } from 'react';
import { Card, Space, Typography, Switch, Radio, Divider } from 'antd';
import { useSettingsStore, type FontSize } from '../stores/settingsStore';

const { Title, Text } = Typography;

const SettingsPage: React.FC = () => {
  const {
    theme,
    fontSize,
    notificationsEnabled,
    setTheme,
    setFontSize,
    setNotificationsEnabled,
    loadSettings,
  } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const fontSizeOptions = [
    { label: '작게', value: 'small' as FontSize },
    { label: '보통', value: 'medium' as FontSize },
    { label: '크게', value: 'large' as FontSize },
    { label: '아주 크게', value: 'extra-large' as FontSize },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>설정</Title>

      <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 800 }}>
        {/* 테마 설정 */}
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Title level={4}>테마</Title>
              <Text type="secondary">앱의 테마를 변경합니다.</Text>
            </div>
            <Space>
              <Text>다크 모드:</Text>
              <Switch
                checked={theme === 'dark'}
                onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                checkedChildren="켜짐"
                unCheckedChildren="꺼짐"
              />
            </Space>
          </Space>
        </Card>

        {/* 폰트 크기 설정 */}
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Title level={4}>텍스트 크기</Title>
              <Text type="secondary">앱 전체의 텍스트 크기를 조절합니다.</Text>
            </div>
            <Radio.Group
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              options={fontSizeOptions}
              optionType="button"
              buttonStyle="solid"
            />
            <Divider />
            <div>
              <Text style={{ fontSize: fontSize === 'small' ? 12 : fontSize === 'medium' ? 14 : fontSize === 'large' ? 16 : 18 }}>
                미리보기: 이것은 선택한 크기의 텍스트입니다.
              </Text>
            </div>
          </Space>
        </Card>

        {/* 알림 설정 */}
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Title level={4}>알림</Title>
              <Text type="secondary">앱 내 알림을 제어합니다.</Text>
            </div>
            <Space>
              <Text>알림 활성화:</Text>
              <Switch
                checked={notificationsEnabled}
                onChange={setNotificationsEnabled}
                checkedChildren="켜짐"
                unCheckedChildren="꺼짐"
              />
            </Space>
            {!notificationsEnabled && (
              <Text type="warning">
                알림이 비활성화되어 있습니다. 중요한 업데이트를 놓칠 수 있습니다.
              </Text>
            )}
          </Space>
        </Card>
      </Space>
    </div>
  );
};

export default SettingsPage;
