import { Table, Tag, Typography, Input, Spin, Modal, Select, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { supabase } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { Title, Text } = Typography;

interface OrgRow {
  id: string;
  name: string;
  license_key: string | null;
  plan: string;
  max_seats: number;
  created_at: string;
  member_count: number;
  course_count: number;
  student_count: number;
  enrollment_count: number;
}

interface OrgDetail {
  courses: { id: string; name: string; student_count: number }[];
  students: { id: string; name: string; phone: string | null }[];
}

const OrganizationsPage = () => {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchOrgs = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.functions.invoke('list-organizations');
    setOrgs(data?.organizations || []);
    setLoading(false);
  };

  useEffect(() => { fetchOrgs(); }, []);

  const openDetail = async (org: OrgRow) => {
    setSelectedOrg(org);
    setDetail(null);
    setDetailLoading(true);
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=org-detail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: org.id }),
      },
    );
    const data = await res.json();
    setDetail(data);
    setDetailLoading(false);
  };

  const filtered = orgs.filter((o) =>
    !search || o.name?.toLowerCase().includes(search.toLowerCase()) || o.license_key?.includes(search)
  );

  const columns = [
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      ellipsis: true,
    },
    {
      title: '플랜',
      dataIndex: 'plan',
      key: 'plan',
      width: 70,
      render: (p: string) => (
        <Tag color={p === 'admin' ? 'red' : p === 'basic' ? 'green' : 'orange'}>{p}</Tag>
      ),
    },
    {
      title: '라이선스',
      dataIndex: 'license_key',
      key: 'license_key',
      width: 170,
      render: (k: string | null) => k ? <code style={{ fontSize: 11 }}>{k}</code> : <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '강좌',
      dataIndex: 'course_count',
      key: 'course_count',
      width: 55,
      align: 'center' as const,
    },
    {
      title: '수강생',
      dataIndex: 'student_count',
      key: 'student_count',
      width: 60,
      align: 'center' as const,
    },
    {
      title: '유저',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 50,
      align: 'center' as const,
    },
    {
      title: '생성일',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
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
        <Title level={4} style={{ margin: 0 }}>조직 관리</Title>
        <Input
          placeholder="이름 또는 라이선스 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        onRow={(record) => ({
          onClick: () => openDetail(record),
          style: { cursor: 'pointer' },
        })}
      />
      <Modal
        title={selectedOrg?.name || '조직 상세'}
        open={!!selectedOrg}
        onCancel={() => setSelectedOrg(null)}
        footer={null}
        width={700}
      >
        {selectedOrg && (
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text>플랜:</Text>
            <Select
              size="small"
              value={selectedOrg.plan}
              onChange={async (plan) => {
                if (!supabase) return;
                const { data: { session } } = await supabase.auth.getSession();
                const res = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=change-plan`,
                  {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ organizationId: selectedOrg.id, plan }),
                  },
                );
                const result = await res.json();
                if (result?.success) {
                  message.success('플랜이 변경되었습니다.');
                  setSelectedOrg({ ...selectedOrg, plan });
                  fetchOrgs();
                } else {
                  message.error('변경 실패');
                }
              }}
              style={{ width: 100 }}
              options={[
                { value: 'trial', label: <Tag color="orange">trial</Tag> },
                { value: 'basic', label: <Tag color="green">basic</Tag> },
                { value: 'admin', label: <Tag color="red">admin</Tag> },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              라이선스: {selectedOrg.license_key ? <code>{selectedOrg.license_key}</code> : '없음'}
            </Text>
          </div>
        )}
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : detail ? (
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>강좌 ({detail.courses?.length || 0})</Text>
              {detail.courses?.length ? (
                <Table
                  dataSource={detail.courses}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '강좌명', dataIndex: 'name', key: 'name' },
                    { title: '수강생', dataIndex: 'student_count', key: 'sc', width: 60, align: 'center' as const },
                  ]}
                />
              ) : <Text type="secondary">강좌 없음</Text>}
            </div>
            <div style={{ flex: 1 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>수강생 ({detail.students?.length || 0})</Text>
              {detail.students?.length ? (
                <Table
                  dataSource={detail.students}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '이름', dataIndex: 'name', key: 'name' },
                    { title: '연락처', dataIndex: 'phone', key: 'phone', render: (p: string | null) => p || '-' },
                  ]}
                />
              ) : <Text type="secondary">수강생 없음</Text>}
            </div>
          </div>
        ) : <Text type="secondary">데이터 없음</Text>}
      </Modal>
    </div>
  );
};

export default OrganizationsPage;
