import React, { useState, useEffect, useCallback } from 'react';
import { Card, Space, Typography, Button, Table, Input, Select, Tag, message, Divider } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { supabase } from '../../config/supabase';
import { useLicenseStore } from '../../stores/licenseStore';
import { logError } from '../../utils/logger';

const { Text } = Typography;

interface LicenseRow {
  key_hash: string;
  key: string;
  plan: string;
  memo: string | null;
  created_at: string;
}

interface OrgRow {
  id: string;
  name: string;
  license_key: string;
  plan: string;
  max_seats: number;
  member_count: number;
  created_at: string;
}

const AdminTab: React.FC = () => {
  const { deactivateLicense } = useLicenseStore();

  // 키 생성
  const [keyMemo, setKeyMemo] = useState('');
  const [keyPlan, setKeyPlan] = useState<'basic' | 'admin'>('basic');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');

  // 키 목록
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [licensesLoading, setLicensesLoading] = useState(false);

  // 조직 목록
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const loadLicenses = useCallback(async () => {
    if (!supabase) return;
    setLicensesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-licenses');
      if (error || data?.error) {
        message.error(`키 목록 조회 실패: ${data?.error || error?.message}`);
        return;
      }
      setLicenses(data.licenses || []);
    } catch (err) {
      logError('Failed to load licenses', { error: err });
      message.error('키 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setLicensesLoading(false);
    }
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!supabase) return;
    setOrgsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-organizations');
      if (error || data?.error) {
        message.error(`조직 목록 조회 실패: ${data?.error || error?.message}`);
        return;
      }
      setOrganizations(data.organizations || []);
    } catch (err) {
      logError('Failed to load organizations', { error: err });
      message.error('조직 목록 조회 중 오류가 발생했습니다.');
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLicenses();
    loadOrganizations();
  }, [loadLicenses, loadOrganizations]);

  const handleGenerateKey = async () => {
    if (!supabase) {
      message.error('Supabase가 설정되지 않았습니다.');
      return;
    }
    setGeneratingKey(true);
    setGeneratedKey('');
    try {
      const { data, error } = await supabase.functions.invoke('generate-license', {
        body: { plan: keyPlan, memo: keyMemo || null },
      });
      if (error || data?.error) {
        message.error(`키 생성 실패: ${data?.error || error?.message}`);
        return;
      }
      setGeneratedKey(data.key);
      setKeyMemo('');
      message.success('라이선스 키가 생성되었습니다.');
      loadLicenses();
    } catch {
      message.error('키 생성 중 오류가 발생했습니다.');
    } finally {
      setGeneratingKey(false);
    }
  };


  const licenseColumns = [
    {
      title: '키',
      dataIndex: 'key',
      key: 'key',
      render: (text: string) => <Text code copyable>{text}</Text>,
    },
    {
      title: '플랜',
      dataIndex: 'plan',
      key: 'plan',
      render: (plan: string) => (
        <Tag color={plan === 'admin' ? 'red' : 'blue'}>{plan}</Tag>
      ),
    },
    {
      title: '메모',
      dataIndex: 'memo',
      key: 'memo',
      render: (memo: string | null) => memo || '-',
    },
    {
      title: '생성일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
  ];

  const orgColumns = [
    {
      title: '조직명',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '라이선스 키',
      dataIndex: 'license_key',
      key: 'license_key',
      render: (text: string) => <Text code style={{ fontSize: '0.85em' }}>{text}</Text>,
    },
    {
      title: '플랜',
      dataIndex: 'plan',
      key: 'plan',
      render: (plan: string) => (
        <Tag color={plan === 'admin' ? 'red' : plan === 'basic' ? 'blue' : 'orange'}>{plan}</Tag>
      ),
    },
    {
      title: '최대 사용자',
      dataIndex: 'max_seats',
      key: 'max_seats',
    },
    {
      title: '멤버 수',
      dataIndex: 'member_count',
      key: 'member_count',
    },
    {
      title: '생성일',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <Card style={{ maxWidth: 1000 }}>
      {/* 키 생성 */}
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 12 }}>
          <Text strong>키 생성</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '0.85em' }}>
            Supabase에 새 라이선스 키를 등록합니다
          </Text>
        </div>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space>
            <Input
              placeholder="메모 (선택)"
              value={keyMemo}
              onChange={(e) => setKeyMemo(e.target.value)}
              style={{ width: 200 }}
              size="small"
            />
            <Select
              value={keyPlan}
              onChange={setKeyPlan}
              size="small"
              style={{ width: 100 }}
              options={[
                { label: 'Basic', value: 'basic' },
                { label: 'Admin', value: 'admin' },
              ]}
            />
            <Button
              size="small"
              onClick={handleGenerateKey}
              loading={generatingKey}
            >
              키 생성
            </Button>
          </Space>
          {generatedKey && (
            <Space>
              <Text code copyable={{ icon: <CopyOutlined /> }}>{generatedKey}</Text>
              <Tag color="green">생성됨</Tag>
            </Space>
          )}
        </Space>
      </div>

      <Divider style={{ margin: 0 }} />

      {/* 라이선스 키 목록 */}
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <Text strong>라이선스 키 목록</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              등록된 모든 라이선스 키
            </Text>
          </div>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadLicenses}
            loading={licensesLoading}
          >
            새로고침
          </Button>
        </div>
        <Table
          columns={licenseColumns}
          dataSource={licenses}
          rowKey="key_hash"
          loading={licensesLoading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </div>

      <Divider style={{ margin: 0 }} />

      {/* 조직 목록 */}
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <Text strong>조직 목록</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '0.85em' }}>
              등록된 모든 조직
            </Text>
          </div>
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadOrganizations}
            loading={orgsLoading}
          >
            새로고침
          </Button>
        </div>
        <Table
          columns={orgColumns}
          dataSource={organizations}
          rowKey="id"
          loading={orgsLoading}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </div>

      {/* DEV 도구 */}
      {import.meta.env.DEV && (
        <>
          <Divider style={{ margin: 0 }} />
          <div style={{ padding: '16px 0' }}>
            <Text strong>DEV 도구</Text>
            <Space style={{ marginTop: 8, display: 'flex' }}>
              <Button size="small" danger onClick={async () => { await deactivateLicense(); message.info('라이선스가 비활성화되었습니다.'); }}>
                라이선스 비활성화
              </Button>
              <Button size="small" onClick={() => { localStorage.removeItem('welcome-dismissed'); window.location.reload(); }}>
                웰컴 모달 리셋
              </Button>
            </Space>
          </div>
        </>
      )}
    </Card>
  );
};

export default AdminTab;
