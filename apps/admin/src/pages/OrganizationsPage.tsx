import { Search, Loader2, Copy, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import {
  Button,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Badge, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@tutomate/ui';

dayjs.extend(relativeTime);
dayjs.locale('ko');

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

const planColor: Record<string, string> = {
  trial: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  basic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

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

  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const handleCreateInvite = async (orgId: string) => {
    if (!supabase) return;
    setCreatingInvite(true);
    setInviteCode(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=create-org-invite`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: orgId, expiresInDays: 30, maxUses: 0 }),
        },
      );
      const data = await res.json();
      if (data?.code) {
        setInviteCode(data.code);
        toast.success('초대 코드가 생성되었습니다.');
      } else {
        toast.error(`생성 실패: ${data?.error || 'unknown'}`);
      }
    } catch {
      toast.error('초대 코드 생성 실패');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleChangePlan = async (orgId: string, plan: string) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=change-plan`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId, plan }),
      },
    );
    const result = await res.json();
    if (result?.success) {
      toast.success('플랜이 변경되었습니다.');
      if (selectedOrg) setSelectedOrg({ ...selectedOrg, plan });
      fetchOrgs();
    } else {
      toast.error('변경 실패');
    }
  };

  const filtered = orgs.filter((o) =>
    !search || o.name?.toLowerCase().includes(search.toLowerCase()) || o.license_key?.includes(search)
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold m-0">조직 관리</h4>
        <div className="relative w-[300px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="이름 또는 라이선스 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">이름</TableHead>
                <TableHead className="w-[70px]">플랜</TableHead>
                <TableHead className="w-[170px]">라이선스</TableHead>
                <TableHead className="w-[55px] text-center">강좌</TableHead>
                <TableHead className="w-[60px] text-center">수강생</TableHead>
                <TableHead className="w-[50px] text-center">유저</TableHead>
                <TableHead className="w-[100px]">생성일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((org) => (
                <TableRow
                  key={org.id}
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => openDetail(org)}
                >
                  <TableCell className="truncate max-w-[150px]">{org.name}</TableCell>
                  <TableCell>
                    <Badge className={planColor[org.plan] || ''} variant="outline">{org.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    {org.license_key
                      ? <code className="text-[11px]">{org.license_key}</code>
                      : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-center">{org.course_count}</TableCell>
                  <TableCell className="text-center">{org.student_count}</TableCell>
                  <TableCell className="text-center">{org.member_count}</TableCell>
                  <TableCell>
                    <span title={dayjs(org.created_at).format('YYYY-MM-DD HH:mm:ss')}>
                      {dayjs(org.created_at).fromNow()}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!selectedOrg} onOpenChange={(open) => { if (!open) { setSelectedOrg(null); setInviteCode(null); } }}>
        <DialogContent className="max-w-[700px]">
          <DialogHeader>
            <DialogTitle>{selectedOrg?.name || '조직 상세'}</DialogTitle>
          </DialogHeader>

          {selectedOrg && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm">플랜:</span>
                <Select
                  value={selectedOrg.plan}
                  onValueChange={(plan) => handleChangePlan(selectedOrg.id, plan)}
                >
                  <SelectTrigger className="h-7 w-[100px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">
                      <Badge className={planColor.trial} variant="outline">trial</Badge>
                    </SelectItem>
                    <SelectItem value="basic">
                      <Badge className={planColor.basic} variant="outline">basic</Badge>
                    </SelectItem>
                    <SelectItem value="admin">
                      <Badge className={planColor.admin} variant="outline">admin</Badge>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  라이선스: {selectedOrg.license_key ? <code>{selectedOrg.license_key}</code> : '없음'}
                </span>
                <div style={{ marginLeft: 'auto' }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCreateInvite(selectedOrg.id)}
                    disabled={creatingInvite}
                  >
                    <Ticket className="h-3.5 w-3.5 mr-1" />
                    {creatingInvite ? '생성 중...' : '초대 코드'}
                  </Button>
                </div>
              </div>
              {inviteCode && (
                <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={{ background: 'hsl(var(--muted))' }}>
                  <code className="text-lg font-bold tracking-widest">{inviteCode}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { navigator.clipboard.writeText(inviteCode); toast.success('복사됨'); }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}

          {detailLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="flex gap-6">
              <div className="flex-1">
                <p className="font-semibold text-sm mb-2">강좌 ({detail.courses?.length || 0})</p>
                {detail.courses?.length ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>강좌명</TableHead>
                          <TableHead className="w-[60px] text-center">수강생</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.courses.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{c.name}</TableCell>
                            <TableCell className="text-center">{c.student_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-sm text-muted-foreground">강좌 없음</p>}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm mb-2">수강생 ({detail.students?.length || 0})</p>
                {detail.students?.length ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>이름</TableHead>
                          <TableHead>연락처</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.students.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>{s.name}</TableCell>
                            <TableCell>{s.phone || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-sm text-muted-foreground">수강생 없음</p>}
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">데이터 없음</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsPage;
