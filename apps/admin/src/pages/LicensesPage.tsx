import { Table, Tag, Button, Space, Modal, Select, Input, message, Typography } from 'antd';
import { PlusOutlined, CopyOutlined, EditOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { supabase } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Title } = Typography;

interface LicenseRow {
  key: string;
  plan: string;
  memo: string | null;
  assigned_email: string | null;
  used: boolean;
  used_by: string | null;
  created_at: string;
}

async function callAdmin(action: string, body: any): Promise<any> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return res.json();
}

const LicensesPage = () => {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [genModalVisible, setGenModalVisible] = useState(false);
  const [genPlan, setGenPlan] = useState<string>('basic');
  const [genMemo, setGenMemo] = useState('');
  const [genEmail, setGenEmail] = useState('');
  const [generating, setGenerating] = useState(false);

  // 이메일 편집
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');

  const fetchLicenses = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.functions.invoke('list-licenses');
    setLicenses(data?.licenses || []);
    setLoading(false);
  };

  useEffect(() => { fetchLicenses(); }, []);

  const handleGenerate = async () => {
    if (!supabase) return;
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke('generate-license', {
      body: { plan: genPlan, memo: genMemo || undefined, assigned_email: genEmail || undefined },
    });
    setGenerating(false);
    if (error || data?.error) {
      message.error('라이선스 생성 실패');
      return;
    }
    message.success(`라이선스 생성됨: ${data.key}`);
    navigator.clipboard.writeText(data.key);
    setGenModalVisible(false);
    setGenMemo('');
    setGenEmail('');
    fetchLicenses();
  };

  const handleAssignEmail = async (licenseKey: string, email: string) => {
    const result = await callAdmin('assign-license-email', { licenseKey, email: email || null });
    if (result?.success) {
      message.success('이메일이 할당되었습니다.');
      setEditingKey(null);
      fetchLicenses();
    } else {
      message.error('할당 실패');
    }
  };

  const columns = [
    {
      title: '라이선스 키',
      dataIndex: 'key',
      key: 'key',
      render: (key: string) => (
        <Space>
          <code>{key}</code>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => { navigator.clipboard.writeText(key); message.success('복사됨'); }}
          />
        </Space>
      ),
    },
    {
      title: '플랜',
      dataIndex: 'plan',
      key: 'plan',
      width: 80,
      render: (p: string) => <Tag color={p === 'admin' ? 'red' : 'green'}>{p}</Tag>,
    },
    {
      title: '할당 이메일',
      dataIndex: 'assigned_email',
      key: 'assigned_email',
      width: 250,
      render: (email: string | null, record: LicenseRow) => {
        if (editingKey === record.key) {
          return (
            <Space>
              <Input
                size="small"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="이메일"
                style={{ width: 180 }}
                onPressEnter={() => handleAssignEmail(record.key, editEmail)}
              />
              <Button size="small" type="primary" onClick={() => handleAssignEmail(record.key, editEmail)}>저장</Button>
              <Button size="small" onClick={() => setEditingKey(null)}>취소</Button>
            </Space>
          );
        }
        return (
          <Space>
            <span>{email || <span style={{ color: '#999' }}>미지정</span>}</span>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => { setEditingKey(record.key); setEditEmail(email || ''); }}
            />
          </Space>
        );
      },
    },
    {
      title: '상태',
      dataIndex: 'used',
      key: 'used',
      width: 150,
      render: (used: boolean, record: LicenseRow) =>
        used ? (
          <span><Tag color="green">사용중</Tag> {record.used_by}</span>
        ) : (
          <Tag>미사용</Tag>
        ),
    },
    {
      title: '메모',
      dataIndex: 'memo',
      key: 'memo',
      render: (m: string | null) => m || '-',
    },
    {
      title: '생성일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (d: string) => (
        <span title={dayjs(d).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(d).fromNow()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>라이선스 관리</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenModalVisible(true)}>
          라이선스 생성
        </Button>
      </div>
      <Table
        dataSource={licenses}
        columns={columns}
        rowKey="key"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />
      <Modal
        title="라이선스 생성"
        open={genModalVisible}
        onCancel={() => setGenModalVisible(false)}
        onOk={handleGenerate}
        confirmLoading={generating}
        okText="생성"
        cancelText="취소"
      >
        <Space direction="vertical" size="middle" style={{ width: '100%', paddingTop: 8 }}>
          <div>
            <label>플랜</label>
            <Select value={genPlan} onChange={setGenPlan} style={{ width: '100%', marginTop: 4 }}>
              <Select.Option value="basic">Basic</Select.Option>
              <Select.Option value="admin">Admin</Select.Option>
            </Select>
          </div>
          <div>
            <label>할당 이메일 (선택)</label>
            <Input value={genEmail} onChange={(e) => setGenEmail(e.target.value)} placeholder="user@example.com" style={{ marginTop: 4 }} />
          </div>
          <div>
            <label>메모 (선택)</label>
            <Input value={genMemo} onChange={(e) => setGenMemo(e.target.value)} placeholder="고객명 등" style={{ marginTop: 4 }} />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default LicensesPage;
