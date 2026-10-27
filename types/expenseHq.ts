import { ExpenseCategoryKey, PaymentMethod } from '@/utils/expense';

export type HqExpenseStatus = '검수 대기' | '승인 완료' | '금액 확인' | '반려';

export interface HqExpenseRecord {
  id: string;
  no: number;
  submittedAt: string; // e.g. "10/24 14:30"
  submittedDate: string; // e.g. "2024. 10. 24"
  rawDate: string; // "2024-10-24"
  time: string; // "14:30"
  driverName: string;
  vehicleModel: string;
  vehiclePlate: string;
  customerName?: string; // e.g. "Ferrari", "BMW Korea", "CHANEL", "신세계그룹"
  customerId?: string; // e.g. "cust-ferrari"
  category: ExpenseCategoryKey;
  categoryLabel: string; // e.g. "주유비", "통행료"
  merchant: string;
  address?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  status: HqExpenseStatus;
  receiptUrl?: string;
  hasReceiptImage: boolean;
  memo?: string;
  ocrExtracted?: boolean;
  ocrSummary?: string;
  ocrDetails?: {
    merchantName: string;
    bizNo?: string;
    phone?: string;
    address?: string;
    paymentTime?: string;
    cardName?: string;
    cardNumber?: string;
    approvalNo?: string;
    items?: {
      name: string;
      unitPrice: number;
      qty: number;
      amount: number;
    }[];
    subtotal?: number;
    vat?: number;
    total?: number;
  };
  reviewNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface HqExpenseKpiSummary {
  todayTotal: number;
  monthTotal: number;
  pendingCount: number;
  approvedCount: number;
  actionNeededCount: number;
  totalCount: number;
}
