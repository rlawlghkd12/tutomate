import { useState, useEffect, useCallback, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Alert, AlertDescription } from '../ui/alert';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '../ui/alert-dialog';
import { supabase, useAuthStore, canManageMembers, ORG_ROLE_LABELS } from '@tutomate/core';
import type { OrgRoleType } from '@tutomate/core';
import { useNavigate } from 'react-router-dom';
import { Input } from '../ui/input';
import { Trash2, Loader2, RefreshCw, Plus, Copy, Ticket, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageEnter } from '../common/PageEnter';
import { TableSkeleton } from '../common/TableSkeleton';

interface Member {
  userId: string;
  email: string;
  role: OrgRoleType;
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
  const [inviteCode, setInviteCode] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const currentUserId = useAuthStore((s) => s.session?.user?.id);
  const role = useAuthStore((s) => s.role);
  const navigate = useNavigate();

  // 권한 없으면 메인으로
  useEffect(() => {
    if (!canManageMembers()) {
      navigate('/', { replace: true });
    }
  }, [role, navigate]);

  const loadMembers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('get-org-members');
      if (error || result?.error) {
        console.error('get-org-members error:', error, result);
        toast.error(`멤버 목록 실패: ${result?.error || error?.message || 'unknown'}`);
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

  const handleCreateInvite = async () => {
    if (!supabase) return;
    setCreatingInvite(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('create-invite', {
        body: { expires_in_days: 7, max_uses: 0 },
      });
      if (error || result?.error) {
        toast.error('초대 코드 생성에 실패했습니다.');
        return;
      }
      setInviteCode(result.code as string);
      toast.success('초대 코드가 생성되었습니다.');
    } catch {
      toast.error('초대 코드 생성에 실패했습니다.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const myRoleLabel = useMemo(() => {
    if (!role) return '-';
    return ORG_ROLE_LABELS[role as OrgRoleType] || role;
  }, [role]);

  const emptySeats = data ? Math.max(0, data.maxSeats - data.currentCount) : 0;
  const seatFull = data ? data.currentCount >= data.maxSeats : false;

  return (
    <PageEnter style={{ maxWidth: 800 }}>
      {/* 상단: 통계 칩 + 액션 버튼 */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-md border">
            <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest">현재 멤버</div>
            <div className="text-sm font-semibold mt-0.5">
              {data ? (
                <>
                  <span className={seatFull ? 'text-destructive' : 'text-success'}>{data.currentCount}</span>
                  <span className="text-muted-foreground"> / {data.maxSeats}명</span>
                </>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-md border">
            <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest">빈 좌석</div>
            <div className="text-sm font-semibold mt-0.5">
              {data ? (
                <span className={emptySeats === 0 ? 'text-destructive' : ''}>{emptySeats}명</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-md border">
            <div className="text-[0.73rem] font-semibold text-muted-foreground uppercase tracking-widest">내 역할</div>
            <div className="text-sm font-semibold mt-0.5">{myRoleLabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCreateInvite} disabled={creatingInvite || seatFull}>
            {creatingInvite
              ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              : <Plus className="w-4 h-4 mr-1" />}
            초대 코드 생성
          </Button>
          <Button variant="outline" size="sm" onClick={loadMembers} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1" />
            새로고침
          </Button>
        </div>
      </div>

      {/* 초대 코드 — Alert 배너 */}
      {inviteCode && (
        <Alert className="relative mb-4 pr-10">
          <Ticket className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-medium">초대 코드가 생성되었습니다</span>
              <Input
                value={inviteCode}
                readOnly
                className="w-[220px] font-mono text-center h-8"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteCode);
                  toast.success('초대 코드가 복사되었습니다.');
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                복사
              </Button>
              <span className="text-xs text-muted-foreground">7일간 유효</span>
            </div>
          </AlertDescription>
          <button
            type="button"
            onClick={() => setInviteCode('')}
            aria-label="초대 코드 닫기"
            className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </Alert>
      )}

      {/* 테이블 영역 */}
      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : (
        <div className="rounded-xl overflow-hidden border bg-card">
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
              {!data || data.members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <span className="text-muted-foreground">멤버가 없습니다</span>
                  </TableCell>
                </TableRow>
              ) : (
                data.members.map((member) => {
                  const isMe = member.userId === currentUserId;
                  const canRemove = member.role !== 'owner' && !isMe;
                  return (
                    <TableRow key={member.userId}>
                      <TableCell>
                        <span>{member.email}</span>
                        {isMe && (
                          <Badge variant="outline" className="ml-2">나</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                          {ORG_ROLE_LABELS[member.role] || member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(member.createdAt)}</TableCell>
                      <TableCell>
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveTarget(member)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`${member.email} 제거`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? '제거 중...' : '제거'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageEnter>
  );
}
