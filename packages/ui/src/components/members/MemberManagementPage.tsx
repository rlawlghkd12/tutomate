import { useState, useEffect, useCallback } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '../ui/alert-dialog';
import { supabase, useAuthStore } from '@tutomate/core';
import { Users, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Member {
  userId: string;
  email: string;
  role: 'owner' | 'member';
  createdAt: string;
}

interface MembersData {
  members: Member[];
  maxSeats: number;
  currentCount: number;
}

export function MemberManagementPage() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const currentUserId = useAuthStore((s) => s.session?.user?.id);

  const loadMembers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('get-org-members');
      if (error) {
        toast.error('멤버 목록을 불러오지 못했습니다.');
        return;
      }
      setData(result as MembersData);
    } catch {
      toast.error('멤버 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRemove = async () => {
    if (!supabase || !removeTarget) return;
    setRemoving(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('remove-org-member', {
        body: { userId: removeTarget.userId },
      });
      if (error || result?.error) {
        const msg = result?.error === 'cannot_remove_self'
          ? '본인은 제거할 수 없습니다.'
          : '멤버 제거에 실패했습니다.';
        toast.error(msg);
        return;
      }
      toast.success(`${removeTarget.email} 멤버를 제거했습니다.`);
      setRemoveTarget(null);
      await loadMembers();
    } catch {
      toast.error('멤버 제거에 실패했습니다.');
    } finally {
      setRemoving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="page-enter" style={{ padding: '2rem', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Users style={{ width: 24, height: 24 }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>멤버 관리</h1>
          {data && (
            <Badge variant="secondary">
              {data.currentCount}/{data.maxSeats}명 사용 중
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={loadMembers} disabled={loading}>
          <RefreshCw style={{ width: 16, height: 16, marginRight: 4 }} />
          새로고침
        </Button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
        </div>
      ) : !data || data.members.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'hsl(var(--muted-foreground))' }}>
          멤버가 없습니다.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이메일</TableHead>
              <TableHead style={{ width: 100 }}>역할</TableHead>
              <TableHead style={{ width: 150 }}>가입일</TableHead>
              <TableHead style={{ width: 80 }}>작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((member) => {
              const isMe = member.userId === currentUserId;
              return (
                <TableRow key={member.userId}>
                  <TableCell>
                    <span>{member.email}</span>
                    {isMe && (
                      <Badge variant="outline" style={{ marginLeft: 8 }}>나</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      {member.role === 'owner' ? '관리자' : '멤버'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(member.createdAt)}</TableCell>
                  <TableCell>
                    {member.role !== 'owner' && !isMe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(member)}
                        style={{ color: 'hsl(var(--destructive))' }}
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>멤버 제거</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeTarget?.email}</strong> 멤버를 조직에서 제거하시겠습니까?
              제거된 멤버는 더 이상 이 조직의 데이터에 접근할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              style={{ background: 'hsl(var(--destructive))', color: 'white' }}
            >
              {removing ? '제거 중...' : '제거'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
