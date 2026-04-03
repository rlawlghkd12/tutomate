import { Search, Trash2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@tutomate/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import {
  Button,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
  Badge, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@tutomate/ui';

dayjs.extend(relativeTime);
dayjs.locale('ko');

interface UserRow {
  id: string;
  email: string;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_anonymous: boolean;
  organization: { id: string; name: string; plan: string } | null;
  course_count: number;
  student_count: number;
}

async function callAdminUsers(action: string, body?: any): Promise<any> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=${action}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const providerColor: Record<string, string> = {
  google: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  kakao: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  naver: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  email: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

const planColor: Record<string, string> = {
  trial: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  basic: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

const UsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const data = await callAdminUsers('list');
    setUsers(data?.users || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (userId: string) => {
    const result = await callAdminUsers('delete', { userId });
    if (result?.success) {
      toast.success('유저가 삭제되었습니다.');
      fetchUsers();
    } else {
      toast.error('삭제 실패');
    }
    setDeleteTarget(null);
  };

  const handleChangePlan = async (orgId: string, plan: string) => {
    const result = await callAdminUsers('change-plan', { organizationId: orgId, plan });
    if (result?.success) {
      toast.success('플랜이 변경되었습니다.');
      fetchUsers();
    } else {
      toast.error('변경 실패');
    }
  };

  const filtered = users.filter((u) =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold m-0">유저 관리</h4>
        <div className="relative w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이메일 검색"
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
                <TableHead>이메일</TableHead>
                <TableHead className="w-[100px]">프로바이더</TableHead>
                <TableHead>조직</TableHead>
                <TableHead className="w-[140px]">가입일</TableHead>
                <TableHead className="w-[140px]">최근 로그인</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {user.email || '-'}
                      {user.is_anonymous && <Badge variant="outline">익명</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={providerColor[user.provider] || ''} variant="outline">
                      {user.provider}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.organization ? (
                      <div className="flex items-center gap-2">
                        <span>{user.organization.name}</span>
                        <Select
                          value={user.organization.plan}
                          onValueChange={(plan) => handleChangePlan(user.organization!.id, plan)}
                        >
                          <SelectTrigger className="h-7 w-[90px] text-xs">
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
                      </div>
                    ) : (
                      <Badge variant="outline">없음</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span title={dayjs(user.created_at).format('YYYY-MM-DD HH:mm:ss')}>
                      {dayjs(user.created_at).fromNow()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {user.last_sign_in_at ? (
                      <span title={dayjs(user.last_sign_in_at).format('YYYY-MM-DD HH:mm:ss')}>
                        {dayjs(user.last_sign_in_at).fromNow()}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(user.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>유저 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 유저를 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersPage;
