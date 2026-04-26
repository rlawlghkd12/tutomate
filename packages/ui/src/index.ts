// UI primitives (shadcn)
export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';
export { Badge, badgeVariants } from './components/ui/badge';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './components/ui/card';
export { Checkbox } from './components/ui/checkbox';
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from './components/ui/dialog';
export {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
  AlertDialogTrigger,
} from './components/ui/alert-dialog';
export { Input } from './components/ui/input';
export { Progress } from './components/ui/progress';
export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
export { Separator } from './components/ui/separator';
export { Switch } from './components/ui/switch';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableFooter } from './components/ui/table';
export { Textarea } from './components/ui/textarea';
export { Skeleton } from './components/ui/skeleton';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './components/ui/tooltip';
export { Popover, PopoverTrigger, PopoverContent } from './components/ui/popover';
export { DatePicker } from './components/ui/date-picker';
export type { DatePickerProps } from './components/ui/date-picker';
export { RevenueBreakdownTooltip } from './components/revenue/RevenueBreakdownTooltip';
export {
  Command, CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandShortcut, CommandSeparator,
} from './components/ui/command';

// Common components
export { ErrorBoundary, withErrorBoundary } from './components/common/ErrorBoundary';
export { default as Layout } from './components/common/Layout';
export { default as LockScreen } from './components/common/LockScreen';
export { default as Navigation } from './components/common/Navigation';
export { UpdateChecker, useUpdateChecker } from './components/common/UpdateChecker';
export { PageEnter } from './components/common/PageEnter';
export { TableSkeleton } from './components/common/TableSkeleton';
export { showSwitchOverlay, hideSwitchOverlay } from './components/common/switchOverlay';

// Chart components
export { CourseRevenueChart } from './components/charts/CourseRevenueChart';
export { MonthlyRevenueChart } from './components/charts/MonthlyRevenueChart';
export { PaymentStatusChart } from './components/charts/PaymentStatusChart';

// Course components
export { default as CourseForm } from './components/courses/CourseForm';
export { default as CourseList } from './components/courses/CourseList';

// Notification components
export { NotificationCenter } from './components/notification/NotificationCenter';

// Payment components
export { default as BulkPaymentForm } from './components/payment/BulkPaymentForm';
export { default as MonthlyPaymentTable } from './components/payment/MonthlyPaymentTable';
export { default as PaymentForm } from './components/payment/PaymentForm';
export { default as PaymentManagementTable } from './components/payment/PaymentManagementTable';

// Search components
export { GlobalSearch, useGlobalSearch } from './components/search/GlobalSearch';

// Settings components
export { default as AdminTab } from './components/settings/AdminTab';

// Member components
export { MemberManagementPage } from './components/members/MemberManagementPage';

// Student components
export { default as EnrollmentForm } from './components/students/EnrollmentForm';
export { default as StudentForm } from './components/students/StudentForm';
export { default as StudentList } from './components/students/StudentList';
